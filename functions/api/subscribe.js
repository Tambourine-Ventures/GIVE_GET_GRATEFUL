/**
 * POST /api/subscribe
 *
 * Stores one interest signup in D1. Re-submitting the same address updates
 * the existing row rather than creating a duplicate — and never downgrades
 * someone who previously asked about both the book and consulting.
 *
 * Bindings required (see wrangler.toml):
 *   DB            D1 database
 * Optional secrets:
 *   IP_SALT       salt for the stored IP hash
 *   RESEND_API_KEY + NOTIFY_TO + NOTIFY_FROM   email notification on new signups
 */

import { json, hashIp } from "../_shared.js";

const VALID_INTERESTS = new Set(["book", "consulting", "both"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  email: 254,
  name: 120,
  organization: 160,
  message: 2000,
  source: 120,
  userAgent: 256,
};

const RATE_LIMIT = { max: 5, windowHours: 1 };

const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function handleSubscribe(context) {
  const { request, env } = context;

  if (!env.DB) {
    console.error("subscribe: DB binding is missing");
    return json({ error: "The sign-up form isn't configured yet." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "We couldn't read that submission." }, 400);
  }

  // Honeypot: a real person never sees this field. Answer as if all is well
  // so the bot has nothing to learn from, but write nothing.
  if (clean(body.company_website, 200)) {
    return json({ ok: true, status: "subscribed" });
  }

  const email = clean(body.email, LIMITS.email).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json({ error: "That email address doesn't look valid." }, 400);
  }

  const interest = VALID_INTERESTS.has(body.interest) ? body.interest : "book";
  const name = clean(body.name, LIMITS.name);
  const source = clean(body.source, LIMITS.source);
  // Only kept for the paths that ask for them.
  const organization =
    interest === "book" ? "" : clean(body.organization, LIMITS.organization);
  const message =
    interest === "book" ? "" : clean(body.message, LIMITS.message);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = await hashIp(ip, env.IP_SALT);
  const country = request.cf?.country || "";
  const userAgent = clean(request.headers.get("User-Agent"), LIMITS.userAgent);

  try {
    // One round trip answers both questions: is this IP flooding us, and have
    // we seen this address before? The second decides "new" vs "updated" —
    // comparing created_at to updated_at can't, because datetime('now') only
    // has second precision and a double-submit lands inside the same second.
    const checks = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM signups
           WHERE ip_hash = ?1 AND created_at > datetime('now', ?2)) AS recent,
         (SELECT COUNT(*) FROM signups WHERE email = ?3) AS existing`
    )
      .bind(ipHash, `-${RATE_LIMIT.windowHours} hours`, email)
      .first();

    if (checks && checks.recent >= RATE_LIMIT.max) {
      return json(
        { error: "That's a lot of sign-ups from one place. Try again shortly." },
        429,
        { "Retry-After": String(RATE_LIMIT.windowHours * 3600) }
      );
    }

    const isNew = !checks || checks.existing === 0;

    // COALESCE/NULLIF keeps an existing value when the new submission leaves
    // that field blank, and 'both' always wins over a narrower interest.
    await env.DB.prepare(
      `INSERT INTO signups
         (email, name, interest, organization, message, source, country, ip_hash, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(email) DO UPDATE SET
         name         = COALESCE(NULLIF(excluded.name, ''), signups.name),
         interest     = CASE WHEN signups.interest = excluded.interest
                             THEN signups.interest ELSE 'both' END,
         organization = COALESCE(NULLIF(excluded.organization, ''), signups.organization),
         message      = COALESCE(NULLIF(excluded.message, ''), signups.message),
         unsubscribed = 0,
         updated_at   = datetime('now')`
    )
      .bind(
        email,
        name,
        interest,
        organization,
        message,
        source,
        country,
        ipHash,
        userAgent
      )
      .run();

    // Notification is best-effort: a mail failure must not fail the signup.
    context.waitUntil(
      notify(env, { email, name, interest, organization, message, isNew })
    );

    return json({ ok: true, status: isNew ? "subscribed" : "updated" });
  } catch (err) {
    console.error("subscribe failed:", err && err.message);
    return json(
      { error: "We couldn't save that just now. Please try again." },
      500
    );
  }
}

/** Optional: email yourself when someone signs up. No-ops without a key. */
async function notify(env, signup) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO) return;

  const label = { book: "Book", consulting: "Consulting", both: "Book + consulting" }[
    signup.interest
  ];
  const lines = [
    `Interest: ${label}`,
    `Name: ${signup.name || "—"}`,
    `Email: ${signup.email}`,
    signup.organization ? `Organization: ${signup.organization}` : null,
    signup.message ? `\nMessage:\n${signup.message}` : null,
  ].filter(Boolean);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "Give Get Grateful <onboarding@resend.dev>",
        to: [env.NOTIFY_TO],
        reply_to: signup.email,
        subject: `${signup.isNew ? "New" : "Updated"} signup — ${label}`,
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) console.error("notify failed:", res.status, await res.text());
  } catch (err) {
    console.error("notify threw:", err && err.message);
  }
}

/** Single entry point: POST does the work, everything else gets a clear 405. */
export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Use POST." }, 405, { Allow: "POST" });
  }
  return handleSubscribe(context);
}
