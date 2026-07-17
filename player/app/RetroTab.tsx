"use client";

/**
 * Won/Lost tab — the whole-deal retrospective. Detects the deal's outcome
 * (closed won / closed lost / in progress via HubSpot's computed flags),
 * and renders the Opus deal analysis: what worked, what hurt, turning
 * points, objections, stakeholder coverage, lessons, execution grade.
 * In-progress deals get a loud notice + an explicit interim-analysis button.
 */

import { useEffect, useState } from "react";

interface Item { what: string; detail?: string }
interface Turning { date: string; what: string; impact: string }
interface Retro {
  generated_at?: string; outcome: string; calls_analyzed?: number;
  executive_summary: string;
  what_worked: Item[]; what_hurt: Item[];
  turning_points: Turning[];
  objections: { resolved: string[]; unresolved: string[] };
  stakeholders: { champion: string; economic_buyer: string; coverage: string };
  competition: string;
  lessons: string[];
  grade: string; grade_reason: string;
}
interface RetroResp {
  dealId?: string; dealName?: string; outcome?: "won" | "lost" | "in_progress";
  stageLabel?: string; nearClose?: boolean; cached?: boolean; retro?: Retro; error?: string;
}

export default function RetroTab({ recordId }: { recordId: string | null }) {
  const [resp, setResp] = useState<RetroResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = (force = false) => {
    if (!recordId) return;
    if (force) setGenerating(true);
    fetch(`/api/deal-retro`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, ...(force ? { force: true } : {}) }),
    }).then(r => r.json()).then(setResp)
      .catch(() => setResp({ error: "Failed to load retrospective" }))
      .finally(() => { setLoading(false); setGenerating(false); });
  };
  // First load: only fetch cache/status — the endpoint auto-generates when
  // outcome+call-count match cache; for closed deals that's what we want.
  useEffect(() => { load(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [recordId]);

  if (loading) return <Center><p style={mono}>Loading retrospective…</p></Center>;
  if (!resp || resp.error) return (
    <Center>
      <div style={emptyBox}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🏁</div>
        <h3 style={h3}>No retrospective available</h3>
        <p style={pMuted}>{resp?.error === "No deal found for this recording" ? "This call isn't linked to a deal, so there's no deal to analyze." : (resp?.error || "Something went wrong.")}</p>
      </div>
    </Center>
  );

  const { outcome, stageLabel, dealName, retro } = resp;
  const badge = outcome === "won"
    ? { text: "🏆 CLOSED WON", bg: "#1d9e75" }
    : outcome === "lost"
      ? { text: "❌ CLOSED LOST", bg: "#e04b4a" }
      : { text: `⏳ IN PROGRESS · ${stageLabel || "open"}`, bg: "#b0873d" };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 26px 36px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#fff", background: badge.bg, borderRadius: 99, padding: "4px 12px" }}>{badge.text}</span>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: "var(--text-primary)" }}>{dealName}</h2>
          {retro?.generated_at && <span style={mono}>analyzed {retro.calls_analyzed} calls · {new Date(retro.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
        </div>

        {/* In-progress: loud notice */}
        {outcome === "in_progress" && (
          <div style={{ ...emptyBox, textAlign: "left", display: "flex", alignItems: "center", gap: 16, padding: "18px 22px" }}>
            <div style={{ fontSize: 28 }}>⏳</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" }}>
                <strong style={{ color: "var(--text-primary)" }}>This deal isn&apos;t closed yet</strong> (stage: {stageLabel || "unknown"}{resp.nearClose ? " — near close" : ""}).
                The definitive won/lost analysis runs automatically once HubSpot marks it closed. You can generate an interim read now.
              </p>
            </div>
            <button onClick={() => load(true)} disabled={generating}
              style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, textTransform: "uppercase", padding: "9px 16px", borderRadius: 99, cursor: generating ? "wait" : "pointer", border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", flexShrink: 0 }}>
              {generating ? "Analyzing… ~1 min" : retro ? "Refresh interim analysis" : "Generate interim analysis"}
            </button>
          </div>
        )}

        {retro ? <RetroBody retro={retro} onRefresh={() => load(true)} generating={generating} outcome={outcome!} /> : outcome !== "in_progress" && (
          <Center>
            <button onClick={() => load(true)} disabled={generating}
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", padding: "10px 18px", borderRadius: 99, cursor: "pointer", border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)" }}>
              {generating ? "Analyzing… ~1 min" : "Generate retrospective"}
            </button>
          </Center>
        )}
      </div>
    </div>
  );
}

function RetroBody({ retro, onRefresh, generating, outcome }: { retro: Retro; onRefresh: () => void; generating: boolean; outcome: string }) {
  return (
    <>
      {/* Grade + exec summary */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 220px", gap: 14 }}>
        <Card>
          <Lbl>Executive summary</Lbl>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.65, color: "var(--text-primary)" }}>{retro.executive_summary}</p>
        </Card>
        <Card>
          <Lbl>Execution grade</Lbl>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.1, color: gradeColor(retro.grade), marginTop: 4 }}>{retro.grade}</div>
          <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.45, color: "var(--text-secondary)" }}>{retro.grade_reason}</p>
          <p style={{ margin: "8px 0 0", fontSize: 10.5, color: "var(--text-disable)", fontFamily: "var(--font-mono)" }}>Grades execution, not outcome</p>
        </Card>
      </div>

      {/* Worked / hurt */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
        <Card>
          <Lbl>✅ What we did right</Lbl>
          {retro.what_worked?.map((w, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <p style={itemTitle}>{w.what}</p>
              {w.detail && <p style={itemDetail}>{w.detail}</p>}
            </div>
          ))}
        </Card>
        <Card>
          <Lbl>⚠️ What hurt us</Lbl>
          {retro.what_hurt?.map((w, i) => (
            <div key={i} style={{ marginTop: 10 }}>
              <p style={itemTitle}>{w.what}</p>
              {w.detail && <p style={itemDetail}>{w.detail}</p>}
            </div>
          ))}
        </Card>
      </div>

      {/* Turning points */}
      {retro.turning_points?.length > 0 && (
        <Card>
          <Lbl>🔀 Turning points</Lbl>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {retro.turning_points.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ ...mono, width: 78, flexShrink: 0 }}>{t.date}</span>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{t.impact === "positive" ? "📈" : "📉"}</span>
                <span style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{t.what}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Objections + stakeholders + competition */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }}>
        <Card>
          <Lbl>🛡 Objections</Lbl>
          {retro.objections?.resolved?.length > 0 && <>
            <p style={{ ...smallHead, color: "#1d9e75" }}>Resolved</p>
            {retro.objections.resolved.map((o, i) => <p key={i} style={itemDetail}>✓ {o}</p>)}
          </>}
          {retro.objections?.unresolved?.length > 0 && <>
            <p style={{ ...smallHead, color: "#e04b4a" }}>Never resolved</p>
            {retro.objections.unresolved.map((o, i) => <p key={i} style={itemDetail}>✗ {o}</p>)}
          </>}
          {(!retro.objections?.resolved?.length && !retro.objections?.unresolved?.length) && <p style={itemDetail}>No material objections raised.</p>}
        </Card>
        <Card>
          <Lbl>👥 Stakeholder coverage</Lbl>
          <p style={{ ...itemDetail, marginTop: 10 }}><strong style={{ color: "var(--text-primary)" }}>Champion:</strong> {retro.stakeholders?.champion}</p>
          <p style={itemDetail}><strong style={{ color: "var(--text-primary)" }}>Economic buyer:</strong> {retro.stakeholders?.economic_buyer}</p>
          <p style={itemDetail}>{retro.stakeholders?.coverage}</p>
          <p style={{ ...smallHead, color: "var(--text-secondary)", marginTop: 12 }}>Competition</p>
          <p style={itemDetail}>{retro.competition}</p>
        </Card>
      </div>

      {/* Lessons */}
      <Card>
        <Lbl>🎓 Lessons for the next deal like this</Lbl>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {retro.lessons?.map((l, i) => (
            <p key={i} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--text-primary)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{i + 1}.</span> {l}
            </p>
          ))}
        </div>
      </Card>

      {outcome !== "in_progress" && (
        <button onClick={onRefresh} disabled={generating}
          style={{ alignSelf: "flex-start", fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", padding: "7px 14px", borderRadius: 99, cursor: "pointer", border: "1px solid var(--border-weak)", background: "transparent", color: "var(--text-secondary)" }}>
          {generating ? "Re-analyzing…" : "Re-run analysis"}
        </button>
      )}
    </>
  );
}

function gradeColor(g?: string) {
  const c = (g || "").charAt(0).toUpperCase();
  return c === "A" ? "#1d9e75" : c === "B" ? "#639922" : c === "C" ? "#b0873d" : "#e04b4a";
}

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disable)" };
const h3: React.CSSProperties = { margin: "0 0 8px", fontSize: 18, color: "var(--text-primary)" };
const pMuted: React.CSSProperties = { margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" };
const emptyBox: React.CSSProperties = { border: "2px dashed var(--border-strong)", borderRadius: 16, padding: "36px 32px", textAlign: "center", maxWidth: 620 };
const itemTitle: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4 };
const itemDetail: React.CSSProperties = { margin: "3px 0 0", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 };
const smallHead: React.CSSProperties = { margin: "10px 0 0", fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" };
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, padding: "16px 18px" }}>{children}</div>;
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", margin: 0 }}>{children}</p>;
}
function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30 }}>{children}</div>;
}
