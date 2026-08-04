# Twitter/X tweet embed — design

Date: 2026-08-03

## Problem

Article content (Markdown/HTML in `Article.contentHtml`, rendered via
`renderWikiHtml` in `src/lib/wiki-html.ts`) has no way to embed a tweet. We
want authors to paste a bare `x.com`/`twitter.com` status URL and have it
render as a real tweet — but self-hosted: the tweet's text, images, and
video (as a silent optimized gif) are fetched once and archived in our own
database, so the embed keeps working even if Twitter/X is unreachable or the
original tweet is deleted.

## Goals

- A bare tweet URL, alone on its own line in article Markdown, renders as a
  static tweet card (author, text, media) at view time.
- Tweet content is fetched and archived once, on article save, into our own
  DB — no live call to Twitter/X at render time.
- Images are optimized (resized/re-encoded) before storage. Videos are
  transcoded to an optimized, audio-stripped GIF before storage.
- Archiving is best-effort: a fetch failure must not block saving the
  article. An unarchived tweet URL just renders as a plain link until a
  later save retries it.

## Non-goals

- No live/interactive embed (likes, replies, retweets, official
  `widgets.js`) — static archived card only.
- No auto-retry job/queue for failed fetches — retry only happens
  incidentally, on a later article save that re-scans the content.
- No admin UI for managing/re-fetching archived tweets — out of scope, would
  need its own design pass if wanted later.
- No support for tweet URLs embedded mid-sentence or inside markdown link
  syntax — only a URL that is the entire content of its line.
- No official X API integration (paid Bearer Token) — using the unofficial
  syndication endpoint instead (see Risks).

## Architecture

**Data model** — new Prisma models, global cache keyed by tweet status id
(not tied to a specific article, so the same tweet can be reused across
articles without re-fetching):

```prisma
model Tweet {
  id           String       @id            // twitter status id, e.g. "1234567890"
  authorName   String
  authorHandle String
  text         String       @db.Text
  sourceUrl    String
  fetchedAt    DateTime     @default(now())
  media        TweetMedia[]
}

model TweetMedia {
  id       String @id @default(cuid())
  tweetId  String
  tweet    Tweet  @relation(fields: [tweetId], references: [id], onDelete: Cascade)
  kind     String // "image" | "gif"
  mimeType String
  data     Bytes
  order    Int
}
```

**Fetch/archive pipeline** — new `src/lib/tweet-archive.ts` (server-only,
imports `prisma`):

- `extractTweetIds(source: string): string[]` — scans lines of the raw
  article source; a line matches if, after trimming, it is *only* a URL of
  the form `https://(x.com|twitter.com)/<handle>/status/<id>` (optional
  query string). Returns the extracted numeric ids.
- `archiveTweet(tweetId: string): Promise<void>`:
  1. Skip if a `Tweet` row with that id already exists (cache hit).
  2. Fetch `https://cdn.syndication.twimg.com/tweet-result?id=<tweetId>`
     (unofficial syndication endpoint — no auth required).
  3. Parse author name/handle, tweet text, and media entries (photos /
     video) from the response.
  4. For each photo: download, optimize via `sharp` (resize to a max
     dimension, re-encode), store as a `TweetMedia(kind: "image")` row.
  5. For video: download the best variant, transcode to an optimized,
     audio-stripped GIF via `fluent-ffmpeg` + `ffmpeg-static` (`-an`, capped
     fps/width for size), store as `TweetMedia(kind: "gif")`.
  6. Upsert the `Tweet` row and its `TweetMedia` rows in a transaction.
  - Any error in steps 2–6 is caught and logged; the tweet simply stays
    unarchived (no row created) rather than failing the caller.
- `archiveTweetsInContent(source: string): Promise<void>` — runs
  `extractTweetIds` then `archiveTweet` for each id, sequentially,
  swallowing per-id errors (best-effort, per Goals).
- Called from the `createArticle` and `saveArticle` server fn handlers
  (`src/routes/admin_.new.tsx`, `src/routes/admin_.edit.$slug.tsx`), after
  the Prisma upsert of the article succeeds.

**Render pipeline** — changes to `src/lib/wiki-html.ts` and
`src/routes/article.$slug.tsx`:

- Architectural fix needed first: `renderWikiHtml` is currently called
  inside the `ArticlePage` component body, which runs on both server and
  client. Once it needs a DB lookup (Prisma, server-only), it can no longer
  run there. Move the call into the `getArticle` loader (already a
  `createServerFn`, server-only) — the loader returns pre-rendered `html`
  instead of raw `contentHtml`, and the component just injects it.
- New `renderWikiHtml(source)` steps:
  1. Replace each detected tweet URL line with a unique placeholder token
     (not valid Markdown) before parsing.
  2. Run `marked.parse` as today.
  3. Rewrite `data-internal` links as today.
  4. For each placeholder: look up the cached `Tweet` + `TweetMedia` rows.
     - Found: substitute a static, self-contained HTML card — author
       name/handle, text, media images/gif inlined as `data:` URIs, and a
       link back to the original tweet. No client JS required.
     - Not found (never archived, or archive failed): substitute a plain
       `<a>` link to the original URL.

**New dependencies:** `sharp` (image optimization), `ffmpeg-static` +
`fluent-ffmpeg` (video → silent GIF transcode).

## Error handling

- Archive fetch/transcode failures: caught, logged, article save proceeds
  unaffected. Rendering falls back to a plain link for that URL.
- Malformed/unparseable syndication response: treated the same as a fetch
  failure (caught, logged, no row written).

## Risks

- `cdn.syndication.twimg.com` is an unofficial, undocumented endpoint. It
  can change shape or start blocking without notice. If it breaks, new
  tweets simply fail to archive (degrade to plain links); already-archived
  tweets are unaffected since they're served from our own DB.
- GIF transcodes can be large; `fluent-ffmpeg` output is capped
  (width/fps) to keep this reasonable, but very long tweet videos could
  still produce a sizeable `Bytes` row.

## Testing

- Unit test `extractTweetIds` against bare-URL-on-own-line vs. inline/link
  cases (should only match the former).
- Manual: paste a real tweet URL (with a photo, and separately one with
  video) into an article, save, confirm archived row + rendered card;
  confirm second save doesn't re-fetch (cache hit); confirm a
  known-bad/deleted tweet id degrades to a plain link without blocking
  save.
