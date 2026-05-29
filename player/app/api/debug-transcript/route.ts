import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const engagementId = req.nextUrl.searchParams.get("engagementId");
  if (!engagementId) return NextResponse.json({ error: "Missing engagementId" }, { status: 400 });

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "No token" }, { status: 500 });

  // Step 1: Get transcription ID from call object
  const callRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/calls/${engagementId}?properties=hs_call_transcription_id`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const callData = await callRes.json();
  const transcriptionId = callData?.properties?.hs_call_transcription_id;

  if (!transcriptionId) {
    return NextResponse.json({ error: "No transcription ID found", callData });
  }

  // Step 2: Fetch transcript with timestamps
  const txRes = await fetch(
    `https://api.hubapi.com/crm/extensions/calling/2026-03/transcripts/${transcriptionId}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
  const txData = await txRes.json();

  return NextResponse.json({ transcriptionId, status: txRes.status, data: txData });
}
