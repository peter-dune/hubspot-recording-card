"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Segment {
  speaker: string;
  text: string;
  startsAt: number; // ms, -1 if unknown
  endsAt: number;
}

interface Metadata {
  call_title?: string;
  call_name?: string;
  host?: string;
  call_date?: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch { return iso; }
}

function formatTime(ms: number): string {
  if (ms < 0) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const SPEAKER_COLORS = [
  { text: "text-blue-400", bg: "bg-blue-900/30", border: "border-blue-800/50", dot: "bg-blue-400" },
  { text: "text-emerald-400", bg: "bg-emerald-900/30", border: "border-emerald-800/50", dot: "bg-emerald-400" },
  { text: "text-violet-400", bg: "bg-violet-900/30", border: "border-violet-800/50", dot: "bg-violet-400" },
  { text: "text-amber-400", bg: "bg-amber-900/30", border: "border-amber-800/50", dot: "bg-amber-400" },
];

export default function Page() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [metadata, setMetadata] = useState<Metadata>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hasTimestamps, setHasTimestamps] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const speakerMap = useRef<Map<string, number>>(new Map());

  const getSpeakerColor = (speaker: string) => {
    if (!speakerMap.current.has(speaker)) {
      speakerMap.current.set(speaker, speakerMap.current.size % SPEAKER_COLORS.length);
    }
    return SPEAKER_COLORS[speakerMap.current.get(speaker)!];
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const engagementId = params.get("engagementId");
    const recordId = params.get("recordId");
    if (!engagementId) { setError("No engagementId provided."); setLoading(false); return; }

    const qs = new URLSearchParams({ engagementId });
    if (recordId) qs.set("recordId", recordId);

    fetch(`/api/recording-data?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (!data.videoUrl) throw new Error("No video URL returned.");
        setVideoUrl(data.videoUrl);
        setMetadata(data.metadata || {});
        const segs: Segment[] = data.segments || [];
        setSegments(segs);
        setHasTimestamps(segs.some((s) => s.startsAt >= 0));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Sync transcript to video time
  const onTimeUpdate = useCallback(() => {
    if (!hasTimestamps || !videoRef.current) return;
    const currentMs = videoRef.current.currentTime * 1000;
    let found = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].startsAt <= currentMs) { found = i; break; }
    }
    if (found !== activeIdx) {
      setActiveIdx(found);
      if (autoScroll && found >= 0 && lineRefs.current[found]) {
        lineRefs.current[found]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [segments, activeIdx, autoScroll, hasTimestamps]);

  // Jump video to segment time
  const seekTo = (startsAt: number) => {
    if (videoRef.current && startsAt >= 0) {
      videoRef.current.currentTime = startsAt / 1000;
      videoRef.current.play();
    }
  };

  // Detect manual scroll — disable auto-scroll
  const onTranscriptScroll = () => {
    setAutoScroll(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading recording…</p>
        </div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <p className="text-red-400 text-sm">{error ?? "Recording unavailable."}</p>
      </div>
    );
  }

  const title = metadata.call_title || metadata.call_name || "Call Recording";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 py-3.5 border-b border-gray-800 bg-gray-900 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">{title}</h1>
          <div className="flex gap-3 mt-0.5">
            {metadata.host && <span className="text-xs text-gray-400">🎙 {metadata.host}</span>}
            {metadata.call_date && <span className="text-xs text-gray-500">{formatDate(metadata.call_date)}</span>}
          </div>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
          Call Recording
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video panel */}
        <div className="flex flex-col w-[55%] bg-black border-r border-gray-800">
          <div className="flex-1 flex items-center justify-center">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              onTimeUpdate={onTimeUpdate}
              className="w-full"
              style={{ maxHeight: "calc(100vh - 65px)" }}
            />
          </div>
        </div>

        {/* Transcript panel */}
        <div className="flex flex-col w-[45%]">
          <div className="flex-none px-5 py-3 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Transcript</h2>
            <div className="flex items-center gap-3">
              {hasTimestamps && (
                <button
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    autoScroll
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      : "bg-gray-800 text-gray-500 border-gray-700"
                  }`}
                >
                  {autoScroll ? "⟳ Auto-scroll on" : "⟳ Auto-scroll off"}
                </button>
              )}
              {!hasTimestamps && (
                <span className="text-xs text-gray-600 italic">No timestamps</span>
              )}
            </div>
          </div>

          <div
            ref={transcriptRef}
            onScroll={onTranscriptScroll}
            className="flex-1 overflow-y-auto px-5 py-5 space-y-1"
            style={{ scrollbarColor: "#374151 transparent", scrollbarWidth: "thin" }}
          >
            {segments.length === 0 ? (
              <p className="text-gray-500 text-sm italic pt-4">No transcript available.</p>
            ) : (
              segments.map((seg, i) => {
                const color = getSpeakerColor(seg.speaker);
                const isActive = i === activeIdx;
                const showSpeaker = i === 0 || segments[i - 1].speaker !== seg.speaker;

                return (
                  <div
                    key={i}
                    ref={(el) => { lineRefs.current[i] = el; }}
                    className={`group rounded-xl px-4 py-2.5 transition-all duration-200 cursor-pointer border ${
                      isActive
                        ? `${color.bg} ${color.border} border shadow-lg`
                        : "border-transparent hover:bg-gray-800/50"
                    }`}
                    onClick={() => { seekTo(seg.startsAt); setAutoScroll(true); }}
                  >
                    {showSpeaker && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wider ${color.text}`}>
                          {seg.speaker}
                        </span>
                        {seg.startsAt >= 0 && (
                          <span className="text-xs text-gray-600 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatTime(seg.startsAt)}
                          </span>
                        )}
                      </div>
                    )}
                    <p className={`text-sm leading-relaxed ${isActive ? "text-white" : "text-gray-300"}`}>
                      {seg.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
