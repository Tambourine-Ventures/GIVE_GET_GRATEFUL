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

The site deploys from this GitHub repository: you connect it to a Cloudflare
Pages project once, and every push after that deploys on its own. Only the
database has to be created from your own machine, because `wrangler d1 create`
needs your Cloudflare login.

### 1 — Create the database, before connecting anything

```bash
npm install
npx wrangler login
npm run db:create
```

Paste the `database_id` it prints into `wrangler.toml`, replacing
`PASTE_YOUR_DATABASE_ID_HERE`. Then create the table and push:

```bash
npm run db:init
git commit -am "Add D1 database id"
git push
```

Do this first. Until that id is real, `wrangler.toml` declares a D1 binding
naming a database that does not exist. The id is an identifier rather than a
secret, so committing it is expected.

### 2 — Connect the repo to a Pages project

In the Cloudflare dashboard, create a **Pages** project connected to this
GitHub repository. What matters is the configuration, not the route you take
to it:

| Setting | Value |
| --- | --- |
| Production branch | this repo's default branch |
| Build command | **empty** — nothing here compiles |
| Build output directory | `public` |
| Deploy command | **empty**, if the form offers one at all |

That last row is the one to watch. A Pages build publishes `public/` and runs
no deploy command; a build that runs `npx wrangler deploy` is configured as a
Worker and will fail against this repo. See *If the build fails* below for
what that looks like.

`functions/` is picked up automatically — it sits at the repo root, beside
`public/`, which is where Pages looks for it. `wrangler.toml` supplies the
output directory and the D1 binding.

Cloudflare runs `npm clean-install` because a `package.json` is present. That
is expected, takes a few seconds, and compiles nothing.

### 3 — Set the secrets

Generate long random values — `openssl rand -hex 32` is fine for each — and
set them against the project you just created:

```bash
npx wrangler pages secret put ADMIN_TOKEN        --project-name <your-project>
npx wrangler pages secret put UNSUBSCRIBE_SECRET --project-name <your-project>
npx wrangler pages secret put IP_SALT            --project-name <your-project>
```

They can also be added in the dashboard as encrypted environment variables,
which amounts to the same thing. The site works without them, but the export
endpoint refuses to run until `ADMIN_TOKEN` exists — the safe way round.

### Deploying by hand instead

`npm run deploy` uploads `public/` directly, without involving GitHub. It is
useful for a one-off, but a project created this way is a *direct upload*
project, and Cloudflare may not let you attach a repository to it afterwards.
Prefer the steps above.

## If the build fails

**`Missing entry-point to Worker script or to assets directory`**, with a
warning just above it reading *"It seems that you have run `wrangler deploy`
on a Pages project, `wrangler pages deploy` should be used instead."*

The project was created as a **Worker**, not a **Pages** project. Workers
projects deploy by running `npx wrangler deploy`, which looks for a Worker
entry point — a `main` in `wrangler.toml`, or an `[assets]` directory. This
repo has neither, because a Pages project needs neither: it publishes
`public/` and serves `functions/` alongside it.

Nothing in the repo needs changing. Create a Pages project against the same
repository instead, per step 2 above, and delete the Worker one. You can tell
the two apart from the build log: the Worker build runs `wrangler deploy`, and
a Pages build does not run a deploy command at all.

**`npm warn allow-scripts ... esbuild`** is not a failure. `esbuild` arrives
as a dependency of `wrangler`, which only ever runs from your own machine —
nothing in the published site uses it, so a skipped postinstall changes
nothing. A build that is genuinely failing says so on its last line, with a
non-zero exit.

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
