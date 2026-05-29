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
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    return NextResponse.json({ error: `Fetch failed: ${e}` }, { status: 500 });
  }

  const text = await res.text();

  if (!res.ok) {
    return NextResponse.json(
      { error: `HubSpot error ${res.status}`, body: text },
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
    // Maybe it's a plain URL string
    return NextResponse.json({ url: text.trim() });
  }
}
