"use client";

/**
 * Deal Insights tab — decision-grade intelligence view.
 * This call's score + BANT breakdown (with per-dimension evidence tooltips) +
 * sentiment (with evidence), then deal-level trends: sentiment over time and
 * BANT+Fit over time (per-metric toggles, single-metric evidence + glow),
 * each with a whole-deal summary. Data from /api/deal-sentiment (Opus 4.8).
 */

import { useEffect, useMemo, useState } from "react";
import { CallCard, Point, DIM_META, SENT_COLOR, SENT_LABEL, SENT_ICON, scoreColor, smoothPath, pointFromMetadata } from "./intel";

export default function DealInsights({ recordId, title, metadata }: {
  recordId: string | null; title: string;
  metadata: Record<string, string | undefined>; signals: unknown[];
}) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [dealName, setDealName] = useState("");
  const [scope, setScope] = useState<"deal" | "company" | "none">("deal");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(DIM_META.map(d => [d.key, d.key === "budget"])) // Budget on by default
  );

  useEffect(() => {
    if (!recordId) return;
    fetch(`/api/deal-sentiment?recordId=${recordId}`).then(r => r.json())
      .then(d => { setDealName(d.dealName || ""); setScope(d.scope || "deal"); setPoints(d.points || []); })
      .catch(() => setPoints([]));
  }, [recordId]);

  const current = useMemo(() => pointFromMetadata(metadata, title), [metadata, title]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 26px 36px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={pill}>This call</span>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h2>
        </div>

        {/* This call's intelligence */}
        <CallCard point={current} />

        {/* Deal trends */}
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 16 }}>
          <Label>{scope === "company" ? "Account" : "Deal"} · {dealName || title}</Label>
          {scope === "company" && <p style={{ fontSize: 11.5, color: "var(--text-disable)", margin: "-8px 0 0" }}>This call isn't linked to a deal — showing the timeline across all of this account's calls.</p>}
          {!points ? <p style={msg}>Loading deal timeline…</p>
            : points.length === 0 ? <p style={msg}>No processed calls on this deal yet.</p>
            : <>
                <SentimentChart points={points} currentId={recordId} />
                <BantChart points={points} enabled={enabled} setEnabled={setEnabled} currentId={recordId} />
                <Ledger points={points} currentId={recordId} />
              </>}
        </div>
      </div>
    </div>
  );
}

// ─── Sentiment over time (pastel green) ──────────────────────────────────────
const PASTEL = "#7bc9a6";
function SentimentChart({ points, currentId }: { points: Point[]; currentId: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1040, H = 250, padX = 52, padY = 44; const plotW = W - padX * 2, plotH = H - padY * 2; const n = points.length;
  const SY: Record<string, number> = { positive: 1, neutral: 0, "at-risk": -1 };
  const x = (i: number) => n === 1 ? padX + plotW / 2 : padX + (plotW * i) / (n - 1);
  const y = (s: string) => padY + plotH * (1 - ((SY[s] ?? 0) + 1) / 2);
  const known = points.map((p, i) => ({ p, i })).filter(o => o.p.sentiment !== "unknown");
  const coords = known.map(o => ({ x: x(o.i), y: y(o.p.sentiment) }));
  const line = smoothPath(coords); const baseline = padY + plotH;
  const area = coords.length > 1 ? `${line} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z` : "";
  const summary = useMemo(() => sentimentSummary(points), [points]);

  return (
    <ChartCard title="Sentiment over time" summary={summary}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs><linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PASTEL} stopOpacity="0.28" /><stop offset="100%" stopColor={PASTEL} stopOpacity="0" /></linearGradient></defs>
        {[["positive", "Positive"], ["neutral", "Neutral"], ["at-risk", "At-risk"]].map(([s, l]) => (
          <g key={s}><line x1={padX} x2={W - padX} y1={y(s)} y2={y(s)} stroke="var(--border-weaker)" strokeDasharray={s === "neutral" ? "0" : "3 4"} strokeWidth={1} /><text x={8} y={y(s) + 4} fontSize={11} fill={SENT_COLOR[s]} fontFamily="var(--font-mono)">{l}</text></g>
        ))}
        {area && <path d={area} fill="url(#sentFill)" stroke="none" />}
        {line && <path d={line} fill="none" stroke={PASTEL} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) => {
          const cur = p.id === currentId;
          if (p.sentiment === "unknown") { // no reading — small grey tick at baseline, never an orphan on the line
            return <g key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <circle cx={x(i)} cy={baseline + 6} r={3} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} />
              <text x={x(i)} y={H - 8} fontSize={10} fill="var(--text-disable)" textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text>
            </g>;
          }
          return <g key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            {cur && <line x1={x(i)} x2={x(i)} y1={padY - 14} y2={H - 24} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
            {cur && <text x={x(i)} y={padY - 20} fontSize={10} fontWeight={600} fill="var(--accent)" textAnchor="middle" fontFamily="var(--font-mono)">THIS CALL</text>}
            <circle cx={x(i)} cy={y(p.sentiment)} r={hover === i ? 9 : cur ? 8 : 6} fill={SENT_COLOR[p.sentiment]} stroke={cur ? "var(--accent)" : "var(--surface-A)"} strokeWidth={cur ? 3 : 2.5} />
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" />
            <text x={x(i)} y={H - 8} fontSize={10} fill={cur ? "var(--accent)" : "var(--text-disable)"} textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text>
          </g>;
        })}
      </svg>
      {hover != null && points[hover] && <SentimentTip x={(x(hover) / W) * 100} p={points[hover]} />}
    </ChartCard>
  );
}

function SentimentTip({ x, p }: { x: number; p: Point }) {
  return (
    <div style={{ ...tipBox, left: `${x}%` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: SENT_COLOR[p.sentiment] }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: SENT_COLOR[p.sentiment] }}>{SENT_ICON[p.sentiment]} {SENT_LABEL[p.sentiment]}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-disable)" }}>{p.dateLabel}{p.confidence ? ` · ${p.confidence}` : ""}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 5 }}>{p.title}{p.reason ? ` — ${p.reason}` : ""}</div>
      {p.posEvidence?.slice(0, 3).map((q, i) => <div key={"p" + i} style={{ fontSize: 11, color: "#1d9e75", lineHeight: 1.4, marginTop: 2 }}>“{q}”</div>)}
      {p.negEvidence?.slice(0, 2).map((q, i) => <div key={"n" + i} style={{ fontSize: 11, color: "#e04b4a", lineHeight: 1.4, marginTop: 2 }}>“{q}”</div>)}
    </div>
  );
}

// ─── BANT + Fit over time ────────────────────────────────────────────────────
function BantChart({ points, enabled, setEnabled, currentId }: {
  points: Point[]; enabled: Record<string, boolean>; setEnabled: (e: Record<string, boolean>) => void;
  currentId: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1040, H = 300, padX = 42, padY = 34; const plotW = W - padX * 2, plotH = H - padY * 2; const n = points.length;
  const x = (i: number) => n === 1 ? padX + plotW / 2 : padX + (plotW * i) / (n - 1);
  const y = (v: number) => padY + plotH * (1 - v / 20);
  const enabledKeys = DIM_META.filter(d => enabled[d.key]).map(d => d.key);
  const single = enabledKeys.length === 1 ? enabledKeys[0] : null;
  const allOn = DIM_META.every(d => enabled[d.key]);
  const summary = useMemo(() => bantSummary(points), [points]);
  const baseline = padY + plotH;

  return (
    <ChartCard title="BANT + Fit over time" summary={summary}>
      {/* toggles + select all */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 6px 8px", alignItems: "center" }}>
        {DIM_META.map(d => (
          <button key={d.key} onClick={() => setEnabled({ ...enabled, [d.key]: !enabled[d.key] })}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.02em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 99, cursor: "pointer", transition: "all 140ms", border: `1px solid ${enabled[d.key] ? d.color : "var(--border-weaker)"}`, background: enabled[d.key] ? `color-mix(in srgb, ${d.color} 12%, transparent)` : "transparent", color: enabled[d.key] ? d.color : "var(--text-disable)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: enabled[d.key] ? d.color : "var(--border-strong)" }} />{d.label}
          </button>
        ))}
        <button onClick={() => setEnabled(Object.fromEntries(DIM_META.map(d => [d.key, !allOn])))}
          style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", padding: "5px 10px", borderRadius: 99, cursor: "pointer", border: "1px solid var(--border-weak)", background: "transparent", color: "var(--text-secondary)" }}>
          {allOn ? "Deselect all" : "Select all"}
        </button>
      </div>
      {single && <p style={{ fontSize: 11.5, color: "var(--text-disable)", margin: "0 0 6px 8px" }}>Showing {DIM_META.find(d => d.key === single)!.label} only — hover a point for the evidence.</p>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>{single && <linearGradient id="dimFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={DIM_META.find(d => d.key === single)!.color} stopOpacity="0.24" /><stop offset="100%" stopColor={DIM_META.find(d => d.key === single)!.color} stopOpacity="0" /></linearGradient>}</defs>
        {[0, 5, 10, 15, 20].map(v => (<g key={v}><line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="var(--border-weaker)" strokeWidth={1} /><text x={8} y={y(v) + 3} fontSize={9} fill="var(--text-disable)" fontFamily="var(--font-mono)">{v}</text></g>))}
        {/* single-metric glow */}
        {single && (() => {
          const coords = points.map((p, i) => ({ p, i })).filter(o => o.p.dimensions?.[single]?.applicable).map(o => ({ x: x(o.i), y: y(o.p.dimensions[single].score) }));
          if (coords.length < 2) return null;
          const l = smoothPath(coords);
          return <path d={`${l} L ${coords[coords.length - 1].x} ${baseline} L ${coords[0].x} ${baseline} Z`} fill="url(#dimFill)" stroke="none" />;
        })()}
        {DIM_META.filter(d => enabled[d.key]).map(d => {
          const coords = points.map((p, i) => ({ p, i })).filter(o => o.p.dimensions?.[d.key]?.applicable).map(o => ({ x: x(o.i), y: y(o.p.dimensions[d.key].score) }));
          return <path key={d.key} d={smoothPath(coords)} fill="none" stroke={d.color} strokeWidth={single ? 2.8 : 2.2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {/* points: every call for every enabled dim (non-applicable = hollow baseline so each day shows) */}
        {DIM_META.filter(d => enabled[d.key]).map(d => points.map((p, i) => {
          const dd = p.dimensions?.[d.key];
          // No data for this dim on this call (or the whole call is insufficient)
          // → a faint hollow baseline marker so every date still has a point.
          if (!dd || !dd.applicable) return <circle key={d.key + p.id} cx={x(i)} cy={baseline} r={2.5} fill="none" stroke="var(--border-strong)" strokeWidth={1} opacity={0.5} />;
          return <circle key={d.key + p.id} cx={x(i)} cy={y(dd.score)} r={hover === i ? 5.5 : 4} fill={d.color} stroke="var(--surface-A)" strokeWidth={1.5} />;
        }))}
        {points.map((p, i) => {
          const cur = p.id === currentId;
          return <g key={"h" + p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            {cur && <line x1={x(i)} x2={x(i)} y1={padY - 16} y2={H - 20} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
            {cur && <text x={x(i)} y={padY - 20} fontSize={10} fontWeight={600} fill="var(--accent)" textAnchor="middle" fontFamily="var(--font-mono)">THIS CALL</text>}
            <rect x={x(i) - 18} y={0} width={36} height={H} fill="transparent" />
            <text x={x(i)} y={H - 4} fontSize={10} fill={cur ? "var(--accent)" : "var(--text-disable)"} textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel || ""}</text>
          </g>;
        })}
      </svg>
      {hover != null && points[hover] && <BantTip x={(x(hover) / W) * 100} p={points[hover]} enabled={enabled} single={single} />}
    </ChartCard>
  );
}

function BantTip({ x, p, enabled, single }: { x: number; p: Point; enabled: Record<string, boolean>; single: string | null }) {
  return (
    <div style={{ ...tipBox, top: 40, left: `${x}%`, maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{p.title}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-disable)" }}>{p.dateLabel}</span>
      </div>
      {single ? (() => {
        const d = p.dimensions?.[single]; const meta = DIM_META.find(m => m.key === single)!;
        return <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: meta.color, marginBottom: 3 }}>{meta.label}: {d?.applicable ? `${d.score}/20` : "n/a"}{d?.note ? ` — ${d.note}` : ""}</div>
          {d?.evidence?.slice(0, 3).map((q, i) => <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 2, fontStyle: "italic" }}>“{q}”</div>)}
          {(!d?.evidence || d.evidence.length === 0) && <div style={{ fontSize: 11, color: "var(--text-disable)" }}>No evidence for this dimension on this call.</div>}
        </div>;
      })() : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {DIM_META.filter(d => enabled[d.key]).map(d => { const dd = p.dimensions?.[d.key]; return (
            <div key={d.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
              <span style={{ color: d.color }}>{d.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{dd?.applicable ? `${dd.score}/20` : "n/a"}</span>
            </div>); })}
        </div>
      )}
    </div>
  );
}

function Ledger({ points, currentId }: { points: Point[]; currentId: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const jump = (p: Point) => {
    if (p.id === currentId || !p.engagementId) return;
    const qs = new URLSearchParams({ engagementId: p.engagementId, recordId: p.id });
    window.location.href = `/?${qs.toString()}`; // reload the modal on the other call
  };
  return (
    <div>
      <Label>Calls on this deal ({points.length})</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {points.map((p, i) => {
          const clickable = p.id !== currentId && !!p.engagementId;
          return (
          <div key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => jump(p)}
            title={clickable ? "Open this call" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, cursor: clickable ? "pointer" : "default", background: hover === i ? "var(--surface-C)" : (p.id === currentId ? "color-mix(in srgb,var(--accent) 7%,var(--surface-B))" : "var(--surface-B)"), border: `1px solid ${p.id === currentId ? "var(--accent)" : hover === i && clickable ? "var(--border-strong)" : "var(--border-weaker)"}`, transition: "background 120ms,border-color 120ms" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: SENT_COLOR[p.sentiment], flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disable)", width: 52, flexShrink: 0 }}>{p.dateLabel || "—"}</span>
            <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
            {p.id === currentId && <span style={pillSm}>This call</span>}
            {p.stage && <span style={stageTag}>{p.stage}</span>}
            {p.score != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: scoreColor(p.score), width: 30, textAlign: "right", flexShrink: 0 }}>{p.score}</span>}
            <span style={{ fontSize: 13, color: clickable ? "var(--text-secondary)" : "transparent", flexShrink: 0, opacity: hover === i ? 1 : 0.45, transition: "opacity 120ms" }}>↗</span>
          </div>
        );})}
      </div>
    </div>
  );
}

// ─── deal-duration summaries (computed client-side) ─────────────────────────
function sentimentSummary(points: Point[]): string {
  const known = points.filter(p => p.sentiment !== "unknown");
  if (known.length === 0) return "";
  const c = { positive: 0, neutral: 0, "at-risk": 0 } as Record<string, number>;
  known.forEach(p => { c[p.sentiment] = (c[p.sentiment] || 0) + 1; });
  const first = known[0].sentiment, last = known[known.length - 1].sentiment;
  const span = `across ${known.length === 1 ? "the one scored call" : `all ${known.length} calls`}`;
  if (c["at-risk"] === 0 && c.neutral === 0) return `The customer has stayed engaged and positive ${span} — momentum is holding.`;
  if (first === last && last === "positive") return `Positive ${span}, with a dip in between — overall still trending well.`;
  if (last === "at-risk") return `Sentiment has slipped to at-risk by the latest call — worth a close look before the next step.`;
  if (first !== last) return `Sentiment moved from ${SENT_LABEL[first].toLowerCase()} to ${SENT_LABEL[last].toLowerCase()} over the deal — the trajectory is the story here.`;
  return `Sentiment has been steady (${SENT_LABEL[last].toLowerCase()}) ${span}.`;
}
function bantSummary(points: Point[]): string {
  const strong: string[] = [], rising: string[] = [], falling: string[] = [], missing: string[] = [];
  for (const d of DIM_META) {
    const vals = points.map(p => p.dimensions?.[d.key]).filter(x => x && x.applicable) as { score: number }[];
    if (vals.length === 0) { missing.push(d.label.toLowerCase()); continue; }
    const latest = vals[vals.length - 1].score;
    if (vals.length >= 2) {
      const delta = latest - vals[0].score;
      if (delta > 2) rising.push(d.label.toLowerCase());
      else if (delta < -2) falling.push(d.label.toLowerCase());
    }
    if (latest >= 14) strong.push(d.label.toLowerCase());
  }
  const clauses: string[] = [];
  if (strong.length) clauses.push(`${list(strong)} ${strong.length > 1 ? "are" : "is"} the strength${strong.length > 1 ? "s" : ""}`);
  if (rising.length) clauses.push(`${list(rising)} building`);
  if (falling.length) clauses.push(`${list(falling)} slipping`);
  if (missing.length) clauses.push(`${list(missing)} not yet established`);
  if (clauses.length === 0) return "Not enough scored calls yet to read a trend.";
  return cap(clauses.join("; ")) + ".";
}
function list(a: string[]): string { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── small shared UI ─────────────────────────────────────────────────────────
const msg: React.CSSProperties = { color: "var(--text-disable)", fontSize: 13, fontFamily: "var(--font-mono)", padding: "20px 4px" };
const pill: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 99, padding: "3px 9px" };
const pillSm: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 99, padding: "2px 7px", flexShrink: 0 };
const stageTag: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", color: "var(--text-secondary)", background: "var(--surface-C)", borderRadius: 99, padding: "3px 9px", flexShrink: 0 };
const tipBox: React.CSSProperties = { position: "absolute", top: 6, transform: "translateX(-50%)", background: "var(--surface-A)", border: "1px solid var(--border-weak)", borderRadius: 10, padding: "9px 12px", boxShadow: "0 6px 24px rgba(0,0,0,0.16)", pointerEvents: "none", maxWidth: 300, minWidth: 190, zIndex: 5 };
function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", margin: 0 }}>{children}</p>;
}
function ChartCard({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "14px 12px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 6px 6px", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)" }}>{title}</span>
        {summary && <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{summary}</span>}
      </div>
      {children}
    </div>
  );
}
