# Notion-style bookmark embed — design

Date: 2026-08-05

## Problem

Article content supports self-hosted tweet embeds (a bare `x.com`/`twitter.com`
status URL alone on its own paragraph renders as an archived tweet card). We
want the same for arbitrary web links: a bare URL to any other site, alone on
its own paragraph, should render as a rich Notion-style bookmark card (title,
description, image, favicon) instead of a plain link — fetched and archived
once, self-hosted forever after, exactly like tweet embeds.

## Goals

- A bare URL (any host) alone on its own Markdown paragraph renders as a
  bookmark card: title, description, thumbnail image, favicon.
- Metadata is fetched and archived once, on article save, into our own DB —
  no live call to the linked site at render time.
- Archiving is best-effort: a fetch failure must not block saving the
  article. An unarchived (or never-fetchable) URL renders as a plain link.
- The server fetches attacker-influenceable URLs (whatever an admin pastes,
  and whatever image/favicon URLs that page's own metadata points at) —
  guard against SSRF: reject targets that resolve to private/internal IP
  ranges, not just non-`http(s)` schemes.
- Tweet URLs (`x.com`/`twitter.com` status links) keep going through the
  existing tweet pipeline unchanged — never double-embedded as both a tweet
  card and a bookmark card.

## Non-goals

- No live/interactive embed — static archived card only, matching the tweet
  embed's contract.
- No admin UI for managing/re-fetching archived bookmarks — out of scope,
  matches the tweet embed precedent.
- No auto-retry job for failed fetches — retry only happens incidentally, on
  a later article save that re-scans the content (same as tweets).
- No support for a URL embedded mid-sentence or inside markdown link syntax
  `[text](url)` — only a URL that is the entire content of its own paragraph.
- No re-fetch/refresh of already-archived metadata (a page's title changing
  later doesn't update our cached copy) — matches the tweet embed's
  "archive once" contract.

## Architecture

**Data model** — new Prisma model, global cache keyed by the raw URL
(same "cache once, reuse across articles" pattern as `Tweet`):

```prisma
model Bookmark {
  url             String   @id
  title           String?
  description     String?
  imageData       Bytes?
  imageMimeType   String?
  faviconData     Bytes?
  faviconMimeType String?
  fetchedAt       DateTime @default(now())
}
```

All fields besides the URL itself are nullable — a page might have no
description, no `og:image`, no discoverable favicon, or (worst case) be
fully unparseable, in which case `title` falls back to the URL's hostname
so the card never renders with fully empty text.

**Detection & tweet overlap** — a URL triggers a bookmark under the exact
same isolation rule tweets use (line is the entire content of its own
Markdown paragraph — blank line or document boundary immediately before
and after — and not inside a fenced code block), **except** URLs matching
the existing tweet pattern (`(x.com|twitter.com)/<handle>/status/<id>`),
which are excluded from bookmark matching and continue through the tweet
pipeline unchanged. The isolation/fence-tracking logic itself (currently
`findIsolatedTweetUrlLines` in `src/lib/tweet-archive.ts`) gets
generalized into a shared helper parameterized by "what counts as a
matching URL on this line," used by both tweet and bookmark detection —
avoiding a third copy of that logic.

**Fetch/archive pipeline** — new `src/lib/bookmark-archive.ts`
(server-only, imports `prisma`):

- `archiveBookmark(url: string): Promise<void>`:
  1. Skip if a `Bookmark` row for that URL already exists (cache hit).
  2. Validate the URL: must be `http:`/`https:`. Resolve the hostname via
     DNS and check the resulting IP against private/loopback/link-local
     ranges (RFC 1918, loopback, link-local, IPv6 equivalents) — reject if
     private. Checking the hostname string alone is insufficient (a
     public-looking hostname can still resolve to an internal address), so
     this is a real DNS-resolve-then-check, not a string pattern match.
  3. Fetch the page HTML (10s timeout, response-size cap — same discipline
     as the tweet pipeline's `fetchBuffer`).
  4. Parse via `cheerio` (already a dependency, used in `scripts/scrape.ts`
     — no new dependency needed) for `<title>`, `<meta name="description">`
     (falling back to `<meta property="og:description">`), `<meta
     property="og:image">`, and `<link rel="icon">` /
     `<link rel="shortcut icon">` (falling back to `/favicon.ico` at the
     site root if no explicit tag is present). Relative image/favicon URLs
     are resolved against the page's URL.
  5. If an image URL was found: fetch it (through the same SSRF guard as
     step 2 — it may be hosted on a different domain than the page itself,
     e.g. a CDN), optimize via the existing `optimizeImage()` (already used
     by the tweet pipeline), store as `imageData`/`imageMimeType`.
  6. Same for the favicon URL, if found.
  7. Upsert the `Bookmark` row with whatever was successfully gathered.
  - Any error at any step is caught and logged; the URL simply stays
    unarchived (no row created) rather than failing the caller — identical
    contract to `archiveTweet`.
- `archiveBookmarksInContent(source: string): Promise<void>` — extracts
  bookmark-eligible URLs from the source and runs `archiveBookmark` for
  each, best-effort, mirroring `archiveTweetsInContent`.
- Called from the same place the tweet archiving call already happens: the
  `createArticle`/`saveArticle` server fn handlers, after the article
  upsert succeeds.

**Render** — `src/lib/render-article.ts`'s `renderArticleContent` is
extended to detect both tweet-isolated-lines and bookmark-isolated-lines in
one pass over the source, substitute a placeholder for each, run the
existing Markdown render, then do two independent placeholder-substitution
passes (unchanged tweet lookup/card logic, plus a new bookmark
lookup/card):

- Found + has an image: card shows favicon (small, inline) + title +
  description + image, all as `data:` URIs, linking back to the original
  URL. No client JS.
- Found but missing some fields (e.g. no image, no favicon): card renders
  with whatever was found, gracefully omitting missing pieces — never a
  broken/empty element for a field that wasn't discoverable.
- Never archived (fetch failed, or content changed since a prior save):
  falls back to a plain `<a>` link to the original URL, matching the
  tweet embed's fallback contract exactly.

**New dependencies:** none — reuses `cheerio` (already present) and
`optimizeImage()` (already present).

## Error handling

- Fetch/parse/SSRF-rejection failures: caught, logged, article save
  proceeds unaffected. Rendering falls back to a plain link for that URL.
- A private-IP-resolving URL is treated the same as any other fetch
  failure — logged, no row written, no distinct user-facing error (the
  admin isn't told "that URL was blocked for security reasons" — it just
  silently stays a plain link, matching the best-effort philosophy).

## Risks

- DNS-resolve-then-check has a theoretical TOCTOU gap (DNS could
  re-resolve to a different, private IP between the check and the actual
  fetch — "DNS rebinding"). Given this is an admin-only, low-frequency
  feature (not a public-facing fetch-any-URL service), and the check still
  closes the overwhelmingly common case (a hostname that's simply
  internal), this residual risk is accepted rather than engineered around
  with connection-level IP pinning — consistent with this codebase's
  existing risk tolerance for its other fetch paths.
- Arbitrary third-party HTML parsing (via `cheerio`) has a broader attack
  surface than the tweet pipeline's fixed, known JSON shape from a single
  trusted-ish endpoint. `cheerio` parses HTML, not executes it, so this is
  a parsing-robustness concern (malformed markup) rather than a code-
  execution one — errors during parsing are caught by the same best-effort
  try/catch as everything else in `archiveBookmark`.

## Testing

- Unit test the generalized isolation helper against both a tweet-URL
  predicate and a generic-URL predicate, confirming tweet URLs are
  correctly excluded from bookmark matching (and vice versa).
- Unit test the private-IP-range check function directly against known
  private/public IP examples (both IPv4 and IPv6), without needing a real
  DNS lookup in the test.
- Unit test the `cheerio`-based metadata parser against fixture HTML
  (present title/description/image/favicon; each individually missing;
  relative vs. absolute image/favicon URLs).
- Manual: paste a real public URL with rich Open Graph metadata into an
  article, save, confirm archived row + rendered card; paste a URL to an
  internal/private address (e.g. `http://127.0.0.1` or `http://10.0.0.1`)
  and confirm it's rejected (no fetch attempted, degrades to plain link,
  no row written); paste a URL to a page with minimal/no metadata and
  confirm the card degrades gracefully (title-only, or hostname fallback)
  rather than breaking.
