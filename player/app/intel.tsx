"use client";

/** Shared intelligence UI + types for the modal tabs. */
import { useState } from "react";

export interface Dim { score: number; applicable: boolean; note: string; evidence: string[] }
export interface Point {
  id: string; title: string; dateMs: number; dateLabel: string;
  sentiment: "positive" | "neutral" | "at-risk" | "unknown";
  reason: string; confidence: string; posEvidence: string[]; negEvidence: string[];
  stage: string; score: number | null; rationale: string;
  dimensions: Record<string, Dim>;
}

export const DIM_META: { key: string; label: string; color: string }[] = [
  { key: "budget", label: "Budget", color: "#639922" },
  { key: "authority", label: "Authority", color: "#378add" },
  { key: "need", label: "Need", color: "#7f77dd" },
  { key: "timeline", label: "Timeline", color: "#ba7517" },
  { key: "fit_usage", label: "Fit / Usage", color: "#f4603e" },
];
const BANT4 = DIM_META.slice(0, 4);

export const SENT_COLOR: Record<string, string> = { positive: "#1d9e75", neutral: "#b0873d", "at-risk": "#e04b4a", unknown: "#9a9a9a" };
export const SENT_LABEL: Record<string, string> = { positive: "Positive", neutral: "Neutral", "at-risk": "At-risk", unknown: "No reading" };
export const SENT_ICON: Record<string, string> = { positive: "🌱", neutral: "🌤️", "at-risk": "🌧️", unknown: "" };

export function scoreColor(s: number) { return s >= 70 ? "#1d9e75" : s >= 55 ? "#639922" : s >= 40 ? "#b0873d" : "#e04b4a"; }
function dimColor(s: number) { return s >= 14 ? "#1d9e75" : s >= 8 ? "#b0873d" : "#e04b4a"; }

export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Build a Point from the opened call's stored HubSpot properties. */
export function pointFromMetadata(m: Record<string, string | undefined>, title: string): Point {
  const parse = (s?: string) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
  const sc = parse(m.call_score), se = parse(m.call_sentiment);
  const dims: Record<string, Dim> = {};
  for (const d of DIM_META) {
    const x = sc.dimensions?.[d.key];
    if (x) dims[d.key] = { score: Number(x.score) || 0, applicable: x.applicable !== false, note: String(x.note || ""), evidence: Array.isArray(x.evidence) ? x.evidence.map(String) : (x.evidence ? [String(x.evidence)] : []) };
  }
  return {
    id: "current", title, dateMs: 0, dateLabel: "",
    sentiment: ["positive", "neutral", "at-risk"].includes(se.sentiment) ? se.sentiment : "unknown",
    reason: se.reason || "", confidence: se.confidence || "",
    posEvidence: Array.isArray(se.positiveEvidence) ? se.positiveEvidence.map(String) : [],
    negEvidence: Array.isArray(se.negativeEvidence) ? se.negativeEvidence.map(String) : [],
    stage: m.call_stage || se.stage || "", score: typeof sc.score === "number" ? sc.score : null,
    rationale: sc.rationale || "", dimensions: dims,
  };
}

// ─── DimBar: a BANT dimension with an evidence tooltip on hover ──────────────
export function DimBar({ label, d, color }: { label: string; d?: Dim; color: string }) {
  const [hover, setHover] = useState(false);
  if (!d) return null;
  const pct = d.applicable ? (d.score / 20) * 100 : 0;
  const hasEvidence = d.evidence && d.evidence.length > 0;
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", cursor: hasEvidence ? "help" : "default" }}>
          {label}{hasEvidence ? <span style={{ color: "var(--text-disable)", fontWeight: 400 }}> · {d.evidence.length} quote{d.evidence.length > 1 ? "s" : ""}</span> : ""}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: d.applicable ? dimColor(d.score) : "var(--text-disable)" }}>{d.applicable ? `${d.score}/20` : "n/a yet"}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--surface-C)", overflow: "hidden" }}>
        <div style={{ height: 6, width: `${pct}%`, borderRadius: 99, background: d.applicable ? color : "transparent", transition: "width 300ms" }} />
      </div>
      {d.note && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{d.note}</p>}
      {hover && hasEvidence && (
        <div style={{ position: "absolute", left: 0, top: "100%", marginTop: 6, zIndex: 10, background: "var(--surface-A)", border: `1px solid ${color}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 8px 28px rgba(0,0,0,0.18)", width: "100%", maxWidth: 520 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color, marginBottom: 6 }}>{label} — evidence</div>
          {d.evidence.map((q, i) => <div key={i} style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.5, marginBottom: 5, paddingLeft: 10, borderLeft: `2px solid ${color}` }}>“{q}”</div>)}
        </div>
      )}
    </div>
  );
}

// ─── CallCard: full intelligence for one call (used by both tabs) ────────────
export function CallCard({ point: p }: { point: Point }) {
  const dims = p.dimensions;
  const hasDims = Object.keys(dims).length > 0;
  const sc = typeof p.score === "number" ? p.score : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 14 }}>
        <Card>
          <Lbl>Call score · BANT + Fit</Lbl>
          {sc != null ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
                <span style={{ fontSize: 44, fontWeight: 700, color: scoreColor(sc), lineHeight: 1 }}>{sc}</span>
                <span style={{ fontSize: 14, color: "var(--text-disable)" }}>/ 100</span>
              </div>
              {p.rationale && <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" }}>{p.rationale}</p>}
            </>
          ) : <div style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "var(--text-disable)" }}>Insufficient data</div>}
        </Card>
        <Card>
          <Lbl>Sentiment</Lbl>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: SENT_COLOR[p.sentiment] }}>{SENT_ICON[p.sentiment]} {SENT_LABEL[p.sentiment]}</div>
          {p.reason && <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.45, color: "var(--text-secondary)" }}>{p.reason}</p>}
          {p.confidence && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-disable)" }}>Confidence: {p.confidence}</p>}
          {p.posEvidence?.slice(0, 3).map((q, i) => <p key={"p" + i} style={{ margin: "4px 0 0", fontSize: 11.5, color: "#1d9e75", lineHeight: 1.4 }}>“{q}”</p>)}
          {p.negEvidence?.slice(0, 2).map((q, i) => <p key={"n" + i} style={{ margin: "4px 0 0", fontSize: 11.5, color: "#e04b4a", lineHeight: 1.4 }}>“{q}”</p>)}
        </Card>
      </div>
      {hasDims && (
        <Card>
          <Lbl>Qualification breakdown · BANT</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "16px 32px", marginTop: 12 }}>
            {BANT4.map(d => <DimBar key={d.key} label={d.label} d={dims[d.key]} color={d.color} />)}
          </div>
          {dims.fit_usage && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border-weak)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-disable)" }}>Dune signal</span>
                <div style={{ flex: 1, height: 1, background: "var(--border-weak)" }} />
              </div>
              <DimBar label="Fit / Usage" d={dims.fit_usage} color="#f4603e" />
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "16px 18px" }}>{children}</div>;
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", margin: 0 }}>{children}</p>;
}
