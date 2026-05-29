import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const engagementId = req.nextUrl.searchParams.get("engagementId");
  if (!engagementId) return NextResponse.json({ error: "Missing engagementId" }, { status: 400 });

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  // Try 1: direct by transcriptId = engagementId
  const r1 = await fetch(
    `https://api.hubapi.com/crm/extensions/calling/2026-03/transcripts/${engagementId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const t1 = await r1.text();

  // Try 2: search by engagementId
  const r2 = await fetch(
    `https://api.hubapi.com/crm/extensions/calling/2026-03/transcripts?engagementId=${engagementId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const t2 = await r2.text();

  // Try 3: older v3 endpoint
  const r3 = await fetch(
    `https://api.hubapi.com/crm/v3/extensions/calling/transcripts?engagementId=${engagementId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const t3 = await r3.text();

  return NextResponse.json({
    try1: { status: r1.status, body: t1.slice(0, 500) },
    try2: { status: r2.status, body: t2.slice(0, 500) },
    try3: { status: r3.status, body: t3.slice(0, 500) },
  });
}
