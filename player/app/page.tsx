"use client";

import { useEffect, useRef, useState } from "react";

export default function Page() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const engagementId = params.get("engagementId");
    if (!engagementId) {
      setError("No engagementId provided.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    fetch(`/api/recording?engagementId=${engagementId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error + (data.preview ? `: ${data.preview}` : ""));
        const mediaUrl =
          data.url ||
          data.externalUrl ||
          data.recordingUrl ||
          data.signedUrl;
        if (!mediaUrl) throw new Error("No URL in response. Keys: " + Object.keys(data).join(", "));
        setUrl(mediaUrl);
      })
      .catch((e) => setError(e.name === "AbortError" ? "Request timed out" : e.message))
      .finally(() => { clearTimeout(timeout); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-white text-sm">Loading recording…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-black p-4">
        <p className="text-red-400 text-sm text-center max-w-md">{error}</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-yellow-400 text-sm">No recording URL found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={url}
        controls
        autoPlay={false}
        className="max-h-full max-w-full w-full"
      />
    </div>
  );
}
