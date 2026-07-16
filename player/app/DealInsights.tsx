"use client";

/**
 * Deal Insights tab — deal-level analytics across every call on the deal.
 * First metric: sentiment over time (line chart with hover). Built to grow —
 * add more metric blocks below the chart as they come.
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface Point {
  id: string;
  title: string;
  dateMs: number;
  dateLabel: string;
  sentiment: "positive" | "neutral" | "at-risk" | "unknown";
  reason: string;
  stage: string;
  score: number | null;
}

const SENT_Y: Record<string, number> = { positive: 1, neutral: 0, "at-risk": -1 };
const SENT_COLOR: Record<string, string> = {
  positive: "#1d9e75", neutral: "#b0873d", "at-risk": "#e04b4a", unknown: "#9a9a9a",
};
const SENT_LABEL: Record<string, string> = {
  positive: "Positive", neutral: "Neutral", "at-risk": "At-risk", unknown: "—",
};

export default function DealInsights({ recordId, title }: { recordId: string | null; title: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dealName, setDealName] = useState<string>("");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!recordId) { setError("No record id."); return; }
    fetch(`/api/deal-sentiment?recordId=${recordId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setDealName(d.dealName || "");
        setPoints(d.points || []);
      })
      .catch(e => setError(e.message));
  }, [recordId]);

  if (error) return <Wrap><p style={msg}>{error}</p></Wrap>;
  if (!points) return <Wrap><p style={msg}>Loading deal insights…</p></Wrap>;
  if (points.length === 0) return <Wrap><p style={msg}>No processed calls on this deal yet.</p></Wrap>;

  return (
    <Wrap>
      <div style={{maxWidth:960,margin:"0 auto",width:"100%"}}>
        <div style={{marginBottom:4}}>
          <p style={{fontFamily:"var(--font-mono)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:0}}>Deal</p>
          <h2 style={{margin:"2px 0 0",fontSize:20,fontWeight:600,color:"var(--text-primary)"}}>{dealName || title}</h2>
        </div>

        <SentimentChart points={points} hover={hover} setHover={setHover} />

        {/* Call ledger */}
        <div style={{marginTop:24}}>
          <p style={{fontFamily:"var(--font-mono)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:"0 0 8px"}}>Calls on this deal ({points.length})</p>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {points.map((p,i)=>(
              <div key={p.id}
                onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:10,
                  background:hover===i?"var(--surface-C)":"var(--surface-B)",border:"1px solid var(--border-weaker)",transition:"background 120ms"}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:SENT_COLOR[p.sentiment],flexShrink:0}}/>
                <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-disable)",width:70,flexShrink:0}}>{p.dateLabel}</span>
                <span style={{fontSize:13,color:"var(--text-primary)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.title}</span>
                {p.stage&&<span style={{fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.03em",color:"var(--text-secondary)",background:"var(--surface-C)",borderRadius:99,padding:"3px 9px",flexShrink:0}}>{p.stage}</span>}
                <span style={{fontSize:12,fontWeight:600,color:SENT_COLOR[p.sentiment],width:64,textAlign:"right",flexShrink:0}}>{SENT_LABEL[p.sentiment]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Wrap>
  );
}

function SentimentChart({ points, hover, setHover }: { points: Point[]; hover: number | null; setHover: (i: number | null) => void }) {
  const W = 920, H = 240, padX = 40, padY = 40;
  const plotW = W - padX * 2, plotH = H - padY * 2;
  const n = points.length;
  const x = (i: number) => n === 1 ? padX + plotW / 2 : padX + (plotW * i) / (n - 1);
  const y = (s: string) => padY + plotH * (1 - ((SENT_Y[s] ?? 0) + 1) / 2);

  const known = points.map((p,i)=>({p,i})).filter(o=>o.p.sentiment!=="unknown");
  const linePath = known.map((o,k)=>`${k===0?"M":"L"} ${x(o.i)} ${y(o.p.sentiment)}`).join(" ");

  const rows = [
    { s: "positive", label: "Positive" },
    { s: "neutral", label: "Neutral" },
    { s: "at-risk", label: "At-risk" },
  ];

  return (
    <div style={{position:"relative",background:"var(--surface-B)",border:"1px solid var(--border-weaker)",borderRadius:14,padding:"16px 12px 8px",marginTop:14}}>
      <p style={{fontFamily:"var(--font-mono)",fontSize:11,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:"0 0 4px 8px"}}>Sentiment over time</p>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {rows.map(r=>(
          <g key={r.s}>
            <line x1={padX} x2={W-padX} y1={y(r.s)} y2={y(r.s)} stroke="var(--border-weaker)" strokeDasharray={r.s==="neutral"?"0":"3 4"} strokeWidth={1}/>
            <text x={8} y={y(r.s)+4} fontSize={11} fill={SENT_COLOR[r.s]} fontFamily="var(--font-mono)">{r.label}</text>
          </g>
        ))}
        {linePath && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>}
        {points.map((p,i)=>(
          <g key={p.id} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} style={{cursor:"pointer"}}>
            <circle cx={x(i)} cy={y(p.sentiment)} r={hover===i?8:5.5}
              fill={SENT_COLOR[p.sentiment]} stroke="var(--surface-A)" strokeWidth={2.5}/>
            <rect x={x(i)-14} y={0} width={28} height={H} fill="transparent"/>
            <text x={x(i)} y={H-14} fontSize={10} fill="var(--text-disable)" textAnchor="middle" fontFamily="var(--font-mono)">{p.dateLabel}</text>
          </g>
        ))}
      </svg>
      {hover!=null && points[hover] && (
        <div style={{position:"absolute",left:`${(x(hover)/W)*100}%`,top:8,transform:"translateX(-50%)",
          background:"var(--surface-A)",border:"1px solid var(--border-weak)",borderRadius:10,padding:"9px 12px",
          boxShadow:"0 6px 24px rgba(0,0,0,0.14)",pointerEvents:"none",maxWidth:280,zIndex:5}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:SENT_COLOR[points[hover].sentiment]}}/>
            <span style={{fontSize:12,fontWeight:600,color:SENT_COLOR[points[hover].sentiment]}}>{SENT_LABEL[points[hover].sentiment]}</span>
            <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-disable)"}}>{points[hover].dateLabel}</span>
          </div>
          <div style={{fontSize:12,color:"var(--text-primary)",lineHeight:1.4,marginBottom:points[hover].reason?3:0}}>{points[hover].title}</div>
          {points[hover].reason && <div style={{fontSize:11,color:"var(--text-secondary)",lineHeight:1.4}}>{points[hover].reason}</div>}
        </div>
      )}
    </div>
  );
}

const msg: React.CSSProperties = { color:"var(--text-disable)", fontSize:13, fontFamily:"var(--font-mono)", textAlign:"center", marginTop:60 };
function Wrap({ children }: { children: React.ReactNode }) {
  return <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"18px"}}>{children}</div>;
}
