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
import { DimBar, Point, Dim, SENT_COLOR, SENT_LABEL, SENT_ICON, scoreColor, smoothPath } from "./intel";

interface Win { what: string; who: string; quote: string }
interface Friction { what: string; type: string; severity: string; owner: string; status: string; who: string; quote: string }
interface Ask { what: string; who: string }
interface Trial {
  health: number; verdict: string; blockers: string[]; next_actions: string[];
  dimensions: Record<string, Dim>;
  session_summary?: string; use_cases_tested?: string[];
  wins?: Win[]; friction?: Friction[]; asks?: Ask[];
  goal?: string; goal_progress?: string;
}
type TPoint = Point & { trial?: Trial | null };

const FRICTION_LABEL: Record<string, string> = {
  missing_data: "Missing data", data_quality: "Data quality", performance: "Performance",
  usability: "Usability", docs: "Docs", pricing: "Pricing", integration: "Integration", other: "Other",
};
const SEV_ORDER: Record<string, number> = { blocker: 0, major: 1, minor: 2 };
const SEV_COLOR: Record<string, string> = { blocker: "#e04b4a", major: "#ba7517", minor: "#9a9a9a" };

const TRIAL_DIMS: { key: string; label: string; color: string }[] = [
  { key: "activation", label: "Activation", color: "#f4603e" },
  { key: "use_case_progress", label: "Use-case progress", color: "#7f77dd" },
  { key: "data_fit", label: "Data fit", color: "#378add" },
  { key: "team_engagement", label: "Team engagement", color: "#639922" },
  { key: "conversion_intent", label: "Conversion intent", color: "#ba7517" },
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

        {/* ── State of the trial + Working / Not working / Asks ── */}
        {latest && latest.trial && (
          <>
            <Card>
              <Lbl>State of the trial · as of {latest.dateLabel}</Lbl>
              {latest.trial.session_summary && <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-primary)" }}>{latest.trial.session_summary}</p>}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
                {latest.trial.goal && (
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={statLbl}>Trial goal ({latest.trial.goal_progress || "unclear"})</div>
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, color: goalColor(latest.trial.goal_progress), fontStyle: "italic" }}>“{latest.trial.goal}”</p>
                  </div>
                )}
                {(latest.trial.use_cases_tested?.length ?? 0) > 0 && (
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={statLbl}>Use cases in play</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {latest.trial.use_cases_tested!.map((u, i) => <span key={i} style={chip}>{u}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
              {/* What's working */}
              <Card>
                <Lbl>✅ What&apos;s working</Lbl>
                {allWins(trialCalls).length === 0
                  ? <p style={li}>Nothing validated yet — that itself is a signal.</p>
                  : allWins(trialCalls).map((w, i) => (
                    <div key={i} style={{ marginTop: 10 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 }}>{w.what}</p>
                      {w.quote && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#1d9e75", lineHeight: 1.45, fontStyle: "italic" }}>“{w.quote}”{w.who ? ` — ${w.who}` : ""}</p>}
                    </div>
                  ))}
              </Card>
              {/* What's not */}
              <Card>
                <Lbl>⚠️ What&apos;s not working</Lbl>
                {allFriction(trialCalls).length === 0
                  ? <p style={li}>No friction surfaced 🎉</p>
                  : allFriction(trialCalls).map((f, i) => (
                    <div key={i} style={{ marginTop: 10, opacity: f.status === "resolved" ? 0.55 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ ...chip, color: SEV_COLOR[f.severity], borderColor: SEV_COLOR[f.severity] }}>{f.severity}</span>
                        <span style={chip}>{FRICTION_LABEL[f.type] || f.type}</span>
                        {f.owner === "dune" && <span style={{ ...chip, color: "#f4603e", borderColor: "#f4603e" }}>Dune to fix</span>}
                        {f.status === "recurring" && <span style={{ ...chip, color: "#e04b4a", borderColor: "#e04b4a", fontWeight: 700 }}>RECURRING</span>}
                        {f.status === "resolved" && <span style={chip}>resolved ✓</span>}
                      </div>
                      <p style={{ margin: "5px 0 0", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, textDecoration: f.status === "resolved" ? "line-through" : "none" }}>{f.what}</p>
                      {f.quote && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.45, fontStyle: "italic" }}>“{f.quote}”{f.who ? ` — ${f.who}` : ""}</p>}
                    </div>
                  ))}
              </Card>
            </div>

            {allAsks(trialCalls).length > 0 && (
              <Card>
                <Lbl>📋 Outstanding asks — what Dune owes</Lbl>
                {allAsks(trialCalls).map((a, i) => <p key={i} style={li}>→ {a.what}{a.who ? ` (asked by ${a.who})` : ""}</p>)}
              </Card>
            )}
          </>
        )}

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

        {/* ── Trial trends ── */}
        {trialCalls.length >= 2 && (
          <>
            <TrialSentimentChart points={trialCalls} currentId={recordId} />
            <TrialDimsChart points={trialCalls} currentId={recordId} />
          </>
        )}

        {/* ── Trial call list (click to jump) ── */}
        <TrialCallList points={trialCalls} currentId={recordId} />
      </div>
    </div>
  );
}

function TrialCallList({ points, currentId }: { points: TPoint[]; currentId: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const jump = (p: TPoint) => {
    if (p.id === currentId || !p.engagementId) return;
    const qs = new URLSearchParams({ engagementId: p.engagementId, recordId: p.id });
    window.location.href = `/?${qs.toString()}`;
  };
  return (
    <div>
      <Lbl>Trial calls ({points.length})</Lbl>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {points.map((p, i) => {
          const clickable = p.id !== currentId && !!p.engagementId;
          return (
            <div key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => jump(p)}
              title={clickable ? "Open this call" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: clickable ? "pointer" : "default", background: hover === i ? "var(--surface-C)" : (p.id === currentId ? "color-mix(in srgb,var(--accent) 7%,var(--surface-B))" : "var(--surface-B)"), border: `1px solid ${p.id === currentId ? "var(--accent)" : hover === i && clickable ? "var(--border-strong)" : "var(--border-weaker)"}`, transition: "background 120ms,border-color 120ms" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: SENT_COLOR[p.sentiment], flexShrink: 0 }} />
              <span style={{ ...mono, width: 52, flexShrink: 0 }}>{p.dateLabel || "—"}</span>
              <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
              {p.id === currentId && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 99, padding: "2px 7px", flexShrink: 0 }}>This call</span>}
              {p.trial && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: verdictColor(p.trial.verdict), flexShrink: 0 }}>{p.trial.health} · {p.trial.verdict}</span>}
              {p.score != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: scoreColor(p.score), width: 30, textAlign: "right", flexShrink: 0 }}>{p.score}</span>}
              <span style={{ fontSize: 13, color: clickable ? "var(--text-secondary)" : "transparent", flexShrink: 0, opacity: hover === i ? 1 : 0.45, transition: "opacity 120ms" }}>↗</span>
            </div>
          );
        })}
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

// ── aggregate wins/friction/asks across the trial's calls (latest first, deduped) ──
function dedupe<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const it of items) {
    const k = key(it).toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  return out;
}
function allWins(calls: TPoint[]): Win[] {
  const w = [...calls].reverse().flatMap(p => p.trial?.wins ?? []);
  return dedupe(w, x => x.what).slice(0, 8);
}
function allFriction(calls: TPoint[]): Friction[] {
  const f = [...calls].reverse().flatMap(p => p.trial?.friction ?? []);
  // Latest mention of a duplicate wins (so a later "resolved" supersedes earlier "new")
  return dedupe(f, x => x.what)
    .sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    .slice(0, 10);
}
function allAsks(calls: TPoint[]): Ask[] {
  return dedupe([...calls].reverse().flatMap(p => p.trial?.asks ?? []), x => x.what).slice(0, 8);
}
function goalColor(p?: string) { return p === "on-track" ? "#1d9e75" : p === "behind" ? "#e04b4a" : "var(--text-secondary)"; }

const chip: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--text-secondary)", border: "1px solid var(--border-weak)", borderRadius: 99, padding: "2px 8px" };
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

// ─── Trial charts ────────────────────────────────────────────────────────────
const PASTEL = "#7bc9a6";
function clampTip(pct: number): number { return Math.min(83, Math.max(17, pct)); }
const tipBox: React.CSSProperties = { position: "absolute", top: 8, transform: "translateX(-50%)", background: "var(--surface-A)", border: "1px solid var(--border-weak)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 6px 24px rgba(0,0,0,0.16)", pointerEvents: "none", width: 320, zIndex: 5 };

function TrialSentimentChart({ points, currentId }: { points: TPoint[]; currentId: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1040, H = 230, padX = 52, padY = 40; const plotW = W - padX * 2, plotH = H - padY * 2; const n = points.length;
  const SY: Record<string, number> = { positive: 1, neutral: 0, "at-risk": -1 };
  const x = (i: number) => n === 1 ? padX + plotW / 2 : padX + (plotW * i) / (n - 1);
  const y = (s: string) => padY + plotH * (1 - ((SY[s] ?? 0) + 1) / 2);
  const known = points.map((p, i) => ({ p, i })).filter(o => o.p.sentiment !== "unknown");
  const coords = known.map(o => ({ x: x(o.i), y: y(o.p.sentiment) }));
  const line = smoothPath(coords); const baseline = padY + plotH;
  const area = coords.length > 1 ? `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z` : "";
  return (
    <div style={{ position: "relative", background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "14px 12px 8px" }}>
      <p style={{ ...statLbl, margin: "0 6px 6px" }}>Trial sentiment over time</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="trialSentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PASTEL} stopOpacity="0.28" /><stop offset="100%" stopColor={PASTEL} stopOpacity="0" /></linearGradient></defs>
        {[["positive", "Positive"], ["neutral", "Neutral"], ["at-risk", "At-risk"]].map(([s, l]) => (
          <g key={s}><line x1={padX} x2={W - padX} y1={y(s)} y2={y(s)} stroke="var(--border-weaker)" strokeDasharray={s === "neutral" ? "0" : "3 4"} strokeWidth={1} /><text x={8} y={y(s) + 4} fontSize={11} fill={SENT_COLOR[s]} fontFamily="var(--font-mono)">{l}</text></g>
        ))}
        {area && <path d={area} fill="url(#trialSentFill)" stroke="none" />}
        {line && <path d={line} fill="none" stroke={PASTEL} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => {
          const cur = p.id === currentId;
          if (p.sentiment === "unknown") return <g key={p.id}><circle cx={x(i)} cy={baseline + 6} r={3} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} /><text x={x(i)} y={H - 8} fontSize={10} fill="var(--text-disable)" textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text></g>;
          return <g key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            {cur && <line x1={x(i)} x2={x(i)} y1={padY - 12} y2={H - 22} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
            <circle cx={x(i)} cy={y(p.sentiment)} r={hover === i ? 9 : cur ? 8 : 6} fill={SENT_COLOR[p.sentiment]} stroke={cur ? "var(--accent)" : "var(--surface-A)"} strokeWidth={cur ? 3 : 2.5} />
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" />
            <text x={x(i)} y={H - 8} fontSize={10} fill={cur ? "var(--accent)" : "var(--text-disable)"} textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text>
          </g>;
        })}
      </svg>
      {hover != null && points[hover] && (
        <div style={{ ...tipBox, left: `${clampTip((x(hover) / W) * 100)}%` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SENT_COLOR[points[hover].sentiment] }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: SENT_COLOR[points[hover].sentiment] }}>{SENT_ICON[points[hover].sentiment]} {SENT_LABEL[points[hover].sentiment]}</span>
            <span style={{ ...mono }}>{points[hover].dateLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4 }}>{points[hover].title}{points[hover].reason ? ` — ${points[hover].reason}` : ""}</div>
          {points[hover].posEvidence?.slice(0, 2).map((q, i) => <div key={"p" + i} style={{ fontSize: 11, color: "#1d9e75", lineHeight: 1.4, marginTop: 2 }}>“{q}”</div>)}
          {points[hover].negEvidence?.slice(0, 2).map((q, i) => <div key={"n" + i} style={{ fontSize: 11, color: "#e04b4a", lineHeight: 1.4, marginTop: 2 }}>“{q}”</div>)}
        </div>
      )}
    </div>
  );
}

function TrialDimsChart({ points, currentId }: { points: TPoint[]; currentId: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(TRIAL_DIMS.map(d => [d.key, d.key === "activation"]))
  );
  const W = 1040, H = 280, padX = 42, padY = 32; const plotW = W - padX * 2, plotH = H - padY * 2; const n = points.length;
  const x = (i: number) => n === 1 ? padX + plotW / 2 : padX + (plotW * i) / (n - 1);
  const y = (v: number) => padY + plotH * (1 - v / 20);
  const baseline = padY + plotH;
  const dimOf = (p: TPoint, k: string): Dim | undefined => p.trial?.dimensions?.[k];
  const enabledKeys = TRIAL_DIMS.filter(d => enabled[d.key]).map(d => d.key);
  const single = enabledKeys.length === 1 ? enabledKeys[0] : null;
  const allOn = TRIAL_DIMS.every(d => enabled[d.key]);
  return (
    <div style={{ position: "relative", background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "14px 12px 8px" }}>
      <p style={{ ...statLbl, margin: "0 6px 6px" }}>Trial scorecard over time</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 6px 8px", alignItems: "center" }}>
        {TRIAL_DIMS.map(d => (
          <button key={d.key} onClick={() => setEnabled({ ...enabled, [d.key]: !enabled[d.key] })}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", padding: "5px 10px", borderRadius: 99, cursor: "pointer", transition: "all 140ms", border: `1px solid ${enabled[d.key] ? d.color : "var(--border-weaker)"}`, background: enabled[d.key] ? `color-mix(in srgb, ${d.color} 12%, transparent)` : "transparent", color: enabled[d.key] ? d.color : "var(--text-disable)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: enabled[d.key] ? d.color : "var(--border-strong)" }} />{d.label}
          </button>
        ))}
        <button onClick={() => setEnabled(Object.fromEntries(TRIAL_DIMS.map(d => [d.key, !allOn])))}
          style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", padding: "5px 10px", borderRadius: 99, cursor: "pointer", border: "1px solid var(--border-weak)", background: "transparent", color: "var(--text-secondary)" }}>
          {allOn ? "Deselect all" : "Select all"}
        </button>
      </div>
      {single && <p style={{ fontSize: 11.5, color: "var(--text-disable)", margin: "0 0 6px 8px" }}>Showing {TRIAL_DIMS.find(d => d.key === single)!.label} only — hover a point for the evidence.</p>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>{single && <linearGradient id="trialDimFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TRIAL_DIMS.find(d => d.key === single)!.color} stopOpacity="0.24" /><stop offset="100%" stopColor={TRIAL_DIMS.find(d => d.key === single)!.color} stopOpacity="0" /></linearGradient>}</defs>
        {[0, 5, 10, 15, 20].map(v => (<g key={v}><line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="var(--border-weaker)" strokeWidth={1} /><text x={8} y={y(v) + 3} fontSize={9} fill="var(--text-disable)" fontFamily="var(--font-mono)">{v}</text></g>))}
        {single && (() => {
          const coords = points.map((p, i) => ({ d: dimOf(p, single), i })).filter(o => o.d?.applicable).map(o => ({ x: x(o.i), y: y(o.d!.score) }));
          if (coords.length < 2) return null;
          const l = smoothPath(coords);
          return <path d={`${l} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`} fill="url(#trialDimFill)" stroke="none" />;
        })()}
        {TRIAL_DIMS.filter(d => enabled[d.key]).map(d => {
          const coords = points.map((p, i) => ({ dd: dimOf(p, d.key), i })).filter(o => o.dd?.applicable).map(o => ({ x: x(o.i), y: y(o.dd!.score) }));
          return <path key={d.key} d={smoothPath(coords)} fill="none" stroke={d.color} strokeWidth={single ? 2.8 : 2.2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {TRIAL_DIMS.filter(d => enabled[d.key]).map(d => points.map((p, i) => {
          const dd = dimOf(p, d.key);
          if (!dd || !dd.applicable) return <circle key={d.key + p.id} cx={x(i)} cy={baseline} r={2.5} fill="none" stroke="var(--border-strong)" strokeWidth={1} opacity={0.5} />;
          return <circle key={d.key + p.id} cx={x(i)} cy={y(dd.score)} r={hover === i ? 5.5 : 4} fill={d.color} stroke="var(--surface-A)" strokeWidth={1.5} />;
        }))}
        {points.map((p, i) => {
          const cur = p.id === currentId;
          return <g key={"h" + p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            {cur && <line x1={x(i)} x2={x(i)} y1={padY - 14} y2={H - 18} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" />
            <text x={x(i)} y={H - 4} fontSize={10} fill={cur ? "var(--accent)" : "var(--text-disable)"} textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text>
          </g>;
        })}
      </svg>
      {hover != null && points[hover] && (
        <div style={{ ...tipBox, top: 40, left: `${clampTip((x(hover) / W) * 100)}%` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{points[hover].title}</span>
            <span style={mono}>{points[hover].dateLabel}</span>
          </div>
          {single ? (() => {
            const d = dimOf(points[hover], single); const meta = TRIAL_DIMS.find(m => m.key === single)!;
            return <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 3 }}>{meta.label}: {d?.applicable ? `${d.score}/20` : "n/a"}{d?.note ? ` — ${d.note}` : ""}</div>
              {d?.evidence?.slice(0, 3).map((q, i) => <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 2, fontStyle: "italic" }}>“{q}”</div>)}
              {(!d?.evidence || d.evidence.length === 0) && <div style={{ fontSize: 11, color: "var(--text-disable)" }}>No evidence for this dimension on this call.</div>}
            </div>;
          })() : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {TRIAL_DIMS.filter(d => enabled[d.key]).map(d => { const dd = dimOf(points[hover], d.key); return (
                <div key={d.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
                  <span style={{ color: d.color }}>{d.label}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{dd?.applicable ? `${dd.score}/20` : "n/a"}</span>
                </div>); })}
            </div>
          )}
        </div>
      )}
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
