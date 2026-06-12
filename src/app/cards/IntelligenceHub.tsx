import React, { useEffect, useMemo, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  EmptyState,
  Flex,
  Box,
  Divider,
  Tag,
  StatusTag,
  Statistics,
  StatisticsItem,
  Tabs,
  Tab,
  List,
  Accordion,
} from "@hubspot/ui-extensions";

hubspot.extend(() => <IntelligenceHubCard />);

interface Signal {
  type: string;
  label: string;
  quote: string;
  speaker: string;
  timestamp: string;
  importance: "high" | "medium" | "low";
}
interface Chapter { time: string; title: string; }

const SIGNAL_LABEL: Record<string, string> = {
  buying_signal: "Buying intent",
  pain_point: "Pain point",
  objection: "Objection",
  key_question: "Key question",
  action_item: "Action item",
  competitor: "Competitor",
  timeline: "Timeline",
  decision_maker: "Decision maker",
};

const SIGNAL_VARIANT: Record<string, "success" | "danger" | "warning" | "info" | "default"> = {
  buying_signal: "success",
  pain_point: "warning",
  objection: "danger",
  key_question: "info",
  action_item: "success",
  competitor: "danger",
  timeline: "warning",
  decision_maker: "info",
};

function parseSentiment(short: string): { label: string; reason: string } | null {
  const m = short.match(/Sentiment:\*?\s*(?:🌱|🌤️|🌧️)?\s*(positive|neutral|at-risk)\s*[—-]?\s*([^\n]*)/i);
  if (!m) return null;
  return { label: m[1].toLowerCase(), reason: m[2].replace(/\*/g, "").trim() };
}

function computeScore(signals: Signal[], sentiment: string | null): number {
  let score = 50;
  const w: Record<string, number> = { high: 1.5, medium: 1, low: 0.5 };
  for (const s of signals) {
    const k = w[s.importance] ?? 1;
    if (s.type === "buying_signal") score += 8 * k;
    else if (s.type === "timeline") score += 4 * k;
    else if (s.type === "decision_maker") score += 3 * k;
    else if (s.type === "action_item") score += 2 * k;
    else if (s.type === "pain_point") score += 2 * k;
    else if (s.type === "objection") score -= 6 * k;
    else if (s.type === "competitor") score -= 3 * k;
  }
  if (sentiment === "positive") score += 8;
  if (sentiment === "at-risk") score -= 10;
  return Math.max(5, Math.min(95, Math.round(score)));
}

function scoreText(score: number): string {
  if (score >= 70) return "Strong";
  if (score >= 55) return "Promising";
  if (score >= 40) return "Neutral";
  return "At risk";
}

/** Render Slack-mrkdwn-ish text as Text lines (bold markers stripped) */
function SummaryLines({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <Flex direction="column" gap="extra-small">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const clean = t.replace(/\*/g, "");
        const isHeader = /^\*[^*]+\*:?\s*$/.test(t) || /^(🏷️|⚡|📝|✅|📡|🧭)/.test(t);
        return (
          <Text key={i} format={isHeader ? { fontWeight: "bold" } : undefined}>
            {clean}
          </Text>
        );
      })}
    </Flex>
  );
}

const IntelligenceHubCard = () => {
  const { actions } = useExtensionApi<"crm.record.tab">();
  const [props, setProps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    actions
      .fetchCrmObjectProperties([
        "call_summary_short",
        "call_summary_extended",
        "call_signals",
        "call_chapters",
        "transcript_timed",
      ])
      .then(setProps)
      .finally(() => setLoading(false));
  }, []);

  const signals = useMemo<Signal[]>(() => {
    try { return JSON.parse(props.call_signals || "[]"); } catch { return []; }
  }, [props.call_signals]);

  const chapters = useMemo<Chapter[]>(() => {
    try { return JSON.parse(props.call_chapters || "[]"); } catch { return []; }
  }, [props.call_chapters]);

  const short = props.call_summary_short || "";
  const extended = props.call_summary_extended || "";

  const sentiment = useMemo(() => parseSentiment(short), [short]);
  const score = useMemo(() => computeScore(signals, sentiment?.label ?? null), [signals, sentiment]);

  const durationMin = useMemo(() => {
    const t = props.transcript_timed || "";
    const matches = t.match(/\[(\d{2}):(\d{2})\]/g);
    if (!matches || matches.length === 0) return null;
    const last = matches[matches.length - 1].match(/\[(\d{2}):(\d{2})\]/);
    if (!last) return null;
    return Math.max(1, Math.round((parseInt(last[1]) * 60 + parseInt(last[2])) / 60));
  }, [props.transcript_timed]);

  const highCount = signals.filter(s => s.importance === "high").length;

  if (loading) {
    return <Flex direction="column" align="center" justify="center"><LoadingSpinner label="Loading intelligence…" /></Flex>;
  }

  if (!short && signals.length === 0 && chapters.length === 0) {
    return (
      <EmptyState title="No intelligence yet" layout="vertical">
        <Text>This recording hasn't been processed yet — intelligence appears a few minutes after the call.</Text>
      </EmptyState>
    );
  }

  const sentimentDisplay = sentiment
    ? `${sentiment.label === "positive" ? "🌱" : sentiment.label === "at-risk" ? "🌧️" : "🌤️"} ${sentiment.label.charAt(0).toUpperCase() + sentiment.label.slice(1)}`
    : "—";

  return (
    <Flex direction="column" gap="medium">
      <Statistics>
        <StatisticsItem label="Call score" number={String(score)}>
          <Tag variant={score >= 55 ? "success" : score >= 40 ? "warning" : "error"}>{scoreText(score)}</Tag>
        </StatisticsItem>
        <StatisticsItem label="Sentiment" number={sentimentDisplay}>
          {sentiment?.reason ? <Text variant="microcopy">{sentiment.reason}</Text> : null}
        </StatisticsItem>
        <StatisticsItem label="Signals" number={String(signals.length)}>
          {highCount > 0 ? <Text variant="microcopy">{highCount} high impact</Text> : null}
        </StatisticsItem>
        <StatisticsItem label="Duration" number={durationMin ? `${durationMin} min` : "—"}>
          {chapters.length > 0 ? <Text variant="microcopy">{chapters.length} chapters</Text> : null}
        </StatisticsItem>
      </Statistics>

      <Divider />

      <Tabs defaultTab="summary">
        <Tab tabId="summary" title="Summary">
          <Flex direction="column" gap="small">
            {short
              ? <SummaryLines text={short} />
              : <Text variant="microcopy">No summary available.</Text>}
            {extended && (
              <Accordion title="Deep-dive notes" defaultOpen={false}>
                <SummaryLines text={extended} />
              </Accordion>
            )}
          </Flex>
        </Tab>

        <Tab tabId="signals" title={`Signals (${signals.length})`}>
          <Flex direction="column" gap="small">
            {signals.length === 0 && <Text variant="microcopy">No signals extracted.</Text>}
            {signals.map((s, i) => (
              <Box key={i}>
                <Flex direction="column" gap="extra-small">
                  <Flex direction="row" gap="extra-small" align="center" wrap="wrap">
                    <Tag variant={SIGNAL_VARIANT[s.type] ?? "default"}>
                      {SIGNAL_LABEL[s.type] ?? s.type}
                    </Tag>
                    {s.importance === "high" && <StatusTag variant="danger">High impact</StatusTag>}
                    <Text variant="microcopy">{s.timestamp}</Text>
                  </Flex>
                  <Text format={{ fontWeight: "bold" }}>{s.label}</Text>
                  {s.quote && (
                    <Text variant="microcopy">
                      “{s.quote.length > 200 ? `${s.quote.slice(0, 200)}…` : s.quote}” — {s.speaker}
                    </Text>
                  )}
                  {i < signals.length - 1 && <Divider />}
                </Flex>
              </Box>
            ))}
          </Flex>
        </Tab>

        <Tab tabId="chapters" title={`Chapters (${chapters.length})`}>
          <List variant="unordered-styleless">
            {chapters.map((c, i) => (
              <Text key={i}>
                <Text format={{ fontWeight: "bold" }} inline>{c.time}</Text>
                {"   "}{c.title}
              </Text>
            ))}
          </List>
        </Tab>
      </Tabs>
    </Flex>
  );
};
