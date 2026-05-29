"use client";

import { useEffect, useRef, useState } from "react";

export default function Page() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
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
      .then((r) => r.text())
      .then((text) => {
        setRawResponse(text);
        const data = JSON.parse(text);
        if (data.error) throw new Error(`${data.error} — ${data.body || ""}`);
        const mediaUrl =
          data.url ||
          data.externalUrl ||
          data.recordingUrl ||
          data.signedUrl ||
          data.redirectUrl ||
          Object.values(data).find((v) => typeof v === "string" && v.startsWith("http"));
        if (!mediaUrl) throw new Error("No URL found in response: " + text);
        setUrl(mediaUrl as string);
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

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-black p-4">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">{error}</p>
          {rawResponse && (
            <pre className="text-gray-400 text-xs text-left max-w-lg overflow-auto">
              {rawResponse}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-yellow-400 text-sm">Raw response: {rawResponse}</p>
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
