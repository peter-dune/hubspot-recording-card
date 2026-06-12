"use client";

/**
 * Intelligence Hub — embedded inline in the HubSpot record tab (no popup).
 * Renders sentiment, call score, summaries, signals and chapters from the
 * recording object. Light theme to blend with the HubSpot card.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface Signal {
  type: string;
  label: string;
  quote: string;
  speaker: string;
  timestamp: string;
  importance: "high" | "medium" | "low";
}
interface Chapter { time: string; title: string; }
interface HubData {
  metadata: Record<string, string>;
  signals: Signal[];
  chapters: Chapter[];
  segments: { speaker: string; text: string; startsAt: number; endsAt: number }[];
}

const ACCENT = "#f4603e";
const INK = "#16181d";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG_SOFT = "#f8f9fb";

const SIGNAL_META: Record<string, { label: string; color: string; bg: string }> = {
  buying_signal: { label: "Buying intent", color: "#0f6e56", bg: "#e1f5ee" },
  pain_point:    { label: "Pain point",    color: "#993c1d", bg: "#faece7" },
  objection:     { label: "Objection",     color: "#a32d2d", bg: "#fcebeb" },
  key_question:  { label: "Key question",  color: "#185fa5", bg: "#e6f1fb" },
  action_item:   { label: "Action item",   color: "#3b6d11", bg: "#eaf3de" },
  competitor:    { label: "Competitor",    color: "#723e99", bg: "#f1eafb" },
  timeline:      { label: "Timeline",      color: "#854f0b", bg: "#faeeda" },
  decision_maker:{ label: "Decision maker",color: "#993556", bg: "#fbeaf0" },
};

function parseSentiment(short: string): { icon: string; label: string; reason: string } | null {
  const m = short.match(/Sentiment:\*?\s*(🌱|🌤️|🌧️)\s*(positive|neutral|at-risk)\s*[—-]?\s*([^\n]*)/i);
  if (!m) return null;
  return { icon: m[1], label: m[2], reason: m[3].replace(/\*/g, "").trim() };
}

function computeScore(signals: Signal[], sentimentLabel: string | null): number {
  let score = 50;
  const w: Record<string, number> = { high: 1.5, medium: 1, low: 0.5 };
  for (const s of signals) {
    const k = w[s.importance] ?? 1;
    if (s.type === "buying_signal") score += 8 * k;
    else if (s.type === "timeline") score += 4 * k;
    else if (s.type === "decision_maker") score += 3 * k;
    else if (s.type === "action_item") score += 2 * k;
    else if (s.type === "objection") score -= 6 * k;
    else if (s.type === "competitor") score -= 3 * k;
    else if (s.type === "pain_point") score += 2 * k; // prospect pain = our opportunity
  }
  if (sentimentLabel === "positive") score += 8;
  if (sentimentLabel === "at-risk") score -= 10;
  return Math.max(5, Math.min(95, Math.round(score)));
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "Strong", color: "#0f6e56" };
  if (score >= 55) return { text: "Promising", color: "#3b6d11" };
  if (score >= 40) return { text: "Neutral", color: "#854f0b" };
  return { text: "At risk", color: "#a32d2d" };
}

/** Minimal Slack-mrkdwn → React: *bold*, • bullets, blank-line spacing */
function Mrkdwn({ text, size = 13.5 }: { text: string; size?: number }) {
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: size, lineHeight: 1.65, color: INK }}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 10 }} />;
        const parts = line.split(/(\*[^*]+\*)/g).map((p, j) =>
          p.startsWith("*") && p.endsWith("*")
            ? <strong key={j} style={{ fontWeight: 600 }}>{p.slice(1, -1)}</strong>
            : <span key={j}>{p}</span>
        );
        const isBullet = line.trim().startsWith("•");
        return (
          <div key={i} style={{ paddingLeft: isBullet ? 14 : 0, textIndent: isBullet ? -10 : 0, margin: "1px 0" }}>
            {parts}
          </div>
        );
      })}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, marginBottom: 12 }}>
      {children}
    </div>
  );
}

function HubContent() {
  const params = useSearchParams();
  const engagementId = params.get("engagementId") ?? "";
  const recordId = params.get("recordId") ?? "";
  const [data, setData] = useState<HubData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showExtended, setShowExtended] = useState(false);

  useEffect(() => {
    if (!engagementId) { setErr("Missing engagementId"); return; }
    const q = new URLSearchParams({ engagementId });
    if (recordId) q.set("recordId", recordId);
    fetch(`/api/recording-data?${q.toString()}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setErr("Failed to load intelligence data"));
  }, [engagementId, recordId]);

  const meta = data?.metadata ?? {};
  const short = meta.call_summary_short ?? "";
  const extended = meta.call_summary_extended ?? "";
  const signals = useMemo(() => (data?.signals ?? []) as Signal[], [data]);
  const chapters = data?.chapters ?? [];

  const sentiment = useMemo(() => parseSentiment(short), [short]);
  const score = useMemo(() => computeScore(signals, sentiment?.label ?? null), [signals, sentiment]);
  const sLabel = scoreLabel(score);

  const durationMin = useMemo(() => {
    const segs = data?.segments ?? [];
    if (segs.length === 0) return null;
    return Math.max(1, Math.round(segs[segs.length - 1].endsAt / 60000));
  }, [data]);

  const highSignals = signals.filter(s => s.importance === "high").length;

  if (err) return <div style={{ padding: 24, color: MUTED, fontFamily: "system-ui" }}>{err}</div>;
  if (!data) return (
    <div style={{ padding: 40, textAlign: "center", color: MUTED, fontFamily: "system-ui", fontSize: 13 }}>
      Loading intelligence…
    </div>
  );

  return (
    <div style={{ fontFamily: "'Helvetica Neue', system-ui, sans-serif", background: "transparent", padding: "4px 2px 24px", maxWidth: 1320, margin: "0 auto" }}>

      {/* ── Metric row ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Call score</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: sLabel.color }}>{score}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: sLabel.color }}>{sLabel.text}</span>
          </div>
          <div style={{ height: 4, background: BG_SOFT, borderRadius: 2, marginTop: 8 }}>
            <div style={{ height: 4, width: `${score}%`, background: sLabel.color, borderRadius: 2 }} />
          </div>
        </Card>

        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sentiment</div>
          {sentiment ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: INK, textTransform: "capitalize" }}>
                {sentiment.icon} {sentiment.label}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>{sentiment.reason}</div>
            </>
          ) : <div style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>—</div>}
        </Card>

        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Signals captured</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: INK }}>{signals.length}</span>
            {highSignals > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>{highSignals} high impact</span>
            )}
          </div>
        </Card>

        <Card style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Duration</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: INK }}>{durationMin ?? "—"}</span>
            {durationMin && <span style={{ fontSize: 13, color: MUTED }}>min · {chapters.length} chapters</span>}
          </div>
        </Card>
      </div>

      {/* ── Summary + Signals ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)", gap: 14, alignItems: "start" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <SectionTitle>Call summary</SectionTitle>
            {short
              ? <Mrkdwn text={short.replace(/^\*Participants:\*[^\n]*\n?/m, "")} />
              : <div style={{ fontSize: 13, color: MUTED }}>No summary yet — it appears after the call is processed.</div>}
            {extended && (
              <>
                <button
                  onClick={() => setShowExtended(v => !v)}
                  style={{
                    marginTop: 14, border: `1px solid ${BORDER}`, background: showExtended ? BG_SOFT : "#fff",
                    borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, color: INK, cursor: "pointer",
                  }}
                >
                  {showExtended ? "Hide deep-dive notes ↑" : "Show deep-dive notes ↓"}
                </button>
                {showExtended && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                    <Mrkdwn text={extended} size={13} />
                  </div>
                )}
              </>
            )}
          </Card>

          {chapters.length > 0 && (
            <Card>
              <SectionTitle>Chapters</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {chapters.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "7px 0", borderTop: i > 0 ? `1px solid ${BG_SOFT}` : "none" }}>
                    <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: ACCENT, fontWeight: 700, minWidth: 42 }}>{c.time}</span>
                    <span style={{ fontSize: 13.5, color: INK }}>{c.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Card>
          <SectionTitle>Signals</SectionTitle>
          {signals.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>No signals extracted.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {signals.map((s, i) => {
              const m = SIGNAL_META[s.type] ?? { label: s.type, color: MUTED, bg: BG_SOFT };
              return (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${m.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: m.color, background: m.bg, padding: "2px 8px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                      {s.importance === "high" && <span style={{ color: ACCENT, fontWeight: 700 }}>●&nbsp;</span>}
                      {s.timestamp}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 6 }}>{s.label}</div>
                  {s.quote && (
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
                      “{s.quote.length > 160 ? s.quote.slice(0, 160) + "…" : s.quote}” — {s.speaker}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function HubPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#6b7280", fontFamily: "system-ui", fontSize: 13 }}>Loading…</div>}>
      <HubContent />
    </Suspense>
  );
}
