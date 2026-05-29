import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const engagementId = req.nextUrl.searchParams.get("engagementId");
  if (!engagementId) {
    return NextResponse.json({ error: "Missing engagementId" }, { status: 400 });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "HUBSPOT_ACCESS_TOKEN not configured" }, { status: 500 });
  }

  const portalId = process.env.HUBSPOT_PORTAL_ID || "141496265";
  const url = `https://api-eu1.hubspot.com/recording/auth/provider/hublets/v1/external-url-retriever/getAuthRecording/portal/${portalId}/engagement/${engagementId}`;

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Use manual redirect to capture the Location header
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Fetch failed: ${msg}` }, { status: 500 });
  }

  // If it's a redirect, the Location header IS the media URL
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      return NextResponse.json({ url: location });
    }
    return NextResponse.json({ error: "Redirect with no Location header", status: res.status }, { status: 502 });
  }

  const text = await res.text();
  const preview = text.slice(0, 500);

  if (!res.ok) {
    return NextResponse.json(
      { error: `HubSpot ${res.status}`, preview, headers: Object.fromEntries(res.headers.entries()) },
      { status: res.status }
    );
  }

  if (!text) {
    return NextResponse.json({ error: "Empty response from HubSpot" }, { status: 502 });
  }

  try {
    const data = JSON.parse(text);
    return NextResponse.json(data);
  } catch {
    const trimmed = text.trim();
    if (trimmed.startsWith("http")) {
      return NextResponse.json({ url: trimmed });
    }
    return NextResponse.json({ error: "Non-JSON response", preview }, { status: 502 });
  }
}
