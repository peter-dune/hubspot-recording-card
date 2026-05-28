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
    fetch(`/api/recording?engagementId=${engagementId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        // HubSpot returns the URL in different shapes — handle both
        const mediaUrl = data.url || data.externalUrl || data.recordingUrl;
        if (!mediaUrl) throw new Error("No URL in response");
        setUrl(mediaUrl);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-white text-sm">Loading recording…</p>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-red-400 text-sm">{error ?? "Recording unavailable."}</p>
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
