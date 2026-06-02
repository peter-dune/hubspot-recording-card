"use client";
import React, { useEffect, useRef, useState, useCallback, ChangeEvent, ReactNode } from "react";

/* ── types ─────────────────────────────────────────────────── */
interface Segment { speaker: string; text: string; startsAt: number; endsAt: number; }
interface Metadata { call_title?: string; call_name?: string; host?: string; call_date?: string; }
interface Chapter { time: string; title: string; }
interface Signal {
  type: string;
  label: string;
  quote: string;
  speaker: string;
  timestamp: string; // MM:SS
  importance: "high" | "medium" | "low";
}

/* ── signal helpers ─────────────────────────────────────────── */
const SIG_TYPES: Record<string, { label: string; color: string }> = {
  buying_signal: { label: "Buying Intent",    color: "var(--color-green-500, #109c6b)" },
  pain_point:    { label: "Pain Point",        color: "var(--color-red-500,   #e53430)" },
  objection:     { label: "Objection",         color: "var(--color-red-500,   #e53430)" },
  key_question:  { label: "Key Question",      color: "var(--color-blue-500,  #446bce)" },
  action_item:   { label: "Action Item",       color: "var(--color-orange-400,#f4603e)" },
  competitor:    { label: "Competitor",        color: "#d4b739" },
  timeline:      { label: "Timeline",          color: "var(--color-orange-400,#f4603e)" },
  decision_maker:{ label: "Decision Maker",    color: "var(--color-blue-500,  #446bce)" },
};
function sigColor(type: string) { return SIG_TYPES[type]?.color ?? "var(--accent)"; }
function sigLabel(type: string) { return SIG_TYPES[type]?.label ?? type; }
function sigToSec(ts: string): number {
  const p = ts.split(":").map(Number);
  return p.length === 2 ? p[0]*60+p[1] : p[0]*3600+p[1]*60+(p[2]||0);
}

/* ── helpers ────────────────────────────────────────────────── */
function fmt(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}
function fmtMs(ms: number) { return ms < 0 ? "" : fmt(ms / 1000); }
function formatDate(raw: string) {
  try {
    const ts = Number(raw); const d = isNaN(ts) ? new Date(raw) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}
function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const parts: ReactNode[] = []; let pos = 0;
  const lo = text.toLowerCase(), ql = q.toLowerCase(); let i = lo.indexOf(ql, 0), n = 0;
  while (i !== -1) {
    if (i > pos) parts.push(text.slice(pos, i));
    parts.push(<mark key={n++} style={{ background: "color-mix(in srgb,#f9dc5c 65%,transparent)", borderRadius: 2, padding: "0 1px" }}>{text.slice(i, i + q.length)}</mark>);
    pos = i + q.length; i = lo.indexOf(ql, pos);
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}
const PALETTES = ["#f4603e","#446bce","#109c6b","#7c5cff","#f9dc5c","#e53430","#0fb6b0","#1a42b7"];
function speakerColor(name: string, map: Map<string,string>) {
  if (!map.has(name)) map.set(name, PALETTES[map.size % PALETTES.length]);
  return map.get(name)!;
}
function initials(name: string) { return name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function calcTalkTime(segs: Segment[]) {
  const t: Record<string,number> = {};
  for (let i=0;i<segs.length;i++) {
    if (!segs[i].speaker) continue;
    const dur = (segs[i].endsAt>=0&&segs[i].startsAt>=0) ? segs[i].endsAt-segs[i].startsAt : 5000;
    t[segs[i].speaker]=(t[segs[i].speaker]||0)+dur;
  }
  const total=Object.values(t).reduce((a,b)=>a+b,0)||1;
  return Object.entries(t).map(([s,ms])=>({speaker:s,pct:Math.round((ms/total)*100)})).sort((a,b)=>b.pct-a.pct);
}
function chapterToSec(time: string) {
  const p=time.split(":").map(Number);
  return p.length===2?p[0]*60+p[1]:p[0]*3600+p[1]*60+(p[2]||0);
}

/* ── icons ──────────────────────────────────────────────────── */
const Play=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="currentColor"{...p}><path d="M8 5.5v13a.7.7 0 0 0 1.06.6l10.2-6.5a.7.7 0 0 0 0-1.2L9.06 4.9A.7.7 0 0 0 8 5.5z"/></svg>;
const Pause=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="currentColor"{...p}><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>;
const Back10=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M11 5 6.5 9.5 11 14"/><path d="M6.8 9.5H15a4.5 4.5 0 0 1 0 9H9"/></svg>;
const Fwd10=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M13 5l4.5 4.5L13 14"/><path d="M17.2 9.5H9a4.5 4.5 0 0 0 0 9h6"/></svg>;
const VolIcon=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M4 9v6h3.5L13 19V5L7.5 9z" fill="currentColor" stroke="none"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/></svg>;
const MuteIcon=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M4 9v6h3.5L13 19V5L7.5 9z" fill="currentColor" stroke="none"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>;
const FullIcon=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>;
const SearchIcon=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>;
const CloseIcon=(p:React.SVGProps<SVGSVGElement>)=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"{...p}><path d="M6 6l12 12M18 6 6 18"/></svg>;

/* ── Scrubber ────────────────────────────────────────────────── */
function Scrubber({time,duration,onSeek}:{time:number;duration:number;onSeek:(t:number)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const [hover,setHover]=useState<number|null>(null);
  const pct=duration?(time/duration)*100:0;
  const getT=(x:number)=>{const r=ref.current!.getBoundingClientRect();return Math.max(0,Math.min(duration,((x-r.left)/r.width)*duration));};
  const onDown=(e:React.PointerEvent)=>{onSeek(getT(e.clientX));const mv=(ev:PointerEvent)=>onSeek(getT(ev.clientX));const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);};window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);};
  return (
    <div style={{width:"100%",padding:"8px 0",cursor:"pointer"}} onPointerDown={onDown} onPointerMove={e=>{const r=ref.current!.getBoundingClientRect();setHover(((e.clientX-r.left)/r.width)*100);}} onPointerLeave={()=>setHover(null)}>
      <div ref={ref} style={{position:"relative",height:5,borderRadius:99,background:"color-mix(in srgb,currentColor 14%,transparent)"}}>
        <div style={{position:"absolute",inset:0,right:"auto",width:pct+"%",borderRadius:99,background:"var(--accent)"}}/>
        {hover!=null&&<div style={{position:"absolute",inset:0,right:"auto",width:Math.max(0,Math.min(100,hover))+"%",borderRadius:99,background:"color-mix(in srgb,currentColor 20%,transparent)"}}/>}
        <div style={{position:"absolute",top:"50%",left:pct+"%",width:13,height:13,borderRadius:"50%",background:"var(--accent)",transform:"translate(-50%,-50%)",boxShadow:"0 0 0 4px color-mix(in srgb,var(--accent) 26%,transparent)"}}/>
      </div>
    </div>
  );
}

/* ── Volume ─────────────────────────────────────────────────── */
function VolCtrl({vol,muted,onVol,onMute}:{vol:number;muted:boolean;onVol:(v:number)=>void;onMute:()=>void}) {
  const [open,setOpen]=useState(false); const v=muted?0:vol;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
      <button onClick={onMute} style={ctrlBtn}>{v===0?<MuteIcon width={19} height={19}/>:<VolIcon width={19} height={19}/>}</button>
      <div style={{width:open?72:0,overflow:"hidden",transition:"width 180ms",display:"flex",alignItems:"center"}}>
        <input type="range" min="0" max="1" step="0.01" value={v} className="vol-range" style={{"--vp":v*100+"%"} as React.CSSProperties} onChange={(e:ChangeEvent<HTMLInputElement>)=>onVol(parseFloat(e.target.value))}/>
      </div>
    </div>
  );
}

/* ── Speed ──────────────────────────────────────────────────── */
function SpeedCtrl({rate,onRate}:{rate:number;onRate:(r:number)=>void}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{...ctrlBtn,width:"auto",padding:"0 10px",fontFamily:"var(--font-mono)",fontSize:12,minWidth:44}}>{rate}×</button>
      {open&&<div className="speed-menu">{[0.5,0.75,1,1.25,1.5,2].map(r=><button key={r} data-on={r===rate} onClick={()=>{onRate(r);setOpen(false);}}>{r}×{r===1?"  Normal":""}</button>)}</div>}
    </div>
  );
}

const ctrlBtn: React.CSSProperties={display:"inline-grid",placeItems:"center",width:36,height:36,borderRadius:9,color:"var(--text-secondary)",transition:"background 140ms,color 140ms"};

/* ── Main ───────────────────────────────────────────────────── */
/* ── SignalsFeed ─────────────────────────────────────────────── */
function SignalsFeed({ signals, time, duration, onSeek, colorMap }: {
  signals: Signal[]; time: number; duration: number;
  onSeek: (t: number) => void; colorMap: Map<string,string>;
}) {
  const [activeType, setActiveType] = useState<string|null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement|null)[]>([]);
  const LIVE_WINDOW = 16; // seconds a signal shows as "live"

  // Build type counts
  const typeCounts = signals.reduce((acc, s) => {
    acc[s.type] = (acc[s.type]||0)+1; return acc;
  }, {} as Record<string,number>);

  const sorted = [...signals].sort((a,b)=>sigToSec(a.timestamp)-sigToSec(b.timestamp));
  const filtered = activeType ? sorted.filter(s=>s.type===activeType) : sorted;

  function sigState(s: Signal): "upcoming"|"live"|"captured" {
    const t = sigToSec(s.timestamp);
    if (t > time) return "upcoming";
    if (time - t < LIVE_WINDOW) return "live";
    return "captured";
  }

  // Icons per type
  const SIG_ICONS: Record<string,string> = {
    buying_signal:"↑", pain_point:"!", objection:"✕", key_question:"?",
    action_item:"→", competitor:"⚡", timeline:"⏱", decision_maker:"👤",
  };

  return (
    <div className="sig" style={{marginTop:4}}>
      {/* Header */}
      <div className="sig-head">
        <div className="sig-head-l">
          <h2 className="sig-h">Call Signals</h2>
          <span className="sig-count">{signals.length} <i>captured</i></span>
        </div>
        {/* Filter chips */}
        <div className="sig-filters">
          <button className={`sig-chip${!activeType?" on":""}`} onClick={()=>setActiveType(null)}>
            All <em>{signals.length}</em>
          </button>
          {Object.entries(typeCounts).map(([type, count])=>(
            <button key={type} className={`sig-chip${activeType===type?" on":""}`}
              style={{"--tc":sigColor(type)} as React.CSSProperties}
              onClick={()=>setActiveType(activeType===type?null:type)}>
              <span className="sig-chip-dot"/>
              {sigLabel(type)} <em>{count}</em>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline strip */}
      <div className="sig-strip">
        <div className="sig-strip-line"/>
        <div className="sig-strip-fill" style={{width:duration>0?(time/duration)*100+"%":"0%"}}/>
        {signals.map((s,i)=>{
          const t=sigToSec(s.timestamp);
          const state=sigState(s);
          const dim=activeType&&s.type!==activeType;
          // Find index in sorted list for scroll target
          const sortedIdx = sorted.findIndex((_,si)=>sorted[si]===s);
          return(
            <button key={i} className={`sig-mark ${state==="captured"?"sig-mark-captured":state==="live"?"sig-mark-live":""} ${dim?"sig-mark-off":""}`}
              style={{left:duration>0?(t/duration)*100+"%":"0%","--tc":sigColor(s.type)} as React.CSSProperties}
              onClick={()=>{
                onSeek(t);
                // Scroll the list to the matching card
                if(listRef.current && cardRefs.current[sortedIdx]){
                  const el=cardRefs.current[sortedIdx]!;
                  const container=listRef.current;
                  container.scrollTo({top:el.offsetTop-container.offsetTop-12,behavior:"smooth"});
                }
              }} title={s.label}/>
          );
        })}
        <div className="sig-strip-head" style={{left:duration>0?(time/duration)*100+"%":"0%"}}/>
      </div>

      {/* Signal cards */}
      <div className="sig-list" ref={listRef}>
        {filtered.map((s,i)=>{
          const t=sigToSec(s.timestamp);
          const state=sigState(s);
          const color=sigColor(s.type);
          const spkColor=speakerColor(s.speaker,colorMap);
          return(
            <button key={i} ref={el=>{cardRefs.current[i]=el;}} className={`sig-row is-${state}`}
              style={{"--tc":color,"--sc":spkColor} as React.CSSProperties}
              onClick={()=>onSeek(t)}>
              <div className="sig-rule"/>
              <div className="sig-ico">
                <span style={{fontSize:15}}>{SIG_ICONS[s.type]??"•"}</span>
              </div>
              <div className="sig-body">
                <div className="sig-meta">
                  <span className="sig-type">{sigLabel(s.type)}</span>
                  <span className="sig-dot-sep"/>
                  <span className="sig-spk">{s.speaker.split(" ")[0]}</span>
                  {state==="live"&&<span className="sig-live">● Live</span>}
                  {state==="upcoming"&&<span className="sig-up">Upcoming</span>}
                </div>
                <div className="sig-title">{s.label}</div>
                {s.quote&&<div className="sig-quote">"{s.quote}"</div>}
              </div>
              <span className="sig-time">{s.timestamp}</span>
              <span className="sig-jump">→</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Page() {
  const [videoUrl,setVideoUrl]=useState<string|null>(null);
  const [segments,setSegments]=useState<Segment[]>([]);
  const [metadata,setMetadata]=useState<Metadata>({});
  const [chapters,setChapters]=useState<Chapter[]>([]);
  const [signals,setSignals]=useState<Signal[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);

  const videoRef=useRef<HTMLVideoElement>(null);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [vol,setVol]=useState(0.8);
  const [muted,setMuted]=useState(false);
  const [rate,setRate]=useState(1);

  const [activeIdx,setActiveIdx]=useState(-1);
  const [autoScroll,setAutoScroll]=useState(true);
  const [query,setQuery]=useState("");
  const txRef=useRef<HTMLDivElement>(null);
  const lineRefs=useRef<(HTMLDivElement|null)[]>([]);
  const colorMap=useRef(new Map<string,string>());
  const isProgrammaticScroll=useRef(false);
  const hasTimestamps=segments.some(s=>s.startsAt>=0);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    const engagementId=p.get("engagementId"); const recordId=p.get("recordId");
    if (!engagementId){setError("No engagementId.");setLoading(false);return;}
    const qs=new URLSearchParams({engagementId});
    if(recordId)qs.set("recordId",recordId);
    fetch(`/api/recording-data?${qs}`).then(r=>r.json()).then(data=>{
      if(data.error)throw new Error(data.error);
      if(!data.videoUrl)throw new Error("No video URL.");
      setVideoUrl(data.videoUrl);setMetadata(data.metadata||{});setSegments(data.segments||[]);setChapters(data.chapters||[]);setSignals(data.signals||[]);
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  },[]);

  const onTimeUpdate=useCallback(()=>{
    const v=videoRef.current; if(!v)return;
    setTime(v.currentTime);
    if(!hasTimestamps)return;
    const ms=v.currentTime*1000; let found=-1;
    for(let i=segments.length-1;i>=0;i--){if(segments[i].startsAt<=ms){found=i;break;}}
    if(found!==activeIdx){
      setActiveIdx(found);
      if(autoScroll&&found>=0&&lineRefs.current[found]&&txRef.current){
        isProgrammaticScroll.current=true;
        const el=lineRefs.current[found]!;
        const container=txRef.current;
        const elRect=el.getBoundingClientRect();
        const contRect=container.getBoundingClientRect();
        const target=container.scrollTop+(elRect.top-contRect.top)-80;
        container.scrollTo({top:Math.max(0,target),behavior:"smooth"});
        setTimeout(()=>{isProgrammaticScroll.current=false;},800);
      }
    }
  },[segments,activeIdx,autoScroll,hasTimestamps]);

  const seekTo=(t:number)=>{if(videoRef.current)videoRef.current.currentTime=t;};
  const seekBy=(d:number)=>{if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime+d);};
  const togglePlay=()=>{if(videoRef.current){playing?videoRef.current.pause():videoRef.current.play();}};

  // active speaker for caption + camera rail
  const activeSeg=activeIdx>=0?segments[activeIdx]:segments[0];
  const activeSpeaker=activeSeg?.speaker||"";
  const talkTime=calcTalkTime(segments);
  const activeChapterObj=chapters.reduce((acc,c)=>chapterToSec(c.time)<=time?c:acc,chapters[0]);
  const hits=query?segments.filter(s=>s.text.toLowerCase().includes(query.toLowerCase())).length:0;
  const title=metadata.call_title||metadata.call_name||"Call Recording";
  const date=metadata.call_date?formatDate(metadata.call_date):null;

  if(loading)return(
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"var(--surface-A)"}}>
      <div style={{textAlign:"center"}}><div style={{width:32,height:32,border:"2px solid var(--accent)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/><p style={{color:"var(--text-disable)",fontSize:13,fontFamily:"var(--font-mono)"}}>Loading…</p></div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if(error||!videoUrl)return(<div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center"}}><p style={{color:"#e53430",fontSize:13}}>{error??"Recording unavailable."}</p></div>);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",background:"var(--surface-A)"}}>


      {/* BODY */}
      <div style={{flex:1,minHeight:0,display:"grid",gridTemplateColumns:(chapters.length>0||talkTime.length>0)?"200px 1fr 420px":"1fr 420px",gap:12,padding:"14px 18px 18px"}}>

        {/* LEFT RAIL */}
        {(chapters.length>0||talkTime.length>0)&&(
          <div style={{display:"flex",flexDirection:"column",gap:6,minHeight:0,overflowY:"auto",paddingRight:4}}>
            {talkTime.length>0&&(
              <>
                <p style={{fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:"8px 2px 3px"}}>Talk Time</p>
                <div style={{background:"var(--surface-B)",border:"1px solid var(--border-weaker)",borderRadius:10,padding:12}}>
                  <div style={{display:"flex",height:8,borderRadius:999,overflow:"hidden",gap:2,marginBottom:11}}>
                    {talkTime.map((t,i)=><div key={i} style={{flex:t.pct,background:speakerColor(t.speaker,colorMap.current)}}/>)}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {talkTime.map((t,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:speakerColor(t.speaker,colorMap.current),flexShrink:0}}/>
                        <span style={{flex:1,fontSize:12,color:"var(--text-secondary)"}}>{t.speaker.split(" ")[0]}</span>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-primary)"}}>{t.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {chapters.length>0&&(
              <>
                <p style={{fontFamily:"var(--font-mono)",fontSize:10,textTransform:"uppercase",letterSpacing:"0.07em",color:"var(--text-disable)",margin:"8px 2px 3px"}}>Chapters</p>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {chapters.map((c,i)=>{
                    const isActive=c===activeChapterObj;
                    const next=chapters[i+1];
                    const prog=next?(Math.max(0,Math.min(1,(time-chapterToSec(c.time))/(chapterToSec(next.time)-chapterToSec(c.time))))):1;
                    return(
                      <button key={i} onClick={()=>seekTo(chapterToSec(c.time))} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px 12px",borderRadius:10,background:isActive?"color-mix(in srgb,var(--accent) 12%,transparent)":"transparent",border:"none",cursor:"pointer",textAlign:"left",width:"100%",position:"relative"}}>
                        <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:isActive?"var(--accent)":"var(--text-disable)",flexShrink:0}}>{String(i+1).padStart(2,"0")}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontSize:12.5,color:"var(--text-primary)",lineHeight:1.35,fontWeight:isActive?500:400}}>{c.title}</p>
                          <p style={{fontFamily:"var(--font-mono)",fontSize:10,color:isActive?"var(--accent)":"var(--text-secondary)",marginTop:2}}>{c.time}</p>
                        </div>
                        <div style={{position:"absolute",left:10,right:10,bottom:4,height:2,background:"color-mix(in srgb,var(--text-primary) 10%,transparent)",borderRadius:1,overflow:"hidden"}}>
                          <div style={{height:"100%",background:"var(--accent)",width:prog*100+"%",transition:"width 1s linear"}}/>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* CENTER — video + controls + signals (scrollable) */}
        <div style={{display:"flex",flexDirection:"column",gap:10,minWidth:0,overflowY:"auto",scrollbarWidth:"thin",paddingRight:4}}>
          {/* 2. VIDEO with camera rail */}
          <div style={{position:"relative",aspectRatio:"16/9",background:"#0b0b10",borderRadius:14,overflow:"hidden",flex:"0 0 auto"}}>
            <video ref={videoRef} src={videoUrl}
              style={{width:"100%",height:"100%",display:"block"}}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={()=>{if(videoRef.current)setDuration(videoRef.current.duration);}}
              onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
              onVolumeChange={()=>{if(videoRef.current){setVol(videoRef.current.volume);setMuted(videoRef.current.muted);}}}
            />

            {/* 5. Branded play overlay */}
            {!playing&&(
              <button onClick={togglePlay} className="stage-play">
                <Play width={32} height={32}/>
              </button>
            )}

          </div>

          {/* Controls */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <Scrubber time={time} duration={duration} onSeek={seekTo}/>
            <div style={{display:"flex",alignItems:"center",gap:2}}>
              <button onClick={togglePlay} style={{display:"grid",placeItems:"center",width:40,height:40,borderRadius:11,background:"var(--accent)",color:"var(--on-accent)",flexShrink:0,border:"none",cursor:"pointer"}}>
                {playing?<Pause width={20} height={20}/>:<Play width={20} height={20}/>}
              </button>
              <button onClick={()=>seekBy(-10)} style={ctrlBtn}><Back10 width={19} height={19}/></button>
              <button onClick={()=>seekBy(10)} style={ctrlBtn}><Fwd10 width={19} height={19}/></button>
              <span style={{fontFamily:"var(--font-mono)",fontSize:12,color:"var(--text-secondary)",marginLeft:8,whiteSpace:"nowrap"}}>
                <b style={{color:"var(--text-primary)",fontWeight:400}}>{fmt(time)}</b>
                <span style={{color:"var(--text-disable)"}}> / </span>{fmt(duration)}
              </span>
              <span style={{flex:1}}/>
              <VolCtrl vol={vol} muted={muted} onVol={v=>{if(videoRef.current)videoRef.current.volume=v;}} onMute={()=>{if(videoRef.current)videoRef.current.muted=!videoRef.current.muted;}}/>
              <SpeedCtrl rate={rate} onRate={r=>{setRate(r);if(videoRef.current)videoRef.current.playbackRate=r;}}/>
              <button onClick={()=>videoRef.current?.requestFullscreen()} style={ctrlBtn}><FullIcon width={18} height={18}/></button>
            </div>
          </div>

          {/* SIGNALS FEED */}
          {signals.length>0&&(
            <SignalsFeed signals={signals} time={time} duration={duration} onSeek={(t)=>{seekTo(t);videoRef.current?.play();}} colorMap={colorMap.current}/>
          )}

        </div>

        {/* RIGHT — transcript */}
        <div style={{display:"flex",flexDirection:"column",minHeight:0,background:"var(--surface-B)",border:"1px solid var(--border-weaker)",borderRadius:14,overflow:"hidden"}}>
          {/* Header */}
          <div style={{padding:"12px 12px 0",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontFamily:"var(--font-mono)",fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text-disable)"}}>Transcript</span>
              {hasTimestamps&&(
                <button onClick={()=>{
                  const next=!autoScroll; setAutoScroll(next);
                  if(next&&activeIdx>=0&&lineRefs.current[activeIdx]&&txRef.current){
                    isProgrammaticScroll.current=true;
                    const el2=lineRefs.current[activeIdx]!;const cont2=txRef.current;
                    const target2=cont2.scrollTop+(el2.getBoundingClientRect().top-cont2.getBoundingClientRect().top)-80;
                    cont2.scrollTo({top:Math.max(0,target2),behavior:"smooth"});
                    setTimeout(()=>{isProgrammaticScroll.current=false;},800);
                  }
                }} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:"var(--font-mono)",fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",color:autoScroll?"var(--accent)":"var(--text-disable)",border:`1px solid ${autoScroll?"color-mix(in srgb,var(--accent) 40%,transparent)":"var(--border-weaker)"}`,padding:"4px 8px",borderRadius:99,background:"none",cursor:"pointer"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"currentColor"}}/>
                  {autoScroll?"Following":"Paused"}
                </button>
              )}
            </div>
            {/* Search */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:9,background:"var(--surface-A)",border:"1px solid var(--border-weaker)",margin:"0 0 8px"}}>
              <SearchIcon width={14} height={14} style={{color:"var(--text-disable)",flexShrink:0}}/>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transcript…"
                style={{flex:1,border:"none",background:"transparent",outline:"none",fontSize:13,color:"var(--text-primary)",fontFamily:"var(--font-sans)"}}/>
              {query&&<span style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--text-disable)"}}>{hits}</span>}
              {query&&<button onClick={()=>setQuery("")} style={{color:"var(--text-disable)",display:"grid",placeItems:"center",background:"none",border:"none",cursor:"pointer"}}><CloseIcon width={13} height={13}/></button>}
            </div>
          </div>

          {/* 3. TRANSCRIPT LINES */}
          <div ref={txRef} onScroll={()=>{if(!isProgrammaticScroll.current)setAutoScroll(false);}}
            style={{flex:1,overflowY:"auto",padding:"2px 10px 20px",scrollbarWidth:"thin"}}>
            {segments.length===0?(
              <p style={{color:"var(--text-disable)",fontSize:13,padding:"20px 8px",fontStyle:"italic"}}>No transcript available.</p>
            ):(
              segments.map((seg,i)=>{
                const fresh=i===0||segments[i-1].speaker!==seg.speaker;
                const isActive=i===activeIdx;
                const isPast=hasTimestamps&&i<activeIdx;
                const dim=query&&!seg.text.toLowerCase().includes(query.toLowerCase());
                if(dim)return null;
                return(
                  <div key={i} ref={el=>{lineRefs.current[i]=el;}}
                    style={{display:"flex",gap:10,padding:"7px 8px",borderRadius:8,cursor:"pointer",position:"relative",
                      marginTop:fresh?8:2,
                      opacity:isPast&&!query?0.35:1,
                      background:isActive?"color-mix(in srgb,var(--accent) 13%,transparent)":"transparent",
                      transition:"background 140ms,opacity 200ms"}}
                    onClick={()=>{if(seg.startsAt>=0&&videoRef.current){videoRef.current.currentTime=seg.startsAt/1000;videoRef.current.play();setAutoScroll(true);}}}>
                    {/* timestamp */}
                    <span style={{fontFamily:"var(--font-mono)",fontSize:10,color:isActive?"var(--accent)":"var(--text-disable)",paddingTop:3,width:32,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
                      {fmtMs(seg.startsAt)}
                    </span>
                    {/* body */}
                    <div style={{flex:1,minWidth:0}}>
                      {fresh&&<span style={{display:"block",fontSize:11,fontWeight:600,letterSpacing:"0.02em",marginBottom:2,color:"var(--text-primary)"}}>{seg.speaker}</span>}
                      <p style={{margin:0,fontSize:13,lineHeight:1.48,color:isActive?"var(--text-primary)":"var(--text-secondary)",textWrap:"pretty"} as React.CSSProperties}>
                        {highlight(seg.text,query)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(244,96,62,0.4);}70%{box-shadow:0 0 0 6px rgba(244,96,62,0);}}
        @keyframes eq{0%,100%{transform:scaleY(0.4);}50%{transform:scaleY(1);}}
        input[type=range].vol-range{-webkit-appearance:none;appearance:none;width:60px;height:4px;border-radius:2px;background:linear-gradient(to right,var(--accent) var(--vp,80%),color-mix(in srgb,currentColor 20%,transparent) var(--vp,80%));cursor:pointer;outline:none;}
        input[type=range].vol-range::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:var(--accent);}
        .speed-menu{position:absolute;bottom:calc(100% + 8px);right:0;z-index:30;background:var(--surface-A);border:1px solid var(--border-weaker);border-radius:10px;padding:5px;box-shadow:0 32px 80px rgba(29,29,32,0.12);min-width:128px;}
        .speed-menu button{display:flex;width:100%;align-items:center;gap:8px;padding:8px 10px;border-radius:7px;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);text-align:left;border:none;background:none;cursor:pointer;}
        .speed-menu button:hover{background:var(--surface-C);color:var(--text-primary);}
        .speed-menu button[data-on="true"]{background:var(--surface-C);color:var(--text-primary);}
        /* camera rail */
        .cam-rail{position:absolute;top:0;right:0;bottom:0;z-index:4;width:132px;padding:14px 14px 14px 0;display:flex;flex-direction:column;gap:8px;justify-content:center;}
        .cam-tile{position:relative;width:100%;aspect-ratio:16/11;flex:0 1 auto;border:none;cursor:pointer;padding:0;border-radius:11px;overflow:hidden;background:linear-gradient(150deg,color-mix(in srgb,var(--cam) 70%,#0b0b10),color-mix(in srgb,var(--cam) 28%,#08080c));box-shadow:inset 0 0 0 1px rgba(255,255,255,0.07),0 6px 16px rgba(0,0,0,0.35);opacity:0.62;transition:opacity 180ms,transform 180ms,box-shadow 180ms;}
        .cam-tile:hover{opacity:0.85;transform:translateX(-2px);}
        .cam-tile.on{opacity:1;box-shadow:inset 0 0 0 2px var(--accent),0 8px 20px rgba(0,0,0,0.45);}
        .cam-tile-face{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--font-mono);font-size:21px;color:#fff;letter-spacing:0.02em;text-shadow:0 1px 6px rgba(0,0,0,0.4);}
        .cam-tile-name{position:absolute;left:7px;bottom:6px;z-index:2;font-family:var(--font-mono);font-size:9px;letter-spacing:0.03em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,0.42);padding:2px 7px;border-radius:999px;}
        .cam-tile-eq{position:absolute;right:7px;bottom:8px;z-index:2;display:flex;align-items:flex-end;gap:2px;height:12px;}
        .cam-tile-eq i{width:2.5px;background:var(--accent);border-radius:1px;height:40%;animation:eq 0.9s ease infinite;display:block;}
        .cam-tile-eq i:nth-child(2){animation-delay:0.15s;height:75%;}
        .cam-tile-eq i:nth-child(3){animation-delay:0.3s;height:55%;}
        /* play overlay */
        .stage-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5;width:80px;height:80px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(15,15,21,0.5);backdrop-filter:blur(10px);color:#fff;cursor:pointer;display:grid;place-items:center;padding-left:4px;transition:transform 150ms,background 150ms,border-color 150ms;}
        .stage-play:hover{transform:translate(-50%,-50%) scale(1.06);background:var(--accent);border-color:var(--accent);}

        /* ── SIGNALS ── */
        .sig{--tc:var(--accent);font-family:var(--font-sans);color:var(--text-primary);-webkit-font-smoothing:antialiased;}
        .sig *,.sig *::before,.sig *::after{box-sizing:border-box;}
        .sig-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
        .sig-head-l{display:flex;align-items:center;gap:10px;}
        .sig-h{font-size:18px;font-weight:500;letter-spacing:-0.01em;margin:0;}
        .sig-count{font-family:var(--font-mono);font-size:12px;color:var(--text-primary);background:var(--surface-C);border-radius:999px;padding:3px 10px;}
        .sig-count i{color:var(--text-disable);font-style:normal;}
        .sig-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
        .sig-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:10px;letter-spacing:0.01em;text-transform:uppercase;color:var(--text-secondary);background:transparent;border:1px solid var(--border-weaker);border-radius:999px;padding:5px 10px;cursor:pointer;transition:all 140ms;}
        .sig-chip:hover{border-color:var(--border-strong);color:var(--text-primary);}
        .sig-chip em{font-style:normal;color:var(--text-disable);}
        .sig-chip-dot{width:7px;height:7px;border-radius:2px;rotate:45deg;background:var(--tc);}
        .sig-chip.on{color:var(--text-primary);border-color:color-mix(in srgb,var(--tc) 55%,var(--border-weak));background:color-mix(in srgb,var(--tc) 9%,transparent);}
        .sig-chip.on em{color:var(--text-secondary);}
        /* strip */
        .sig-strip{position:relative;height:28px;margin:4px 2px 18px;}
        .sig-strip-line{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);background:var(--border-weaker);border-radius:2px;}
        .sig-strip-fill{position:absolute;left:0;top:50%;height:2px;transform:translateY(-50%);background:color-mix(in srgb,var(--text-primary) 24%,transparent);border-radius:2px;}
        .sig-mark{position:absolute;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:11px;height:11px;border-radius:2px;border:none;cursor:pointer;padding:0;background:var(--surface-A);box-shadow:inset 0 0 0 2px var(--tc);transition:transform 150ms;}
        .sig-mark:hover{transform:translate(-50%,-50%) rotate(45deg) scale(1.3);}
        .sig-mark-captured{background:var(--tc);}
        .sig-mark-live{background:var(--tc);animation:sig-pulse 1.8s ease infinite;}
        .sig-mark-off{opacity:0.22;}
        .sig-strip-head{position:absolute;top:2px;bottom:2px;width:2px;transform:translateX(-50%);background:var(--text-primary);border-radius:2px;}
        .sig-strip-head::before{content:"";position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:7px;height:7px;border-radius:50%;background:var(--text-primary);}
        @keyframes sig-pulse{0%,100%{box-shadow:0 0 0 3px color-mix(in srgb,var(--tc) 30%,transparent);}50%{box-shadow:0 0 0 7px color-mix(in srgb,var(--tc) 0%,transparent);}}
        /* list */
        .sig-list{display:flex;flex-direction:column;gap:7px;padding:2px 2px 16px;max-height:420px;overflow-y:auto;scrollbar-width:none;}
        .sig-list::-webkit-scrollbar{display:none;}
        /* row */
        .sig-row{position:relative;display:grid;grid-template-columns:auto 1fr auto auto;align-items:start;gap:12px;width:100%;text-align:left;cursor:pointer;padding:13px 14px 13px 17px;border-radius:10px;background:var(--surface-B);border:1px solid var(--border-weaker);transition:background 140ms,border-color 140ms,opacity 200ms;}
        .sig-row:hover{border-color:var(--border-strong);}
        .sig-rule{position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--tc);}
        .sig-ico{flex:none;width:28px;height:28px;border-radius:6px;display:grid;place-items:center;color:var(--tc);background:color-mix(in srgb,var(--tc) 13%,transparent);margin-top:1px;font-size:14px;}
        .sig-body{min-width:0;display:flex;flex-direction:column;gap:4px;}
        .sig-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .sig-type{font-family:var(--font-mono);font-size:10px;letter-spacing:0.04em;text-transform:uppercase;color:var(--tc);}
        .sig-dot-sep{width:3px;height:3px;border-radius:50%;background:var(--border-strong);}
        .sig-spk{font-size:12px;color:var(--text-secondary);position:relative;padding-left:13px;}
        .sig-spk::before{content:"";position:absolute;left:0;top:50%;transform:translateY(-50%);width:7px;height:7px;border-radius:50%;background:var(--sc);}
        .sig-live{font-family:var(--font-mono);font-size:9px;letter-spacing:0.04em;text-transform:uppercase;color:var(--tc);}
        .sig-up{font-family:var(--font-mono);font-size:9px;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-disable);border:1px solid var(--border-weaker);border-radius:999px;padding:1px 7px;}
        .sig-title{font-size:14px;font-weight:500;line-height:1.35;color:var(--text-primary);letter-spacing:-0.005em;}
        .sig-quote{font-size:12.5px;line-height:1.5;color:var(--text-secondary);font-style:italic;}
        .sig-time{font-family:var(--font-mono);font-size:11px;color:var(--text-disable);font-variant-numeric:tabular-nums;padding-top:2px;}
        .sig-jump{flex:none;color:var(--text-disable);opacity:0;transition:opacity 140ms;padding-top:3px;font-size:14px;}
        .sig-row:hover .sig-jump{opacity:1;}
        /* states */
        .is-upcoming{opacity:0.48;}
        .is-upcoming .sig-rule{background:var(--border-strong);}
        .is-upcoming .sig-ico{color:var(--text-disable);background:var(--surface-C);}
        .is-upcoming .sig-type{color:var(--text-secondary);}
        .is-captured{background:var(--surface-A);}
        .is-live{background:color-mix(in srgb,var(--tc) 7%,var(--surface-A));border-color:color-mix(in srgb,var(--tc) 40%,var(--border-weak));box-shadow:0 2px 12px rgba(0,0,0,0.06);}
      `}</style>
    </div>
  );
}
