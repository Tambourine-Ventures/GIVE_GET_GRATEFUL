# Give, Get, Grateful — landing page

A single-page site for the book **Give, Get, Grateful** and the consulting work
around it, with a sign-up form that writes straight into a Cloudflare D1
database. No third-party form service, no monthly fee, no tracking scripts.

```
public/            everything served as-is (the Pages build output directory)
  index.html       the landing page
  privacy.html     privacy notice — matches what the code actually stores
  styles.css       all styling; the palette lives in :root at the top
  app.js           form behaviour, ~140 lines, no dependencies
  og.svg           source for the social preview image
functions/
  _shared.js       json(), hashIp(), safeEqual(), sign()
  api/subscribe.js   POST — validates and stores a signup
  api/export.js      GET  — your private CSV/JSON export (token protected)
  api/unsubscribe.js GET  — one-click unsubscribe via signed link
schema.sql         the D1 table and its indexes
wrangler.toml      Pages + D1 configuration
```

## How the page is put together

The hero gives the book and the consulting equal billing — two cards, two
calls to action. Both lead to the **same form** at the bottom of the page,
which preselects the matching option when you arrive from one of them. Picking
"Working together" or "Both" reveals two extra fields (organization, and what
you're hoping to change); those fields are disabled while hidden, so a book
signup never sends them.

One form means one list, one endpoint, and one place to change the copy.

## Setup, once

You need a Cloudflare account and Node installed.

```bash
npm install
npx wrangler login
```

**1 — Create the database.** Copy the `database_id` it prints into
`wrangler.toml`, replacing `PASTE_YOUR_DATABASE_ID_HERE`.

```bash
npm run db:create
```

**2 — Create the table.**

```bash
npm run db:init
```

**3 — Deploy.**

```bash
npm run deploy
```

The first deploy asks you to name the Pages project — `give-get-grateful`
matches the config. You'll get a `*.pages.dev` URL immediately.

**4 — Set the secrets.** Generate long random values for the first three;
`openssl rand -hex 32` is fine for all of them.

```bash
npx wrangler pages secret put ADMIN_TOKEN          # protects /api/export
npx wrangler pages secret put UNSUBSCRIBE_SECRET   # signs unsubscribe links
npx wrangler pages secret put IP_SALT              # salts the stored IP hash
```

The site works without them, but the export endpoint refuses to run until
`ADMIN_TOKEN` exists — which is the safe way round.

**5 — Connect the git repo (recommended).** In the Cloudflare dashboard:
*Workers & Pages → your project → Settings → Build*, connect this repository
and set the production branch. Every push then deploys automatically, and the
D1 binding you configured stays attached. Set the build output directory to
`public` and leave the build command empty — there's nothing to compile.

## Getting your list out

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "https://your-site.pages.dev/api/export?format=csv" -o signups.csv
```

Other options:

| Query | What you get |
|---|---|
| `?format=csv` | Spreadsheet-ready, with a per-person unsubscribe URL column |
| `?format=json` | The same rows as JSON |
| `?format=stats` | Totals per interest, plus last-7-days |
| `&interest=consulting` | Only the people who want to work with you |

The CSV quotes every cell and prefixes anything starting with `=`, `+`, `-` or
`@` with an apostrophe, so a pasted message can't execute as a formula when you
open it in Excel or Sheets.

## Optional: get emailed on each signup

Create a [Resend](https://resend.com) API key, then:

```bash
npx wrangler pages secret put RESEND_API_KEY
```

and add `NOTIFY_TO` (your address) and `NOTIFY_FROM` (a verified sender) as
plain environment variables in the Pages dashboard. Without these the code
simply skips the notification — the signup still saves. Notification failures
never fail a signup.

## Running it locally

```bash
cp .dev.vars.example .dev.vars
npm run db:init:local
npm run dev
```

That serves the real Functions against a local D1 file at
`http://localhost:8788`.

## What's left before you launch

Two values still point at placeholders: your **domain** and your **email
address**. One command sets both, everywhere they appear:

```bash
python3 tools/set-site-details.py yourdomain.com you@yourdomain.com
```

It rewrites `index.html`, `privacy.html`, `app.js`, `robots.txt` and
`sitemap.xml`, prints what it changed, and is safe to run twice. Review with
`git diff` before committing.

### The domain

The site works immediately on the free `*.pages.dev` URL Cloudflare gives you
— a custom domain is about how it reads, not whether it runs. To attach one:
buy it anywhere, then in the Cloudflare dashboard go to your Pages project →
*Custom domains* → *Set up a domain*. If the domain is already on Cloudflare
the DNS record is added for you; otherwise Cloudflare shows the record to add
at your registrar. HTTPS is automatic either way.

Until you have one, you can run the command above with your `.pages.dev`
address and the canonical URLs will at least be correct.

### The email address

Anywhere you'll actually read is fine — the address appears as a fallback
when a form submission fails, and in the privacy notice as the way to ask for
deletion. A plain Gmail address works. If you'd rather have `hello@` at your
own domain without running a mailbox, Cloudflare Email Routing (dashboard →
your domain → *Email*) forwards it to an inbox you already have, free.

### Optional

- **Colours** — the `:root` block at the top of `styles.css`. Change
  `--accent` and the whole page follows.
- **Social preview card** — `public/og.jpg` is done: 1200×630, rendered from
  `tools/og-card.html`. If the subtitle, author name or cover changes, open
  that file in a browser and screenshot it at exactly 1200×630, or ask Claude
  to re-render it. Keep the output as JPEG — the same card as a PNG is about
  five times larger for no visible gain.

Images: `public/portrait.jpg` (999×1501) and `public/cover.webp` (1024×1536)
both have enough resolution for a 2× display at every breakpoint — the widest
either one renders is 454 and 348 CSS pixels respectively. The photo ships
as supplied rather than re-encoded; turn on Cloudflare Polish in the dashboard
if you want WebP/AVIF served at the edge without touching the source files.

## Notes on the form's defences

- A honeypot field (`company_website`) is hidden from people; anything that
  fills it gets a cheerful 200 and is not stored.
- Five submissions per IP per hour, tracked by salted hash rather than the
  address itself.
- Field lengths are capped server-side, not just in the markup.
- Re-submitting an address updates the existing row instead of duplicating it,
  and never downgrades someone from "both" to a narrower interest.
- Blank fields on a re-submission keep whatever was there before.
