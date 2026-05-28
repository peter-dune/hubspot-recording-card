import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const engagementId = req.nextUrl.searchParams.get("engagementId");
  if (!engagementId) {
    return NextResponse.json({ error: "Missing engagementId" }, { status: 400 });
  }

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const portalId = process.env.HUBSPOT_PORTAL_ID || "141496265";

  const res = await fetch(
    `https://api-eu1.hubspot.com/recording/auth/provider/hublets/v1/external-url-retriever/getAuthRecording/portal/${portalId}/engagement/${engagementId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `HubSpot error: ${res.status}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
