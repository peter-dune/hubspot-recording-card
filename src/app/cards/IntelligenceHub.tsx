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
  Accordion,
  Tile,
  Heading,
  Tooltip,
  Button,
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

function computeScore(signals: Signal[], sentiment: string | null): { score: number; drivers: string[] } {
  let score = 50;
  const drivers: { delta: number; text: string }[] = [];
  const w: Record<string, number> = { high: 1.5, medium: 1, low: 0.5 };
  const counts: Record<string, number> = {};
  for (const s of signals) {
    const k = w[s.importance] ?? 1;
    let d = 0;
    if (s.type === "buying_signal") d = 8 * k;
    else if (s.type === "timeline") d = 4 * k;
    else if (s.type === "decision_maker") d = 3 * k;
    else if (s.type === "action_item") d = 2 * k;
    else if (s.type === "pain_point") d = 2 * k;
    else if (s.type === "objection") d = -6 * k;
    else if (s.type === "competitor") d = -3 * k;
    score += d;
    counts[s.type] = (counts[s.type] ?? 0) + 1;
  }
  if (counts.buying_signal) drivers.push({ delta: 1, text: `${counts.buying_signal} buying signal${counts.buying_signal > 1 ? "s" : ""}` });
  if (counts.objection) drivers.push({ delta: -1, text: `${counts.objection} objection${counts.objection > 1 ? "s" : ""}` });
  if (counts.competitor) drivers.push({ delta: -1, text: `competitor mentioned` });
  if (counts.timeline) drivers.push({ delta: 1, text: `timeline discussed` });
  if (sentiment === "positive") { score += 8; drivers.push({ delta: 1, text: "positive sentiment" }); }
  if (sentiment === "at-risk") { score -= 10; drivers.push({ delta: -1, text: "at-risk sentiment" }); }
  return {
    score: Math.max(5, Math.min(95, Math.round(score))),
    drivers: drivers.slice(0, 3).map(d => `${d.delta > 0 ? "▲" : "▼"} ${d.text}`),
  };
}

function scoreTone(score: number): { text: string; variant: "success" | "warning" | "error" } {
  if (score >= 70) return { text: "Strong", variant: "success" };
  if (score >= 55) return { text: "Promising", variant: "success" };
  if (score >= 40) return { text: "Mixed", variant: "warning" };
  return { text: "At risk", variant: "error" };
}

/** Pull TL;DR bullets out of the extended summary */
function extractTldr(extended: string): string[] {
  const m = extended.match(/\*TL;DR\*\s*\n([\s\S]*?)(?:\n\s*\n|$)/);
  if (!m) return [];
  return m[1].split("\n").map(l => l.replace(/^•\s*/, "").replace(/\*/g, "").trim()).filter(Boolean);
}

/** Pull Open questions bullets out of the extended summary */
function extractOpenQuestions(extended: string): string[] {
  const m = extended.match(/\*Open questions\*\s*\n([\s\S]*?)(?:\n\s*\n|$)/);
  if (!m) return [];
  return m[1].split("\n").map(l => l.replace(/^•\s*/, "").replace(/\*/g, "").trim()).filter(Boolean);
}

/** Pull Action items grouped by person from the extended summary */
function extractActionItems(extended: string): { person: string; items: string[] }[] {
  const m = extended.match(/\*Action items\*\s*\n([\s\S]*?)(?=\n(?:📡|🧭|\*Key signals\*|\*Open questions\*)|$)/);
  if (!m) return [];
  const out: { person: string; items: string[] }[] = [];
  let current: { person: string; items: string[] } | null = null;
  for (const raw of m[1].split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("•")) {
      current?.items.push(line.replace(/^•\s*/, "").replace(/\*/g, "").trim());
    } else {
      if (current && current.items.length) out.push(current);
      current = { person: line.replace(/\*/g, "").replace(/:$/, "").trim(), items: [] };
    }
  }
  if (current && current.items.length) out.push(current);
  return out;
}

function SummaryLines({ text }: { text: string }) {
  return (
    <Flex direction="column" gap="extra-small">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const clean = t.replace(/\*/g, "");
        const isHeader = /^\*[^*]+\*:?\s*$/.test(t) || /^(🏷️|⚡|📝|✅|📡|🧭)/.test(t);
        return (
          <Text key={i} format={isHeader ? { fontWeight: "bold" } : undefined}>{clean}</Text>
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
        "call_summary_short", "call_summary_extended",
        "call_signals", "transcript_timed",
        "participants", "participants_emails",
        "call_score",
      ])
      .then(setProps)
      .finally(() => setLoading(false));
  }, []);

  const signals = useMemo<Signal[]>(() => {
    try { return JSON.parse(props.call_signals || "[]"); } catch { return []; }
  }, [props.call_signals]);

  const short = props.call_summary_short || "";
  const extended = props.call_summary_extended || "";

  // Internal Dune members: head of participants list with @dune.com emails
  const internalNames = useMemo(() => {
    const names = (props.participants || "").split(",").map(s => s.trim()).filter(Boolean);
    const emails = (props.participants_emails || "").split(",").map(s => s.trim()).filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < names.length && i < emails.length; i++) {
      if (emails[i].toLowerCase().endsWith("@dune.com")) out.push(names[i]);
      else break;
    }
    return out;
  }, [props.participants, props.participants_emails]);

  const isInternal = (speaker: string) =>
    internalNames.some(n => n.toLowerCase().split(" ")[0] === (speaker || "").toLowerCase().split(" ")[0]);

  const sentiment = useMemo(() => parseSentiment(short), [short]);

  // GPT-scored with rationale when available; heuristic fallback otherwise
  const gptScore = useMemo<{ score: number; label: string; rationale: string } | null>(() => {
    try {
      const p = JSON.parse(props.call_score || "");
      return typeof p.score === "number" ? p : null;
    } catch { return null; }
  }, [props.call_score]);

  const heuristic = useMemo(() => computeScore(signals, sentiment?.label ?? null), [signals, sentiment]);
  const score = gptScore?.score ?? heuristic.score;
  const drivers = gptScore ? [] : heuristic.drivers;
  const rationale = gptScore?.rationale ?? "";
  const tone = scoreTone(score);

  const durationMin = useMemo(() => {
    const matches = (props.transcript_timed || "").match(/\[(\d{2}):(\d{2})\]/g);
    if (!matches?.length) return null;
    const last = matches[matches.length - 1].match(/\[(\d{2}):(\d{2})\]/);
    return last ? Math.max(1, Math.round((parseInt(last[1]) * 60 + parseInt(last[2])) / 60)) : null;
  }, [props.transcript_timed]);

  const tldr = useMemo(() => extractTldr(extended), [extended]);
  const openQuestions = useMemo(() => extractOpenQuestions(extended), [extended]);
  const actionItems = useMemo(() => extractActionItems(extended), [extended]);

  const moneyQuotes = useMemo(
    () => signals.filter(s => /[$€£]\s?\d|\d+\s?[kK]\b|\d+%/.test(s.quote || "")),
    [signals]
  );
  const risks = useMemo(
    () => signals.filter(s => s.type === "objection" || s.type === "competitor"),
    [signals]
  );
  const decisionProcess = useMemo(
    () => signals.filter(s => s.type === "decision_maker" || s.type === "timeline"),
    [signals]
  );

  if (loading) {
    return <Flex direction="column" align="center" justify="center"><LoadingSpinner label="Loading intelligence…" /></Flex>;
  }

  if (!short && signals.length === 0) {
    return (
      <EmptyState title="No intelligence yet" layout="vertical">
        <Text>This recording hasn't been processed yet — intelligence appears a few minutes after the call.</Text>
      </EmptyState>
    );
  }

  const sentimentDisplay = sentiment
    ? `${sentiment.label === "positive" ? "🌱" : sentiment.label === "at-risk" ? "🌧️" : "🌤️"} ${sentiment.label.charAt(0).toUpperCase() + sentiment.label.slice(1)}`
    : "—";

  const duneItems = actionItems.filter(a => isInternal(a.person));
  const customerItems = actionItems.filter(a => !isInternal(a.person));

  return (
    <Flex direction="column" gap="medium">
      {/* ── Call score — front and center ── */}
      <Tile>
        <Flex direction="column" gap="extra-small">
          <Flex direction="row" gap="extra-small" align="center">
            <Text format={{ fontWeight: "bold" }} variant="microcopy">CALL SCORE</Text>
            <Button
              variant="transparent"
              size="extra-small"
              onClick={() => {}}
              overlay={
                <Tooltip placement="bottom">
                  AI-scored from the transcript across four dimensions, 0–25 each: buying intent, decision path (right people + clear approvals), momentum (commitments with owners and dates), and risk (objections, competitors, budget). Judged from the customer's words, weighing how the call ended.
                </Tooltip>
              }
            >
              ⓘ
            </Button>
          </Flex>
          <Flex direction="row" gap="small" align="center">
            <Heading>{String(score)} / 100</Heading>
            <Tag variant={tone.variant === "error" ? "error" : tone.variant}>{gptScore?.label || tone.text}</Tag>
          </Flex>
          {rationale
            ? <Text>{rationale}</Text>
            : drivers.length > 0 && <Text variant="microcopy">{drivers.join("   ")}</Text>}
        </Flex>
      </Tile>

      {/* ── Health row ── */}
      <Statistics>
        <StatisticsItem label="Sentiment" number={sentimentDisplay}>
          {sentiment?.reason ? <Text variant="microcopy">{sentiment.reason}</Text> : null}
        </StatisticsItem>
        <StatisticsItem label="Signals" number={String(signals.length)}>
          <Text variant="microcopy">{signals.filter(s => s.importance === "high").length} high impact</Text>
        </StatisticsItem>
        <StatisticsItem label="Duration" number={durationMin ? `${durationMin} min` : "—"} />
      </Statistics>

      <Divider />

      {/* ── TL;DR ── */}
      {tldr.length > 0 && (
        <Tile>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "bold" }}>⚡ TL;DR</Text>
            {tldr.map((b, i) => <Text key={i}>• {b}</Text>)}
          </Flex>
        </Tile>
      )}

      {/* ── Commitments ── */}
      {(duneItems.length > 0 || customerItems.length > 0) && (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>✅ Commitments</Text>
            <Flex direction="row" gap="medium" wrap="wrap">
              {duneItems.length > 0 && (
                <Box flex={1}>
                  <Flex direction="column" gap="extra-small">
                    <Tag>Dune owes</Tag>
                    {duneItems.map((a, i) => (
                      <Flex key={i} direction="column" gap="extra-small">
                        <Text format={{ fontWeight: "bold" }} variant="microcopy">{a.person}</Text>
                        {a.items.map((it, j) => <Text key={j}>• {it}</Text>)}
                      </Flex>
                    ))}
                  </Flex>
                </Box>
              )}
              {customerItems.length > 0 && (
                <Box flex={1}>
                  <Flex direction="column" gap="extra-small">
                    <Tag variant="success">Customer owes</Tag>
                    {customerItems.map((a, i) => (
                      <Flex key={i} direction="column" gap="extra-small">
                        <Text format={{ fontWeight: "bold" }} variant="microcopy">{a.person}</Text>
                        {a.items.map((it, j) => <Text key={j}>• {it}</Text>)}
                      </Flex>
                    ))}
                  </Flex>
                </Box>
              )}
            </Flex>
          </Flex>
        </Tile>
      )}

      {/* ── Money quotes ── */}
      {moneyQuotes.length > 0 && (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>💰 Money on the table</Text>
            {moneyQuotes.map((s, i) => (
              <Flex key={i} direction="column" gap="extra-small">
                <Flex direction="row" gap="extra-small" align="center">
                  <Tag variant={SIGNAL_VARIANT[s.type] ?? "default"}>{SIGNAL_LABEL[s.type] ?? s.type}</Tag>
                  <Text variant="microcopy">{s.timestamp} · {s.speaker}</Text>
                </Flex>
                <Text>“{s.quote}”</Text>
                {i < moneyQuotes.length - 1 && <Divider distance="small" />}
              </Flex>
            ))}
          </Flex>
        </Tile>
      )}

      {/* ── Risks ── */}
      {risks.length > 0 && (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>⚠️ Risks & objections</Text>
            {risks.map((s, i) => (
              <Flex key={i} direction="column" gap="extra-small">
                <Flex direction="row" gap="extra-small" align="center">
                  <Tag variant="error">{SIGNAL_LABEL[s.type] ?? s.type}</Tag>
                  {s.importance === "high" && <StatusTag variant="danger">High</StatusTag>}
                  <Text variant="microcopy">{s.timestamp} · {s.speaker}</Text>
                </Flex>
                <Text format={{ fontWeight: "bold" }}>{s.label}</Text>
                {s.quote && <Text variant="microcopy">“{s.quote}”</Text>}
                {i < risks.length - 1 && <Divider distance="small" />}
              </Flex>
            ))}
          </Flex>
        </Tile>
      )}

      {/* ── Decision process ── */}
      {decisionProcess.length > 0 && (
        <Tile>
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: "bold" }}>🧭 Decision process & timeline</Text>
            {decisionProcess.map((s, i) => (
              <Flex key={i} direction="column" gap="extra-small">
                <Flex direction="row" gap="extra-small" align="center">
                  <Tag variant={SIGNAL_VARIANT[s.type] ?? "default"}>{SIGNAL_LABEL[s.type] ?? s.type}</Tag>
                  <Text variant="microcopy">{s.timestamp} · {s.speaker}</Text>
                </Flex>
                <Text>{s.label}{s.quote ? ` — “${s.quote}”` : ""}</Text>
                {i < decisionProcess.length - 1 && <Divider distance="small" />}
              </Flex>
            ))}
          </Flex>
        </Tile>
      )}

      {/* ── Open questions ── */}
      {openQuestions.length > 0 && (
        <Tile>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: "bold" }}>❓ Open questions</Text>
            {openQuestions.map((q, i) => <Text key={i}>• {q}</Text>)}
          </Flex>
        </Tile>
      )}

      {/* ── Everything else, collapsed ── */}
      <Accordion title={`All signals (${signals.length})`} defaultOpen={false}>
        <Flex direction="column" gap="small">
          {signals.map((s, i) => (
            <Flex key={i} direction="column" gap="extra-small">
              <Flex direction="row" gap="extra-small" align="center" wrap="wrap">
                <Tag variant={SIGNAL_VARIANT[s.type] ?? "default"}>{SIGNAL_LABEL[s.type] ?? s.type}</Tag>
                {s.importance === "high" && <StatusTag variant="danger">High</StatusTag>}
                <Text variant="microcopy">{s.timestamp} · {s.speaker}</Text>
              </Flex>
              <Text format={{ fontWeight: "bold" }}>{s.label}</Text>
              {s.quote && <Text variant="microcopy">“{s.quote.length > 200 ? `${s.quote.slice(0, 200)}…` : s.quote}”</Text>}
              {i < signals.length - 1 && <Divider />}
            </Flex>
          ))}
        </Flex>
      </Accordion>

      {extended && (
        <Accordion title="Full call notes" defaultOpen={false}>
          <SummaryLines text={extended} />
        </Accordion>
      )}
    </Flex>
  );
};
