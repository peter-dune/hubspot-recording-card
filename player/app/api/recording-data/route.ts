import { NextRequest, NextResponse } from "next/server";

async function get(url: string, token: string) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: controller.signal,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const engagementId = searchParams.get("engagementId");
  const recordId = searchParams.get("recordId");

  if (!engagementId) {
    return NextResponse.json({ error: "Missing engagementId" }, { status: 400 });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  const portalId = process.env.HUBSPOT_PORTAL_ID || "141496265";

  // 1. Fetch signed video URL
  let videoUrl: string | null = null;
  try {
    const videoRes = await fetch(
      `https://api-eu1.hubspot.com/recording/auth/provider/hublets/v1/external-url-retriever/getAuthRecording/portal/${portalId}/engagement/${engagementId}`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" }
    );
    if (videoRes.status >= 300 && videoRes.status < 400) {
      videoUrl = videoRes.headers.get("location");
    } else {
      const text = await videoRes.text();
      if (text.trim().startsWith("http")) videoUrl = text.trim();
    }
  } catch {}

  // 2. Fetch timestamped transcript from HubSpot Calling Transcript API
  let segments: { speaker: string; text: string; startsAt: number; endsAt: number }[] = [];
  try {
    const tRes = await get(
      `https://api.hubapi.com/crm/v3/extensions/calling/transcripts?engagementId=${engagementId}`,
      token
    );
    if (tRes.ok) {
      const tData = await tRes.json();
      const transcript = tData.results?.[0];
      if (transcript?.segments) {
        segments = transcript.segments.map((s: {
          speakerDisplayName?: string; speaker?: string;
          text?: string; words?: { word: string }[];
          startOffset?: number; endOffset?: number;
          startsAt?: number; endsAt?: number;
        }) => ({
          speaker: s.speakerDisplayName || s.speaker || "Speaker",
          text: s.text || s.words?.map((w) => w.word).join(" ") || "",
          startsAt: s.startOffset ?? s.startsAt ?? 0,
          endsAt: s.endOffset ?? s.endsAt ?? 0,
        }));
      }
    }
  } catch {}

  // 3. Fetch recording metadata
  let metadata: Record<string, string> = {};
  if (recordId) {
    try {
      const props = ["call_title", "host", "call_date", "call_name", "transcript"];
      const metaRes = await get(
        `https://api.hubapi.com/crm/v3/objects/p_recordings/${recordId}?properties=${props.join(",")}`,
        token
      );
      if (metaRes.ok) {
        const data = await metaRes.json();
        metadata = data.properties || {};
      }
    } catch {}
  }

  // Fall back to plain transcript if no segments
  if (segments.length === 0 && metadata.transcript) {
    segments = metadata.transcript
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean)
      .map((line: string, i: number) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          return {
            speaker: line.slice(0, colonIdx).trim(),
            text: line.slice(colonIdx + 1).trim(),
            startsAt: -1, // no timestamp
            endsAt: -1,
          };
        }
        return { speaker: "", text: line, startsAt: -1, endsAt: -1 };
      });
  }

  return NextResponse.json({ videoUrl, segments, metadata });
}
