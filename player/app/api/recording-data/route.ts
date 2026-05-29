import { NextRequest, NextResponse } from "next/server";

async function fetchWithAuth(url: string, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
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

  // Fetch video URL (redirect → signed CDN URL)
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

  // Fetch recording metadata (transcript, title, host, date)
  let metadata: Record<string, string> = {};
  if (recordId) {
    try {
      const props = ["transcript", "call_title", "host", "call_date", "call_name"];
      const metaRes = await fetchWithAuth(
        `https://api.hubapi.com/crm/v3/objects/p_recordings/${recordId}?properties=${props.join(",")}`,
        token
      );
      if (metaRes.ok) {
        const data = await metaRes.json();
        metadata = data.properties || {};
      }
    } catch {}
  }

  return NextResponse.json({ videoUrl, metadata });
}
