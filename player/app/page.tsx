"use client";

import { useEffect, useRef, useState } from "react";

interface Metadata {
  transcript?: string;
  call_title?: string;
  host?: string;
  call_date?: string;
  call_name?: string;
}

interface TranscriptLine {
  speaker: string;
  text: string;
  isRep: boolean;
}

function parseTranscript(raw: string): TranscriptLine[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const speaker = line.slice(0, colonIdx).trim();
        const text = line.slice(colonIdx + 1).trim();
        const isRep =
          /rep|agent|sales|host|advisor|ae|sdr|bdr/i.test(speaker) ||
          (!speaker.toLowerCase().includes("customer") &&
            !speaker.toLowerCase().includes("prospect") &&
            !speaker.toLowerCase().includes("client"));
        return { speaker, text, isRep };
      }
      return { speaker: "", text: line, isRep: false };
    });
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Page() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({});
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const engagementId = params.get("engagementId");
    const recordId = params.get("recordId");

    if (!engagementId) {
      setError("No engagementId provided.");
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams({ engagementId });
    if (recordId) qs.set("recordId", recordId);

    fetch(`/api/recording-data?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        if (!data.videoUrl) throw new Error("No video URL returned.");
        setVideoUrl(data.videoUrl);
        setMetadata(data.metadata || {});
        setTranscript(parseTranscript(data.metadata?.transcript || ""));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
  const host = metadata.host;
  const date = metadata.call_date ? formatDate(metadata.call_date) : null;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
            <div className="flex gap-4 mt-1">
              {host && (
                <span className="text-sm text-gray-400">
                  <span className="text-gray-500">Host</span> · {host}
                </span>
              )}
              {date && (
                <span className="text-sm text-gray-400">
                  <span className="text-gray-500">Date</span> · {date}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Call Recording
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Video */}
        <div className="flex flex-col w-[55%] bg-black border-r border-gray-800">
          <div className="flex-1 flex items-center justify-center bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay={false}
              className="w-full max-h-full"
              style={{ maxHeight: "calc(100vh - 130px)" }}
            />
          </div>
        </div>

        {/* Right — Transcript */}
        <div className="flex flex-col w-[45%]">
          <div className="flex-none px-5 py-3 border-b border-gray-800 bg-gray-900/50">
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
              Transcript
            </h2>
          </div>
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
            style={{ scrollbarColor: "#374151 transparent" }}
          >
            {transcript.length === 0 ? (
              <p className="text-gray-500 text-sm italic">No transcript available.</p>
            ) : (
              transcript.map((line, i) => (
                <div key={i} className={`flex flex-col gap-1 ${line.isRep ? "" : "items-end"}`}>
                  {line.speaker && (
                    <span
                      className={`text-xs font-semibold uppercase tracking-wider ${
                        line.isRep ? "text-blue-400" : "text-emerald-400"
                      }`}
                    >
                      {line.speaker}
                    </span>
                  )}
                  <div
                    className={`max-w-[90%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      line.isRep
                        ? "bg-gray-800 text-gray-100 rounded-tl-sm"
                        : "bg-emerald-900/40 text-emerald-50 rounded-tr-sm"
                    }`}
                  >
                    {line.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
