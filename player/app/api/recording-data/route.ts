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

// Parse timestamped transcript text into segments
// Supports formats:
//   [00:01:23] Speaker: text
//   [00:01:23.456] Speaker: text
//   00:01:23 Speaker: text
//   1:23 Speaker: text
//   0:01:23 Speaker - text
function parseTimestampedTranscript(raw: string) {
  if (!raw?.trim()) return [];

  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const segments: { speaker: string; text: string; startsAt: number; endsAt: number }[] = [];

  const tsRegex = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d+))?\]?\s*/;

  for (const line of lines) {
    const tsMatch = line.match(tsRegex);
    if (!tsMatch) continue;

    const [full, h_or_m, m_or_s, s, ms] = tsMatch;
    let totalMs: number;

    if (s !== undefined) {
      // h:mm:ss format
      totalMs = (parseInt(h_or_m) * 3600 + parseInt(m_or_s) * 60 + parseInt(s)) * 1000;
    } else {
      // m:ss format
      totalMs = (parseInt(h_or_m) * 60 + parseInt(m_or_s)) * 1000;
    }
    if (ms) totalMs += parseInt(ms.padEnd(3, "0").slice(0, 3));

    const rest = line.slice(full.length);
    // Split speaker from text: "Speaker: text" or "Speaker - text"
    const speakerMatch = rest.match(/^([^:\-–]+)[:–\-]\s*(.+)/);
    if (!speakerMatch) continue;

    const speaker = speakerMatch[1].trim();
    const text = speakerMatch[2].trim();
    segments.push({ speaker, text, startsAt: totalMs, endsAt: -1 });
  }

  // Fill endsAt from next segment's startsAt
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].endsAt = segments[i + 1].startsAt;
  }
  if (segments.length > 0) {
    segments[segments.length - 1].endsAt = segments[segments.length - 1].startsAt + 10000;
  }

  return segments;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const engagementId = searchParams.get("engagementId");
  const recordId = searchParams.get("recordId");
  const videoDuration = parseFloat(searchParams.get("duration") || "0"); // seconds

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

  // 2. Fetch recording metadata + timestamped transcript
  let metadata: Record<string, string> = {};
  let segments: { speaker: string; text: string; startsAt: number; endsAt: number }[] = [];

  if (recordId) {
    try {
      const props = ["call_title", "host", "call_date", "call_name", "transcript", "transcript_timed"];
      const metaRes = await get(
        `https://api.hubapi.com/crm/v3/objects/p_recordings/${recordId}?properties=${props.join(",")}`,
        token
      );
      if (metaRes.ok) {
        const data = await metaRes.json();
        metadata = data.properties || {};

        // Use timestamped transcript if available, else fall back to plain
        if (metadata.transcript_timed?.trim()) {
          segments = parseTimestampedTranscript(metadata.transcript_timed);
        } else if (metadata.transcript?.trim()) {
          // Plain transcript — estimate timestamps from word count if duration provided
          const lines = metadata.transcript
            .split("\n")
            .map((line: string) => line.trim())
            .filter(Boolean)
            .map((line: string) => {
              const colonIdx = line.indexOf(":");
              if (colonIdx > 0) {
                return { speaker: line.slice(0, colonIdx).trim(), text: line.slice(colonIdx + 1).trim() };
              }
              return { speaker: "", text: line };
            });

          if (videoDuration > 0 && lines.length > 0) {
            // Estimate: assume speaking fills ~85% of duration, distribute by word count
            const totalWords = lines.reduce((sum, l) => sum + l.text.split(/\s+/).length, 0);
            const speakingDuration = videoDuration * 0.85 * 1000; // ms
            let cumWords = 0;
            segments = lines.map((l, i) => {
              const words = l.text.split(/\s+/).length;
              const startsAt = Math.round((cumWords / totalWords) * speakingDuration);
              cumWords += words;
              const endsAt = i < lines.length - 1
                ? Math.round((cumWords / totalWords) * speakingDuration)
                : videoDuration * 1000;
              return { ...l, startsAt, endsAt };
            });
          } else {
            segments = lines.map(l => ({ ...l, startsAt: -1, endsAt: -1 }));
          }
        }
      }
    } catch {}
  }

  return NextResponse.json({ videoUrl, segments, metadata });
}
