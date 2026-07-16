"use client";

/**
 * First Demo tab — surfaces the deal's (or account's) first-demo call with its
 * full BANT + sentiment intelligence. Fallback order:
 *   1. a call tagged "First demo" on the deal/account timeline
 *   2. the earliest scored call on the timeline
 *   3. the opened call itself (when no deal/company linkage exists)
 */

import { useEffect, useMemo, useState } from "react";
import { CallCard, Point, pointFromMetadata } from "./intel";

export default function FirstDemo({ recordId, title, metadata }: {
  recordId: string | null; title: string; metadata: Record<string, string | undefined>;
}) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [dealName, setDealName] = useState("");
  const [scope, setScope] = useState<"deal" | "company" | "none">("deal");

  useEffect(() => {
    if (!recordId) return;
    fetch(`/api/deal-sentiment?recordId=${recordId}`).then(r => r.json())
      .then(d => { setDealName(d.dealName || ""); setScope(d.scope || "deal"); setPoints(d.points || []); })
      .catch(() => setPoints([]));
  }, [recordId]);

  const current = useMemo(() => pointFromMetadata(metadata, title), [metadata, title]);

  if (!points) return <Msg>Loading first demo…</Msg>;

  const sorted = [...points].sort((a, b) => a.dateMs - b.dateMs);
  const tagged = sorted.find(p => /first demo/i.test(p.stage));
  const fallback = sorted.find(p => p.score != null) || sorted[0];
  const show: Point | null = tagged || fallback || (current.score != null || current.sentiment !== "unknown" ? current : null);

  if (!show) return <Msg>No processed calls found for this deal or account yet.</Msg>;

  const isTagged = /first demo/i.test(show.stage);
  const note = !isTagged
    ? (points.length === 0
        ? "This call isn't linked to a deal or account timeline — showing this call's own intelligence."
        : `No call on this ${scope === "company" ? "account" : "deal"} is tagged “First demo” — the first demo likely predates call recording. Showing the earliest scored call (${show.stage || "unknown stage"}).`)
    : null;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 26px 36px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: isTagged ? "#fff" : "var(--text-secondary)", background: isTagged ? "#f4603e" : "var(--surface-C)", borderRadius: 99, padding: "4px 11px" }}>
            {isTagged ? "★ FIRST DEMO" : "EARLIEST CALL"}
          </span>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: "var(--text-primary)" }}>{show.title}</h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disable)" }}>{show.dateLabel}{dealName ? ` · ${dealName}` : ""}</span>
        </div>
        {note && (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--surface-B)", border: "1px solid var(--border-weaker)", borderRadius: 10, padding: "10px 14px", lineHeight: 1.5 }}>
            {note}
          </div>
        )}
        <CallCard point={show} />
      </div>
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--text-disable)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{children}</div>;
}
