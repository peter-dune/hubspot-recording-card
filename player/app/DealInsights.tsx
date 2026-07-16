"use client";

/**
 * Deal Insights tab — the full, pretty intelligence view for the modal:
 * call score (BANT + Dune Fit/Usage breakdown), sentiment, a First Demo flag,
 * then deal-level sentiment-over-time and a call ledger. Full design freedom
 * here (Vercel-hosted) vs the constrained native card.
 */

import { useEffect, useMemo, useState } from "react";

interface Point {
  id: string; title: string; dateMs: number; dateLabel: string;
  sentiment: "positive" | "neutral" | "at-risk" | "unknown";
  reason: string; stage: string; score: number | null;
}
type Dim = { score: number; applicable: boolean; note: string; evidence?: string };

const SENT_COLOR: Record<string, string> = {
  positive: "#1d9e75", neutral: "#b0873d", "at-risk": "#e04b4a", unknown: "#9a9a9a",
};
const SENT_LABEL: Record<string, string> = {
  positive: "Positive", neutral: "Neutral", "at-risk": "At-risk", unknown: "—",
};
const SENT_ICON: Record<string, string> = { positive: "🌱", neutral: "🌤️", "at-risk": "🌧️", unknown: "" };
const BANT4: [string, string][] = [
  ["budget", "Budget"], ["authority", "Authority"], ["need", "Need"], ["timeline", "Timeline"],
];

/** Catmull-Rom → cubic-bezier smoothing for a soft, curved line. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function scoreColor(s: number) { return s >= 70 ? "#1d9e75" : s >= 55 ? "#639922" : s >= 40 ? "#b0873d" : "#e04b4a"; }
function dimColor(s: number) { return s >= 14 ? "#1d9e75" : s >= 8 ? "#b0873d" : "#e04b4a"; }

export default function DealInsights({ recordId, title, metadata, signals }: {
  recordId: string | null; title: string;
  metadata: Record<string, string | undefined>; signals: unknown[];
}) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [dealName, setDealName] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!recordId) return;
    fetch(`/api/deal-sentiment?recordId=${recordId}`).then(r => r.json())
      .then(d => { setDealName(d.dealName || ""); setPoints(d.points || []); })
      .catch(() => setPoints([]));
  }, [recordId]);

  const score = useMemo(() => { try { return JSON.parse(metadata.call_score || "{}"); } catch { return {}; } }, [metadata.call_score]);
  const sent = useMemo(() => { try { return JSON.parse(metadata.call_sentiment || "{}"); } catch { return {}; } }, [metadata.call_sentiment]);
  const stage = metadata.call_stage || sent.stage || "";
  const isFirstDemo = /first demo/i.test(stage);
  const sentiment = (sent.sentiment as string) || "unknown";
  const dims: Record<string, Dim> | undefined = score.dimensions;

  return (
    <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"20px 22px 32px"}}>
      <div style={{maxWidth:920,margin:"0 auto",width:"100%",display:"flex",flexDirection:"column",gap:16}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <h2 style={{margin:0,fontSize:20,fontWeight:600,color:"var(--text-primary)"}}>{title}</h2>
          {isFirstDemo && <Badge text="★ FIRST DEMO" bg="#f4603e" fg="#fff" />}
          {stage && !isFirstDemo && <Badge text={stage.toUpperCase()} bg="var(--surface-C)" fg="var(--text-secondary)" />}
        </div>

        {/* Score + sentiment row */}
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 240px",gap:14,alignItems:"stretch"}}>
          {/* Score card */}
          <Card>
            <Label>Call score · {score.framework || "BANT"}</Label>
            {typeof score.score === "number" ? (
              <>
                <div style={{display:"flex",alignItems:"baseline",gap:10,marginTop:2}}>
                  <span style={{fontSize:38,fontWeight:700,color:scoreColor(score.score),lineHeight:1}}>{score.score}</span>
                  <span style={{fontSize:14,color:"var(--text-disable)"}}>/ 100</span>
                  {score.label && <span style={{fontSize:13,fontWeight:600,color:scoreColor(score.score)}}>{score.label}</span>}
                </div>
                {score.rationale && <p style={{margin:"10px 0 0",fontSize:13,lineHeight:1.5,color:"var(--text-secondary)"}}>{score.rationale}</p>}
              </>
            ) : <p style={{fontSize:13,color:"var(--text-disable)",marginTop:6}}>Not scored yet.</p>}
          </Card>

          {/* Sentiment card */}
          <Card>
            <Label>Sentiment</Label>
            <div style={{fontSize:22,fontWeight:700,marginTop:4,color:SENT_COLOR[sentiment]}}>
              {SENT_ICON[sentiment]} {SENT_LABEL[sentiment]}
            </div>
            {sent.reason && <p style={{margin:"8px 0 0",fontSize:12,lineHeight:1.45,color:"var(--text-secondary)"}}>{sent.reason}</p>}
            {sent.confidence && <p style={{margin:"6px 0 0",fontSize:11,color:"var(--text-disable)"}}>Confidence: {sent.confidence}</p>}
          </Card>
        </div>

        {/* BANT breakdown */}
        {dims && (
          <Card>
            <Label>Qualification breakdown · BANT</Label>
            <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:10}}>
              {BANT4.map(([key,label])=> <DimRow key={key} label={label} d={dims[key]} />)}
            </div>

            {/* Dune-specific Fit / Usage, separated */}
            {dims.fit_usage && (
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0 14px"}}>
                  <div style={{flex:1,height:1,background:"var(--border-weak)"}}/>
                  <span style={{fontFamily:"var(--font-mono)",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--text-disable)"}}>Dune signal</span>
                  <div style={{flex:1,height:1,background:"var(--border-weak)"}}/>
                </div>
                <DimRow label="Fit / Usage" d={dims.fit_usage} />
              </>
            )}
          </Card>
        )}

        {/* Deal sentiment over time */}
        <div style={{marginTop:4}}>
          <Label>Deal · {dealName || title}</Label>
          {!points ? <p style={msg}>Loading deal timeline…</p>
            : points.length === 0 ? <p style={msg}>No other processed calls on this deal yet.</p>
            : <>
                <SentimentChart points={points} hover={hover} setHover={setHover} currentId={recordId} />
                <div style={{marginTop:16}}>
                  <Label>Calls on this deal ({points.length})</Label>
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8}}>
                    {points.map((p,i)=>(
                      <div key={p.id} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
                        style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,
                          background:hover===i?"var(--surface-C)":"var(--surface-B)",border:`1px solid ${p.id===recordId?"var(--accent)":"var(--border-weaker)"}`,transition:"background 120ms"}}>
                        <span style={{width:9,height:9,borderRadius:"50%",background:SENT_COLOR[p.sentiment],flexShrink:0}}/>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-disable)",width:56,flexShrink:0}}>{p.dateLabel||"—"}</span>
                        <span style={{fontSize:13,color:"var(--text-primary)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}{p.id===recordId?"  ·  this call":""}</span>
                        {p.stage&&<span style={{fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",color:"var(--text-secondary)",background:"var(--surface-C)",borderRadius:99,padding:"3px 9px",flexShrink:0}}>{p.stage}</span>}
                        {p.score!=null&&<span style={{fontFamily:"var(--font-mono)",fontSize:12,fontWeight:600,color:scoreColor(p.score),width:34,textAlign:"right",flexShrink:0}}>{p.score}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>}
        </div>
      </div>
    </div>
  );
}

function SentimentChart({ points, hover, setHover, currentId }: { points: Point[]; hover: number|null; setHover:(i:number|null)=>void; currentId:string|null }) {
  const W=880,H=210,padX=44,padY=34; const plotW=W-padX*2,plotH=H-padY*2; const n=points.length;
  const SY:Record<string,number>={positive:1,neutral:0,"at-risk":-1};
  const x=(i:number)=>n===1?padX+plotW/2:padX+(plotW*i)/(n-1);
  const y=(s:string)=>padY+plotH*(1-((SY[s]??0)+1)/2);
  const known=points.map((p,i)=>({p,i})).filter(o=>o.p.sentiment!=="unknown");
  const coords=known.map(o=>({x:x(o.i),y:y(o.p.sentiment)}));
  const line=smoothPath(coords);
  const baseline=padY+plotH;
  const area=coords.length>1 ? `${line} L ${coords[coords.length-1].x} ${baseline} L ${coords[0].x} ${baseline} Z` : "";
  const rows=[["positive","Positive"],["neutral","Neutral"],["at-risk","At-risk"]];
  return (
    <div style={{position:"relative",background:"var(--surface-B)",border:"1px solid var(--border-weaker)",borderRadius:14,padding:"14px 10px 6px",marginTop:8}}>
      <p style={{fontFamily:"var(--font-mono)",fontSize:10.5,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:"0 0 2px 8px"}}>Sentiment over time</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        <defs>
          <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {rows.map(([s,l])=>(<g key={s}><line x1={padX} x2={W-padX} y1={y(s)} y2={y(s)} stroke="var(--border-weaker)" strokeDasharray={s==="neutral"?"0":"3 4"} strokeWidth={1}/><text x={8} y={y(s)+4} fontSize={11} fill={SENT_COLOR[s]} fontFamily="var(--font-mono)">{l}</text></g>))}
        {area&&<path d={area} fill="url(#sentFill)" stroke="none"/>}
        {line&&<path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>}
        {points.map((p,i)=>(
          <g key={p.id} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} style={{cursor:"pointer"}}>
            <circle cx={x(i)} cy={y(p.sentiment)} r={hover===i?8:p.id===currentId?7:5.5} fill={SENT_COLOR[p.sentiment]} stroke={p.id===currentId?"var(--accent)":"var(--surface-A)"} strokeWidth={p.id===currentId?3:2.5}/>
            <rect x={x(i)-16} y={0} width={32} height={H} fill="transparent"/>
            <text x={x(i)} y={H-12} fontSize={10} fill="var(--text-disable)" textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel||""}</text>
          </g>
        ))}
      </svg>
      {hover!=null&&points[hover]&&(
        <div style={{position:"absolute",left:`${(x(hover)/W)*100}%`,top:6,transform:"translateX(-50%)",background:"var(--surface-A)",border:"1px solid var(--border-weak)",borderRadius:10,padding:"9px 12px",boxShadow:"0 6px 24px rgba(0,0,0,0.14)",pointerEvents:"none",maxWidth:280,zIndex:5}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:SENT_COLOR[points[hover].sentiment]}}/>
            <span style={{fontSize:12,fontWeight:600,color:SENT_COLOR[points[hover].sentiment]}}>{SENT_LABEL[points[hover].sentiment]}</span>
            <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-disable)"}}>{points[hover].dateLabel}</span>
          </div>
          <div style={{fontSize:12,color:"var(--text-primary)",lineHeight:1.4,marginBottom:points[hover].reason?3:0}}>{points[hover].title}</div>
          {points[hover].reason&&<div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.4}}>{points[hover].reason}</div>}
        </div>
      )}
    </div>
  );
}

function DimRow({ label, d }: { label: string; d?: Dim }) {
  if (!d) return null;
  const pct = d.applicable ? (d.score/20)*100 : 0;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
        <span style={{fontSize:13,fontWeight:600,color:"var(--text-primary)"}}>{label}</span>
        <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:d.applicable?dimColor(d.score):"var(--text-disable)"}}>
          {d.applicable?`${d.score}/20`:"n/a yet"}
        </span>
      </div>
      <div style={{height:6,borderRadius:99,background:"var(--surface-C)",overflow:"hidden"}}>
        <div style={{height:6,width:`${pct}%`,borderRadius:99,background:d.applicable?dimColor(d.score):"transparent",transition:"width 300ms"}}/>
      </div>
      {d.note && <p style={{margin:"6px 0 0",fontSize:12,color:"var(--text-secondary)",lineHeight:1.4}}>{d.note}</p>}
      {d.evidence && <p style={{margin:"3px 0 0",fontSize:12,color:"var(--text-disable)",lineHeight:1.45,fontStyle:"italic"}}>“{d.evidence}”</p>}
    </div>
  );
}

const msg: React.CSSProperties = { color:"var(--text-disable)", fontSize:13, fontFamily:"var(--font-mono)", padding:"20px 4px" };
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{background:"var(--surface-B)",border:"1px solid var(--border-weaker)",borderRadius:14,padding:"16px 18px"}}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <p style={{fontFamily:"var(--font-mono)",fontSize:10.5,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:0}}>{children}</p>;
}
function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return <span style={{fontFamily:"var(--font-mono)",fontSize:11,fontWeight:600,letterSpacing:"0.04em",color:fg,background:bg,borderRadius:99,padding:"4px 11px"}}>{text}</span>;
}
