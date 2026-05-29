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
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Fetch failed: ${msg}` }, { status: 500 });
  }

  const text = await res.text();
  // Truncate to avoid sending huge HTML pages
  const preview = text.slice(0, 500);

  if (!res.ok) {
    return NextResponse.json(
      { error: `HubSpot ${res.status}`, preview },
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
    // Plain URL string or non-JSON
    const trimmed = text.trim();
    if (trimmed.startsWith("http")) {
      return NextResponse.json({ url: trimmed });
    }
    return NextResponse.json({ error: "Non-JSON response", preview }, { status: 502 });
  }
}
