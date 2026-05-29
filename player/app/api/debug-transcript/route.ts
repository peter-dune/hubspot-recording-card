import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const engagementId = req.nextUrl.searchParams.get("engagementId");
    if (!engagementId) return NextResponse.json({ error: "Missing engagementId" });

    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ error: "No token configured" });

    // Step 1: Get transcription ID from call object
    let callData: unknown = null;
    let transcriptionId: string | null = null;
    try {
      const callRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/calls/${engagementId}?properties=hs_call_transcription_id`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      const text = await callRes.text();
      callData = JSON.parse(text);
      transcriptionId = (callData as Record<string, unknown> & { properties?: Record<string, string> })?.properties?.hs_call_transcription_id ?? null;
    } catch (e) {
      return NextResponse.json({ step: "getCall", error: String(e), callData });
    }

    if (!transcriptionId) {
      return NextResponse.json({ error: "No hs_call_transcription_id found", callData });
    }

    // Step 2: Fetch transcript
    let txData: unknown = null;
    let txStatus = 0;
    try {
      const txRes = await fetch(
        `https://api.hubapi.com/crm/extensions/calling/2026-03/transcripts/${transcriptionId}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      txStatus = txRes.status;
      const text = await txRes.text();
      txData = text.slice(0, 2000);
    } catch (e) {
      return NextResponse.json({ step: "getTranscript", transcriptionId, error: String(e) });
    }

    return NextResponse.json({ transcriptionId, txStatus, txData });
  } catch (e) {
    return NextResponse.json({ fatal: String(e) });
  }
}
