"use client";

import React, { useEffect, useRef, useState, useCallback, ChangeEvent, ReactNode } from "react";

/* ── types ───────────────────────────────────────────────────── */
interface Segment { speaker: string; text: string; startsAt: number; endsAt: number; }
interface Metadata { call_title?: string; call_name?: string; host?: string; call_date?: string; }
interface Chapter { time: string; title: string; }

/* ── talk time calculation ───────────────────────────────────── */
function calcTalkTime(segments: Segment[]): { speaker: string; pct: number }[] {
  const totals: Record<string, number> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.speaker) continue;
    const dur = seg.endsAt >= 0 && seg.startsAt >= 0 ? seg.endsAt - seg.startsAt : 5000;
    totals[seg.speaker] = (totals[seg.speaker] || 0) + dur;
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return Object.entries(totals)
    .map(([speaker, ms]) => ({ speaker, pct: Math.round((ms / total) * 100) }))
    .sort((a, b) => b.pct - a.pct);
}

/* ── chapter time to seconds ─────────────────────────────────── */
function chapterToSec(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/* ── helpers ─────────────────────────────────────────────────── */
function fmt(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}
function fmtMs(ms: number) { return ms < 0 ? "" : fmt(ms / 1000); }
function formatDate(raw: string) {
  try {
    const ts = Number(raw);
    const d = isNaN(ts) ? new Date(raw) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}
function highlight(text: string, q: string) {
  if (!q) return text;
  const parts: (string | ReactNode)[] = [];
  let pos = 0;
  const lo = text.toLowerCase();
  const ql = q.toLowerCase();
  let i = lo.indexOf(ql, pos);
  let n = 0;
  while (i !== -1) {
    if (i > pos) parts.push(text.slice(pos, i));
    parts.push(<mark className="tx-hit" key={n++}>{text.slice(i, i + q.length)}</mark>);
    pos = i + q.length;
    i = lo.indexOf(ql, pos);
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

/* speaker colour palette */
const PALETTES = [
  "#f4603e","#446bce","#109c6b","#7c5cff","#f9dc5c","#e53430","#0fb6b0","#1a42b7",
];
function speakerColor(name: string, map: Map<string, string>) {
  if (!map.has(name)) map.set(name, PALETTES[map.size % PALETTES.length]);
  return map.get(name)!;
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ── SVG icons ───────────────────────────────────────────────── */
const Play = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M8 5.5v13a.7.7 0 0 0 1.06.6l10.2-6.5a.7.7 0 0 0 0-1.2L9.06 4.9A.7.7 0 0 0 8 5.5z"/></svg>
);
const Pause = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>
);
const Back10 = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 5 6.5 9.5 11 14"/><path d="M6.8 9.5H15a4.5 4.5 0 0 1 0 9H9"/></svg>
);
const Fwd10 = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M13 5l4.5 4.5L13 14"/><path d="M17.2 9.5H9a4.5 4.5 0 0 0 0 9h6"/></svg>
);
const Vol = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 9v6h3.5L13 19V5L7.5 9z" fill="currentColor" stroke="none"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/></svg>
);
const Mute = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 9v6h3.5L13 19V5L7.5 9z" fill="currentColor" stroke="none"/><path d="M17 9.5l4 5M21 9.5l-4 5"/></svg>
);
const Full = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>
);
const Search = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></svg>
);
const Close = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 6l12 12M18 6 6 18"/></svg>
);

/* ── Scrubber ────────────────────────────────────────────────── */
function Scrubber({ time, duration, onSeek }: { time: number; duration: number; onSeek: (t: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const pct = duration ? (time / duration) * 100 : 0;

  const getT = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - r.left) / r.width) * duration));
  };
  const onDown = (e: React.PointerEvent) => {
    onSeek(getT(e.clientX));
    const move = (ev: PointerEvent) => onSeek(getT(ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div style={{ width: "100%", padding: "8px 0", cursor: "pointer" }} onPointerDown={onDown}
      onPointerMove={e => { const r = trackRef.current!.getBoundingClientRect(); setHoverPct(((e.clientX - r.left) / r.width) * 100); }}
      onPointerLeave={() => setHoverPct(null)}>
      <div ref={trackRef} style={{ position: "relative", height: 5, borderRadius: 99, background: "color-mix(in srgb, currentColor 14%, transparent)" }}>
        <div style={{ position: "absolute", inset: "0", right: "auto", width: pct + "%", borderRadius: 99, background: "var(--accent)" }} />
        {hoverPct != null && <div style={{ position: "absolute", inset: "0", right: "auto", width: Math.max(0, Math.min(100, hoverPct)) + "%", borderRadius: 99, background: "color-mix(in srgb, currentColor 20%, transparent)" }} />}
        <div style={{ position: "absolute", top: "50%", left: pct + "%", width: 13, height: 13, borderRadius: "50%", background: "var(--accent)", transform: "translate(-50%,-50%)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--accent) 26%, transparent)" }} />
      </div>
    </div>
  );
}

/* ── Volume ──────────────────────────────────────────────────── */
function VolumeCtrl({ vol, muted, onVol, onMute }: { vol: number; muted: boolean; onVol: (v: number) => void; onMute: () => void }) {
  const [open, setOpen] = useState(false);
  const v = muted ? 0 : vol;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button onClick={onMute} style={ctrlBtn}>{v === 0 ? <Mute width={19} height={19}/> : <Vol width={19} height={19}/>}</button>
      <div style={{ width: open ? 72 : 0, overflow: "hidden", transition: "width 180ms var(--ease)", display: "flex", alignItems: "center" }}>
        <input type="range" min="0" max="1" step="0.01" value={v} className="vol-range"
          style={{ "--vp": v * 100 + "%" } as React.CSSProperties}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onVol(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

/* ── Speed ───────────────────────────────────────────────────── */
function SpeedCtrl({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
  const [open, setOpen] = useState(false);
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...ctrlBtn, width: "auto", padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 44 }}>
        {rate}×
      </button>
      {open && (
        <div className="speed-menu">
          {RATES.map(r => (
            <button key={r} data-on={r === rate} onClick={() => { onRate(r); setOpen(false); }}>
              {r}×{r === 1 ? "  Normal" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ctrlBtn: React.CSSProperties = {
  display: "inline-grid", placeItems: "center",
  width: 36, height: 36, borderRadius: 9,
  color: "var(--text-secondary)",
  transition: "background 140ms, color 140ms",
};

/* ── Main page ───────────────────────────────────────────────── */
export default function Page() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [metadata, setMetadata] = useState<Metadata>({});
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // playback
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);

  // transcript
  const [activeIdx, setActiveIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [query, setQuery] = useState("");
  const txRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const colorMap = useRef(new Map<string, string>());
  const isProgrammaticScroll = useRef(false);
  const hasTimestamps = segments.some(s => s.startsAt >= 0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const engagementId = p.get("engagementId");
    const recordId = p.get("recordId");
    if (!engagementId) { setError("No engagementId provided."); setLoading(false); return; }
    const qs = new URLSearchParams({ engagementId });
    if (recordId) qs.set("recordId", recordId);
    fetch(`/api/recording-data?${qs}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        if (!data.videoUrl) throw new Error("No video URL.");
        setVideoUrl(data.videoUrl);
        setMetadata(data.metadata || {});
        setSegments(data.segments || []);
        setChapters(data.chapters || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // video events
  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (!hasTimestamps) return;
    const ms = v.currentTime * 1000;
    let found = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].startsAt <= ms) { found = i; break; }
    }
    if (found !== activeIdx) {
      setActiveIdx(found);
      if (autoScroll && found >= 0 && lineRefs.current[found]) {
        isProgrammaticScroll.current = true;
        lineRefs.current[found]?.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
      }
    }
  }, [segments, activeIdx, autoScroll, hasTimestamps]);

  const seekTo = (t: number) => { if (videoRef.current) { videoRef.current.currentTime = t; } };
  const seekBy = (d: number) => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + d); } };
  const togglePlay = () => { if (videoRef.current) { playing ? videoRef.current.pause() : videoRef.current.play(); } };

  // search hits
  const hits = query ? segments.filter(s => s.text.toLowerCase().includes(query.toLowerCase())).length : 0;

  const title = metadata.call_title || metadata.call_name || "Call Recording";
  const date = metadata.call_date ? formatDate(metadata.call_date) : null;
  const host = metadata.host || null;

  if (loading) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--surface-A)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "var(--text-disable)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Loading recording…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (error || !videoUrl) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#e53430", fontSize: 13 }}>{error ?? "Recording unavailable."}</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface-A)" }}>
      {/* ── Header ── */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border-weaker)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
          {host && <span>🎙 {host}</span>}
          {date && <span>{date}</span>}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: chapters.length > 0 || segments.length > 0 ? "200px 1fr 360px" : "1fr 360px", gap: 12, padding: "14px 18px 18px" }}>

        {/* Left — Talk Time + Chapters (only if data available) */}
        {(chapters.length > 0 || segments.length > 0) && (() => {
          const talkTime = calcTalkTime(segments);
          const activeChapter = chapters.reduce((acc, c) => {
            return chapterToSec(c.time) <= time ? c : acc;
          }, chapters[0]);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
              {/* Talk Time */}
              {talkTime.length > 0 && (
                <div style={{ background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 12, padding: "12px 14px" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", marginBottom: 10 }}>Talk Time</p>
                  {/* Bar */}
                  <div style={{ display: "flex", height: 6, borderRadius: 99, overflow: "hidden", gap: 2, marginBottom: 12 }}>
                    {talkTime.map((t, i) => (
                      <div key={i} style={{ flex: t.pct, background: speakerColor(t.speaker, colorMap.current), borderRadius: 99 }} />
                    ))}
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {talkTime.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: speakerColor(t.speaker, colorMap.current), flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.speaker}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)" }}>{t.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chapters */}
              {chapters.length > 0 && (
                <div style={{ background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 12, padding: "12px 14px", flex: 1 }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)", marginBottom: 10 }}>Chapters</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {chapters.map((c, i) => {
                      const isActive = c === activeChapter;
                      return (
                        <button key={i} onClick={() => seekTo(chapterToSec(c.time))}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 8px 10px", borderRadius: 8, background: isActive ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", position: "relative" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isActive ? "var(--accent)" : "var(--text-disable)", paddingTop: 1, flexShrink: 0, minWidth: 16 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: isActive ? "var(--accent)" : "var(--text-secondary)", marginTop: 2 }}>{c.time}</p>
                          </div>
                          {/* Progress bar at bottom */}
                          {isActive && (
                            <div style={{ position: "absolute", left: 8, right: 8, bottom: 3, height: 2, background: "color-mix(in srgb, var(--accent) 20%, transparent)", borderRadius: 1 }}>
                              <div style={{ height: "100%", background: "var(--accent)", borderRadius: 1, width: (() => {
                                const next = chapters[i + 1];
                                if (!next) return "100%";
                                const start = chapterToSec(c.time);
                                const end = chapterToSec(next.time);
                                return Math.min(100, Math.round(((time - start) / (end - start)) * 100)) + "%";
                              })() }} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Left — video + controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {/* Video */}
          <div style={{ position: "relative", aspectRatio: "16/9", background: "#0b0b10", borderRadius: 14, overflow: "hidden", flex: "0 0 auto" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              style={{ width: "100%", height: "100%", display: "block" }}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration); }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onVolumeChange={() => { if (videoRef.current) { setVol(videoRef.current.volume); setMuted(videoRef.current.muted); } }}
            />
            {!playing && (
              <button onClick={togglePlay} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 72, height: 72, borderRadius: "50%", background: "rgba(15,15,21,0.55)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", display: "grid", placeItems: "center", paddingLeft: 4, cursor: "pointer", transition: "background 150ms, border-color 150ms" }}>
                <Play width={32} height={32} />
              </button>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Scrubber time={time} duration={duration} onSeek={seekTo} />
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* Play */}
              <button onClick={togglePlay} style={{ display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 11, background: "var(--accent)", color: "var(--on-accent)", flexShrink: 0 }}>
                {playing ? <Pause width={20} height={20} /> : <Play width={20} height={20} />}
              </button>
              <button onClick={() => seekBy(-10)} style={ctrlBtn}><Back10 width={19} height={19} /></button>
              <button onClick={() => seekBy(10)} style={ctrlBtn}><Fwd10 width={19} height={19} /></button>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", marginLeft: 8, whiteSpace: "nowrap" }}>
                <b style={{ color: "var(--text-primary)", fontWeight: 400 }}>{fmt(time)}</b>
                <span style={{ color: "var(--text-disable)" }}> / </span>
                {fmt(duration)}
              </span>
              <span style={{ flex: 1 }} />
              <VolumeCtrl vol={vol} muted={muted}
                onVol={v => { if (videoRef.current) videoRef.current.volume = v; }}
                onMute={() => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; }} />
              <SpeedCtrl rate={rate} onRate={r => { setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }} />
              <button onClick={() => videoRef.current?.requestFullscreen()} style={ctrlBtn}><Full width={18} height={18} /></button>
            </div>
          </div>
        </div>

        {/* Right — transcript */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 14, overflow: "hidden" }}>
          {/* Transcript header */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-weaker)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-disable)" }}>Transcript</span>
              {hasTimestamps && (
                <button onClick={() => {
                  const next = !autoScroll;
                  setAutoScroll(next);
                  if (next && activeIdx >= 0 && lineRefs.current[activeIdx]) {
                    isProgrammaticScroll.current = true;
                    lineRefs.current[activeIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
                    setTimeout(() => { isProgrammaticScroll.current = false; }, 600);
                  }
                }} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: autoScroll ? "var(--accent)" : "var(--text-disable)", border: `1px solid ${autoScroll ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "var(--border-weaker)"}`, padding: "4px 8px", borderRadius: 99, transition: "all 140ms", background: "none" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                  {autoScroll ? "Following" : "Paused"}
                </button>
              )}
            </div>
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: "var(--surface-A)", border: "1px solid var(--border-weaker)" }}>
              <Search width={14} height={14} style={{ color: "var(--text-disable)", flexShrink: 0 }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search transcript…"
                style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-sans)" }} />
              {query && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-disable)" }}>{hits}</span>}
              {query && <button onClick={() => setQuery("")} style={{ color: "var(--text-disable)", display: "grid", placeItems: "center" }}><Close width={13} height={13} /></button>}
            </div>
          </div>

          {/* Lines */}
          <div ref={txRef} onScroll={() => { if (!isProgrammaticScroll.current) setAutoScroll(false); }}
            style={{ flex: 1, overflowY: "auto", padding: "6px 8px 16px", scrollbarWidth: "thin" }}>
            {segments.length === 0 ? (
              <p style={{ color: "var(--text-disable)", fontSize: 13, padding: "20px 8px", fontStyle: "italic" }}>No transcript available.</p>
            ) : (
              segments.map((seg, i) => {
                const showMeta = i === 0 || segments[i - 1].speaker !== seg.speaker;
                const isActive = i === activeIdx;
                const isPast = hasTimestamps && i < activeIdx;
                const matchesQuery = query && seg.text.toLowerCase().includes(query.toLowerCase());
                const hidden = query && !matchesQuery;
                if (hidden) return null;
                const color = speakerColor(seg.speaker, colorMap.current);
                return (
                  <div key={i} ref={el => { lineRefs.current[i] = el; }}
                    className={`tx-line${isActive ? "" : ""}${isPast && !query ? " faded" : ""}`}
                    data-active={isActive}
                    onClick={() => { if (seg.startsAt >= 0 && videoRef.current) { videoRef.current.currentTime = seg.startsAt / 1000; videoRef.current.play(); setAutoScroll(true); } }}>
                    {/* Timestamp column */}
                    <span className="tx-ts">{fmtMs(seg.startsAt)}</span>
                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {showMeta && (
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                          <span style={{ width: 22, height: 22, borderRadius: "50%", background: color, display: "grid", placeItems: "center", color: "#fff", fontSize: 9, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                            {initials(seg.speaker)}
                          </span>
                          <span className="tx-name">{seg.speaker}</span>
                        </div>
                      )}
                      <p className="tx-text">{highlight(seg.text, query)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,96,62,0.4);}70%{box-shadow:0 0 0 6px rgba(244,96,62,0);} }
        .tx-line { display:flex; gap:10px; padding:7px 8px; border-radius:8px; cursor:pointer; position:relative; transition: background 140ms, opacity 200ms; }
        .tx-line:hover { background: color-mix(in srgb, #0f0f15 5%, transparent); }
        .tx-line[data-active="true"] { background: color-mix(in srgb, #f4603e 10%, transparent); }
        .tx-line.faded { opacity: 0.32; }
        .tx-line[data-active="true"]::before { content:""; position:absolute; left:0; top:8px; bottom:8px; width:2.5px; border-radius:0 2px 2px 0; background:var(--accent); }
        .tx-ts { font-family:var(--font-mono); font-size:10px; color:var(--text-disable); padding-top:2px; width:30px; flex:none; font-variant-numeric:tabular-nums; }
        .tx-line[data-active="true"] .tx-ts { color:var(--accent); }
        .tx-name { font-size:11px; font-weight:600; letter-spacing:0.02em; color:var(--text-primary); }
        .tx-text { font-size:13px; line-height:1.5; color:var(--text-secondary); margin:0; }
        .tx-line[data-active="true"] .tx-text { color:var(--text-primary); }
        mark.tx-hit { background:color-mix(in srgb,#f9dc5c 65%,transparent); color:inherit; border-radius:2px; padding:0 1px; }
        input[type=range].vol-range { -webkit-appearance:none; appearance:none; width:60px; height:4px; border-radius:2px; background:linear-gradient(to right, var(--accent) var(--vp,80%), color-mix(in srgb,currentColor 20%,transparent) var(--vp,80%)); cursor:pointer; outline:none; }
        input[type=range].vol-range::-webkit-slider-thumb { -webkit-appearance:none; width:10px; height:10px; border-radius:50%; background:var(--accent); }
        .speed-menu { position:absolute; bottom:calc(100% + 8px); right:0; z-index:30; background:var(--surface-A); border:1px solid var(--border-weaker); border-radius:10px; padding:5px; box-shadow:0 32px 80px rgba(29,29,32,0.12); min-width:128px; }
        .speed-menu button { display:flex; width:100%; align-items:center; gap:8px; padding:8px 10px; border-radius:7px; font-family:var(--font-mono); font-size:12px; color:var(--text-secondary); text-align:left; }
        .speed-menu button:hover { background:var(--surface-C); color:var(--text-primary); }
        .speed-menu button[data-on="true"] { background:var(--surface-C); color:var(--text-primary); }
      `}</style>
    </div>
  );
}
