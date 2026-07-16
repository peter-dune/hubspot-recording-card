import { NextRequest, NextResponse } from "next/server";

const HS = "https://api.hubapi.com";
const RECORDINGS = "p_recordings";

async function hsGet(url: string, token: string) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal });
  } finally { clearTimeout(t); }
}

function parseDateMs(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!isNaN(n) && n > 0) return n;      // epoch-ms string
  const t = new Date(raw).getTime();     // ISO string fallback
  return isNaN(t) ? 0 : t;
}

function dateLabel(ms: number): string {
  if (!ms) return "";
  try { return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
  catch { return ""; }
}

/**
 * GET /api/deal-sentiment?recordId=<recording id>
 * Returns the sentiment timeline across every processed call on the same deal.
 */
export async function GET(req: NextRequest) {
  const recordId = req.nextUrl.searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "Missing recordId" }, { status: 400 });

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // 1. recording → deal
  const dealAssoc = await hsGet(`${HS}/crm/v4/objects/${RECORDINGS}/${recordId}/associations/deals`, token);
  const dealId = dealAssoc.ok ? (await dealAssoc.json()).results?.[0]?.toObjectId : null;
  if (!dealId) return NextResponse.json({ dealName: "", points: [] });

  // 2. deal name + all recordings on the deal
  const [dealRes, recAssoc] = await Promise.all([
    hsGet(`${HS}/crm/v3/objects/deals/${dealId}?properties=dealname`, token),
    hsGet(`${HS}/crm/v4/objects/deals/${dealId}/associations/${RECORDINGS}?limit=100`, token),
  ]);
  const dealName = dealRes.ok ? (await dealRes.json()).properties?.dealname ?? "" : "";
  const recIds: string[] = recAssoc.ok ? ((await recAssoc.json()).results ?? []).map((r: { toObjectId: string }) => String(r.toObjectId)) : [];
  if (recIds.length === 0) return NextResponse.json({ dealName, points: [] });

  // 3. batch-read sentiment/date/title/stage/score for each recording
  const batch = await fetch(`${HS}/crm/v3/objects/${RECORDINGS}/batch/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: ["call_title", "call_name", "call_date", "call_sentiment", "call_stage", "call_score"],
      inputs: recIds.map(id => ({ id })),
    }),
  });
  if (!batch.ok) return NextResponse.json({ dealName, points: [] });
  const results = (await batch.json()).results ?? [];

  const points = results.map((r: { id: string; properties: Record<string, string> }) => {
    const p = r.properties || {};
    let sentiment = "unknown", reason = "";
    try {
      const s = JSON.parse(p.call_sentiment || "{}");
      if (s.sentiment) { sentiment = s.sentiment; reason = s.reason || ""; }
    } catch {}
    let score: number | null = null;
    let dimensions: Record<string, { score: number; applicable: boolean }> = {};
    try {
      const sc = JSON.parse(p.call_score || "{}");
      if (typeof sc.score === "number") score = sc.score;
      if (sc.dimensions) {
        for (const k of ["budget", "authority", "need", "timeline", "fit_usage"]) {
          const d = sc.dimensions[k];
          if (d) dimensions[k] = { score: Number(d.score) || 0, applicable: d.applicable !== false };
        }
      }
    } catch {}
    const dateMs = parseDateMs(p.call_date);
    return {
      id: r.id,
      title: p.call_title || p.call_name || "Call",
      dateMs,
      dateLabel: dateLabel(dateMs),
      sentiment,
      reason,
      stage: p.call_stage || "",
      score,
      dimensions,
    };
  }).sort((a: { dateMs: number }, b: { dateMs: number }) => a.dateMs - b.dateMs);

  return NextResponse.json({ dealName, points });
}
