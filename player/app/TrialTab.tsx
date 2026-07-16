"use client";

/**
 * Trial tab — Dune-specific trial intelligence (NOT BANT):
 *  - Trial Impact: is the trial actually moving the deal? (score / sentiment /
 *    Fit-Usage before the trial vs during/after — computed from the timeline)
 *  - Trial Scorecard (latest trial call, Opus): Activation, Use-case progress,
 *    Data fit, Team engagement, Conversion intent + verdict/blockers/actions
 *  - Trial call list
 * Loud, unmissable empty state when the deal has no trial calls.
 */

import { useEffect, useState } from "react";
import { DimBar, Point, Dim, SENT_COLOR, scoreColor } from "./intel";

interface Trial {
  health: number; verdict: string; blockers: string[]; next_actions: string[];
  dimensions: Record<string, Dim>;
}
type TPoint = Point & { trial?: Trial | null };

const TRIAL_DIMS: { key: string; label: string }[] = [
  { key: "activation", label: "Activation" },
  { key: "use_case_progress", label: "Use-case progress" },
  { key: "data_fit", label: "Data fit" },
  { key: "team_engagement", label: "Team engagement" },
  { key: "conversion_intent", label: "Conversion intent" },
];

const isTrialCall = (p: TPoint) => !!p.trial || /trial|evaluation/i.test(p.stage);

export default function TrialTab({ recordId }: { recordId: string | null }) {
  const [points, setPoints] = useState<TPoint[] | null>(null);
  const [dealName, setDealName] = useState("");
  const [scope, setScope] = useState("deal");

  useEffect(() => {
    if (!recordId) return;
    fetch(`/api/deal-sentiment?recordId=${recordId}`).then(r => r.json())
      .then(d => { setDealName(d.dealName || ""); setScope(d.scope || "deal"); setPoints(d.points || []); })
      .catch(() => setPoints([]));
  }, [recordId]);

  if (!points) return <Center><p style={mono}>Loading trial intelligence…</p></Center>;

  const sorted = [...points].sort((a, b) => a.dateMs - b.dateMs);
  const trialCalls = sorted.filter(isTrialCall);

  // ── LOUD empty state ──
  if (trialCalls.length === 0) {
    return (
      <Center>
        <div style={{ maxWidth: 560, textAlign: "center", border: "2px dashed var(--border-strong)", borderRadius: 16, padding: "40px 36px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🧪</div>
          <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "var(--text-primary)" }}>No trial on this {scope === "company" ? "account" : "deal"}</h3>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            None of the {sorted.length || "recorded"} processed call{sorted.length === 1 ? "" : "s"} on {dealName || "this deal"} is a trial or evaluation call.
            Either no trial has started yet — or the trial conversations aren't being recorded. If a trial <em>is</em> running, that's a visibility gap worth fixing.
          </p>
        </div>
      </Center>
    );
  }

  const withScorecard = trialCalls.filter(p => p.trial);
  const latest = withScorecard[withScorecard.length - 1] || null;
  const impact = computeImpact(sorted, trialCalls);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 26px 36px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#fff", background: "#7f77dd", borderRadius: 99, padding: "4px 11px" }}>🧪 TRIAL</span>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: "var(--text-primary)" }}>{dealName || "Trial"}</h2>
          <span style={mono}>{trialCalls.length} trial call{trialCalls.length > 1 ? "s" : ""}</span>
        </div>

        {/* ── Trial Impact ── */}
        <Card>
          <Lbl>Trial impact — is the trial moving the deal?</Lbl>
          {impact ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 10 }}>
              <ImpactStat label="Deal score" before={impact.scoreBefore} after={impact.scoreAfter} fmt={v => `${v}`} />
              <ImpactStat label="Fit / Usage" before={impact.fitBefore} after={impact.fitAfter} fmt={v => `${v}/20`} />
              <div>
                <div style={statLbl}>Sentiment through trial</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, color: SENT_COLOR[impact.lastSentiment] || "var(--text-primary)" }}>{impact.sentimentArc}</div>
              </div>
              <div>
                <div style={statLbl}>Read</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)", marginTop: 4 }}>{impact.read}</div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
              All of this deal&apos;s recorded calls are trial calls — there&apos;s no pre-trial baseline to compare against yet. Impact will appear once the deal has calls on both sides of the trial.
            </p>
          )}
        </Card>

        {/* ── Trial Scorecard (latest) ── */}
        {latest && latest.trial ? (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <Lbl>Trial scorecard · {latest.title} ({latest.dateLabel})</Lbl>
              <span style={{ fontSize: 13, fontWeight: 700, color: verdictColor(latest.trial.verdict) }}>
                {latest.trial.health}/100 — {latest.trial.verdict}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "16px 32px", marginTop: 14 }}>
              {TRIAL_DIMS.map(d => <DimBar key={d.key} label={d.label} d={latest.trial!.dimensions[d.key]} />)}
            </div>
            {(latest.trial.blockers.length > 0 || latest.trial.next_actions.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 24, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-weaker)" }}>
                <div>
                  <div style={statLbl}>Blockers</div>
                  {latest.trial.blockers.length === 0
                    ? <p style={li}>None surfaced 🎉</p>
                    : latest.trial.blockers.map((b, i) => <p key={i} style={{ ...li, color: "#e04b4a" }}>▲ {b}</p>)}
                </div>
                <div>
                  <div style={statLbl}>Next actions for Dune</div>
                  {latest.trial.next_actions.map((a, i) => <p key={i} style={li}>→ {a}</p>)}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <Lbl>Trial scorecard</Lbl>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "8px 0 0" }}>
              Trial calls found, but none have a scorecard yet — reprocess them to generate it.
            </p>
          </Card>
        )}

        {/* ── Trial call list ── */}
        <div>
          <Lbl>Trial calls ({trialCalls.length})</Lbl>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {trialCalls.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface-B)", border: "1px solid var(--border-weaker)" }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: SENT_COLOR[p.sentiment], flexShrink: 0 }} />
                <span style={{ ...mono, width: 52, flexShrink: 0 }}>{p.dateLabel || "—"}</span>
                <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                {p.trial && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: verdictColor(p.trial.verdict), flexShrink: 0 }}>{p.trial.health} · {p.trial.verdict}</span>}
                {p.score != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: scoreColor(p.score), width: 30, textAlign: "right", flexShrink: 0 }}>{p.score}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trial Impact: before vs during/after the first trial call ──
function computeImpact(all: TPoint[], trialCalls: TPoint[]) {
  const firstTrialMs = trialCalls[0].dateMs;
  const before = all.filter(p => p.dateMs < firstTrialMs && p.score != null);
  const after = all.filter(p => p.dateMs >= firstTrialMs && p.score != null);
  if (before.length === 0 || after.length === 0) return null;
  const avg = (arr: TPoint[], f: (p: TPoint) => number | null) => {
    const v = arr.map(f).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const fit = (p: TPoint) => { const d = p.dimensions?.fit_usage; return d && d.applicable ? d.score : null; };
  const scoreBefore = avg(before, p => p.score), scoreAfter = avg(after, p => p.score);
  const fitBefore = avg(before, fit), fitAfter = avg(after, fit);
  const lastSentiment = [...after].reverse().find(p => p.sentiment !== "unknown")?.sentiment || "unknown";
  const firstSentiment = before.find(p => p.sentiment !== "unknown")?.sentiment || "unknown";
  const sentimentArc = firstSentiment === lastSentiment ? `${cap(lastSentiment)} throughout` : `${cap(firstSentiment)} → ${cap(lastSentiment)}`;
  const dScore = (scoreAfter ?? 0) - (scoreBefore ?? 0);
  const dFit = fitBefore != null && fitAfter != null ? fitAfter - fitBefore : null;
  let read = "";
  if (dScore >= 5 || (dFit ?? 0) >= 3) read = "The trial is lifting the deal — qualification and product fit have both improved since it began.";
  else if (dScore <= -5 || (dFit ?? 0) <= -3) read = "The deal has weakened since the trial began — dig into the blockers before the trial ends.";
  else read = "The trial hasn't moved the deal much either way yet — push activation to convert engagement into evidence.";
  return { scoreBefore, scoreAfter, fitBefore, fitAfter, lastSentiment, sentimentArc, read };
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function verdictColor(v: string) {
  return /on track/i.test(v) ? "#1d9e75" : /progress/i.test(v) ? "#639922" : /stall/i.test(v) ? "#b0873d" : /risk/i.test(v) ? "#e04b4a" : "var(--text-secondary)";
}

function ImpactStat({ label, before, after, fmt }: { label: string; before: number | null; after: number | null; fmt: (v: number) => string }) {
  if (before == null || after == null) return null;
  const d = after - before;
  const col = d > 0 ? "#1d9e75" : d < 0 ? "#e04b4a" : "var(--text-secondary)";
  return (
    <div>
      <div style={statLbl}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{fmt(before)} → {fmt(after)}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{d > 0 ? `+${d}` : d}</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-disable)", marginTop: 2, fontFamily: "var(--font-mono)" }}>pre-trial avg → since trial start</div>
    </div>
  );
}

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disable)" };
const statLbl: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-disable)" };
const li: React.CSSProperties = { margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45, color: "var(--text-secondary)" };
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "16px 18px" }}>{children}</div>;
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", margin: 0 }}>{children}</p>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>{children}</div>;
}
