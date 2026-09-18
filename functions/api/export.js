/**
 * GET /api/export?format=csv|json|stats[&interest=book|consulting|both][&limit=N]
 *
 * Your private list export. Authenticate with the ADMIN_TOKEN secret:
 *
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
 *        https://yoursite.pages.dev/api/export?format=csv -o signups.csv
 *
 * The CSV includes a ready-made unsubscribe link per row, so you can merge it
 * straight into whatever you send.
 */

import { json, safeEqual, sign } from "../_shared.js";

const COLUMNS = [
  "id",
  "email",
  "name",
  "interest",
  "organization",
  "message",
  "source",
  "country",
  "unsubscribed",
  "created_at",
  "updated_at",
];

const MAX_LIMIT = 10000;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return json({ error: "Use GET." }, 405, { Allow: "GET" });
  }
  if (!env.ADMIN_TOKEN) {
    console.error("export: ADMIN_TOKEN secret is not set");
    return json({ error: "Export is not configured." }, 500);
  }

  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeEqual(presented, env.ADMIN_TOKEN)) {
    return json({ error: "Unauthorized." }, 401, {
      "WWW-Authenticate": 'Bearer realm="export"',
    });
  }
  if (!env.DB) return json({ error: "No database binding." }, 500);

  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "json";
  const interest = url.searchParams.get("interest");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || String(MAX_LIMIT), 10) || MAX_LIMIT,
    MAX_LIMIT
  );

  if (format === "stats") {
    const { results } = await env.DB.prepare(
      `SELECT interest,
              COUNT(*)                                        AS total,
              SUM(CASE WHEN unsubscribed = 1 THEN 1 ELSE 0 END) AS unsubscribed,
              SUM(CASE WHEN created_at > datetime('now','-7 days') THEN 1 ELSE 0 END) AS last_7_days
         FROM signups
        GROUP BY interest`
    ).all();
    return json({ by_interest: results });
  }

  const where = ["book", "consulting", "both"].includes(interest)
    ? "WHERE interest = ?1"
    : "";
  const statement = env.DB.prepare(
    `SELECT ${COLUMNS.join(", ")} FROM signups ${where}
      ORDER BY created_at DESC LIMIT ${where ? "?2" : "?1"}`
  );
  const { results } = await (where
    ? statement.bind(interest, limit)
    : statement.bind(limit)
  ).all();

  if (format !== "csv") {
    return json({ count: results.length, signups: results });
  }

  const origin = url.origin;
  const rows = await Promise.all(
    results.map(async (row) => {
      const token = await sign(row.email, env.UNSUBSCRIBE_SECRET);
      const link = `${origin}/api/unsubscribe?e=${encodeURIComponent(
        row.email
      )}&t=${token}`;
      return [...COLUMNS.map((c) => row[c]), link].map(csvCell).join(",");
    })
  );

  const csv = [
    [...COLUMNS, "unsubscribe_url"].join(","),
    ...rows,
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ggg-signups-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Quote every cell and neutralise spreadsheet formula injection. */
function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
