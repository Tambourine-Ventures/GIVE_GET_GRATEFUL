/**
 * GET /api/unsubscribe?e=<email>&t=<hmac>
 *
 * One-click unsubscribe. The token is an HMAC of the address signed with the
 * UNSUBSCRIBE_SECRET, so a link can't be forged for someone else's address and
 * nobody has to be logged in to use it. The row is kept and flagged rather than
 * deleted, so a later signup can't silently resurrect the subscription.
 */

import { safeEqual, sign } from "../shared.js";

export async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") || "").trim().toLowerCase();
  const token = url.searchParams.get("t") || "";

  const expected = await sign(email, env.UNSUBSCRIBE_SECRET);
  if (!email || !safeEqual(token, expected)) {
    return page(
      "That link didn't work",
      "The unsubscribe link looks incomplete or expired. Reply to any message and we'll take you off the list by hand.",
      400
    );
  }

  if (env.DB) {
    await env.DB.prepare(
      `UPDATE signups SET unsubscribed = 1, updated_at = datetime('now')
        WHERE email = ?1`
    )
      .bind(email)
      .run();
  }

  return page(
    "You're unsubscribed",
    `We won't email ${escapeHtml(email)} again. Thanks for the time you gave it.`,
    200
  );
}

function page(title, body, status) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Give, Get, Grateful</title>
<link rel="stylesheet" href="/styles.css"></head>
<body><main class="section"><div class="wrap" style="max-width:38rem">
<p class="section-kicker">Give, Get, Grateful</p>
<h1 class="section-title">${escapeHtml(title)}</h1>
<p style="color:var(--ink-soft)">${body}</p>
<p><a class="btn btn-ghost" href="/">Back to the site</a></p>
</div></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
