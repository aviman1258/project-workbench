# Our Adventures

A private, Instagram-reel-style vacation library for Avishek, his wife, and
invited family — living at **https://adventures.avisheksportfolio.com**, kept
completely separate from the public portfolio.

## How privacy works

- **Cloudflare Access** gates the entire hostname at Cloudflare's edge. The
  allowlist is the list of emails in the Access policy; everyone signs in with
  a one-time PIN emailed to them. Unauthenticated requests never reach the app.
- The Worker **also verifies the Access JWT** on every API/media request
  (signature against the team's public certs, audience, expiry) — defense in
  depth, and the JWT's email drives the admin check (`ADMIN_EMAILS`).
- Videos, covers, and `library.json` live in a **private R2 bucket**. Nothing
  is in GitHub, nothing has a public URL, and media is streamed through the
  authenticated Worker with HTTP range support (so scrubbing works).
- There are no client-side passwords, hidden routes, or security-by-URL.

## Data model (`library.json` in R2)

- **vacation**: id, title, destination, startDate, endDate, description,
  coverKey, createdAt
- **reel**: id, vacationId, title, videoKey, thumbKey, duration,
  music {title, artist, source, license}, createdAt, publishedAt, visibility

The gallery groups and sorts **only on `vacation.startDate`** — a reel created
in 2026 about a 2015 trip appears under 2015. Upload dates are recorded but
never used for ordering.

## One-time setup (Cloudflare dashboard + CLI)

1. `npx wrangler login` (opens the browser; use the aviman1258 Cloudflare account).
2. `npx wrangler r2 bucket create our-adventures`
3. In **Zero Trust → Settings**, pick a team domain if you don't have one
   (e.g. `avishek.cloudflareaccess.com`).
4. `npx wrangler deploy` from this folder — this also provisions the
   `adventures.avisheksportfolio.com` custom domain (DNS record created
   automatically since the zone is on the same account).
5. In **Zero Trust → Access → Applications**, add a self-hosted application
   for `adventures.avisheksportfolio.com` with a policy: *Allow → Emails* →
   your, your wife's, and invited family's addresses. Session duration: 30 days
   is comfortable. Login method: One-time PIN.
6. Copy the application's **Audience (AUD) tag** and your team domain into
   `wrangler.toml` (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`), set `ADMIN_EMAILS`
   (you and your wife), and `npx wrangler deploy` again.

Redeploying later is just `npx wrangler deploy` from this folder.

## Publishing a reel (Phase 1)

Cut the reel wherever you like (Google Photos, CapCut, etc.), then on the site:
**+ Add → Vacation** (once per trip, with cover photo and real travel dates),
then **+ Add → Reel** (video file, optional cover frame, music credit fields).
Deleting a reel deletes its bytes from R2 immediately — the source media still
lives in Google Photos, so there is no recycle bin.

Upload limit: ~100 MB per file (Cloudflare request-body cap on the free plan).
A 60–90s 1080p reel is typically well under that; export at a lower bitrate if
one trips the limit.

## Costs

R2 free tier: 10 GB stored, zero egress — roughly 200+ reels before paying
~$0.015/GB-month beyond it. Workers free tier: 100k requests/day. Access: free
up to 50 users. Expected bill: **$0/month**.

## Later phases (agreed plan)

2. **Reel creator** — Google Photos Picker import into a temp R2 workspace
   (auto-cleaned after publish/cancel; Picker API is the post-2025 way, the
   Library API can no longer read existing libraries), reorder/trim/Ken Burns,
   music with volume/fades, in-browser ffmpeg.wasm rendering, preview → publish.
3. **AI assistance** — best-shot picking, duplicate detection, sequencing,
   captions, music moods; suggestions only, always previewed before publish.
4. **Enhanced memories** — maps, On This Day, year-in-review.
