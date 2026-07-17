import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to the transcriber's deal-retro endpoint (which holds the Anthropic
 * key). Server-to-server, authenticated with the shared HubSpot token.
 */
const TRANSCRIBER = "https://hubspot-call-transcriber.vercel.app/api/deal-retro";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  let body: unknown = {};
  try { body = await req.json(); } catch {}
  const res = await fetch(TRANSCRIBER, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: "bad upstream response" }));
  return NextResponse.json(data, { status: res.status });
}
