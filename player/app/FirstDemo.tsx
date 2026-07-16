"use client";

/**
 * First Demo tab — surfaces the deal's first-demo call (hard to find otherwise),
 * with its full BANT + sentiment intelligence. Falls back to the earliest call
 * on the deal if no call is explicitly stage="First demo".
 */

import { useEffect, useState } from "react";
import { CallCard, Point } from "./intel";

export default function FirstDemo({ recordId, title }: { recordId: string | null; title: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [dealName, setDealName] = useState("");

  useEffect(() => {
    if (!recordId) return;
    fetch(`/api/deal-sentiment?recordId=${recordId}`).then(r => r.json())
      .then(d => { setDealName(d.dealName || ""); setPoints(d.points || []); })
      .catch(() => setPoints([]));
  }, [recordId]);

  const msg = (t: string) => <div style={{ padding: 40, textAlign: "center", color: "var(--text-disable)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{t}</div>;
  if (!points) return msg("Loading first demo…");
  if (points.length === 0) return msg("No processed calls on this deal yet.");

  const sorted = [...points].sort((a, b) => a.dateMs - b.dateMs);
  const firstDemo = sorted.find(p => /first demo/i.test(p.stage)) || sorted.find(p => p.score != null) || sorted[0];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 26px 36px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#fff", background: "#f4603e", borderRadius: 99, padding: "4px 11px" }}>★ FIRST DEMO</span>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: "var(--text-primary)" }}>{firstDemo.title}</h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-disable)" }}>{firstDemo.dateLabel} · {dealName}</span>
        </div>
        {!/first demo/i.test(firstDemo.stage) && (
          <p style={{ fontSize: 12, color: "var(--text-disable)", margin: 0 }}>No call is tagged “First demo” on this deal — showing the earliest scored call ({firstDemo.stage || "unknown stage"}).</p>
        )}
        <CallCard point={firstDemo} />
      </div>
    </div>
  );
}
