import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const engagementId = req.nextUrl.searchParams.get("engagementId") || "494463524030";
  const transcriptionId = "3098170439";
  const token = process.env.HUBSPOT_ACCESS_TOKEN!;

  const endpoints = [
    `https://api-eu1.hubspot.com/crm/extensions/calling/2026-03/transcripts/${transcriptionId}`,
    `https://api.hubapi.com/crm/extensions/calling/2026-03/transcripts/${transcriptionId}`,
    `https://api-eu1.hubspot.com/crm/v3/extensions/calling/transcripts/${transcriptionId}`,
    `https://api.hubapi.com/crm/v3/extensions/calling/transcripts/${transcriptionId}`,
    `https://api-eu1.hubspot.com/calling/transcript/v1/${transcriptionId}`,
    `https://api-eu1.hubspot.com/intelligence/v1/transcript/${transcriptionId}`,
    `https://api-eu1.hubspot.com/crm/extensions/calling/v1/transcripts/${transcriptionId}`,
    `https://api-eu1.hubspot.com/engagements/v1/engagements/${engagementId}/transcript`,
  ];

  const results: Record<string, unknown>[] = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const text = await res.text();
      results.push({ url: url.replace("https://api", "...api"), status: res.status, body: text.slice(0, 300) });
    } catch (e) {
      results.push({ url, error: String(e) });
    }
  }

  return NextResponse.json(results);
}
