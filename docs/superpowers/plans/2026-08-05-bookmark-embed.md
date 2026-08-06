# Notion-Style Bookmark Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bare URL (any host) alone on its own Markdown paragraph renders as a self-hosted Notion-style bookmark card (title, description, image, favicon), archived once on article save — matching the existing tweet embed's detect → archive-on-save → self-host-render pattern, but for arbitrary web links instead of just tweets.

**Architecture:** The line-isolation/fence-tracking logic currently living inside `findIsolatedTweetUrlLines` gets generalized into a shared helper (`src/lib/isolated-url.ts`) used by both tweet and bookmark detection. A new `src/lib/bookmark-archive.ts` mirrors `tweet-archive.ts`'s structure: URL detection (excluding tweet-shaped URLs), a DNS-resolve-based SSRF guard, a `cheerio`-based metadata parser, and best-effort fetch/archive orchestration into a new `Bookmark` table. `render-article.ts` is extended to detect and substitute both tweet and bookmark placeholders in one pass.

**Tech Stack:** TanStack Start (server fns), Prisma/Postgres, `cheerio` (already a dependency, used in `scripts/scrape.ts`), existing `optimizeImage()` from `tweet-media.ts`, Node's built-in `dns/promises`.

## Global Constraints

- Only a URL that is the **entire content of its own paragraph** (blank line or document boundary before and after, not inside a fenced code block) triggers a bookmark — identical isolation rule to tweets, reusing the exact same underlying algorithm.
- URLs matching the existing tweet pattern (`(x.com|twitter.com)/<handle>/status/<id>`) are **excluded** from bookmark matching — they keep going through the tweet pipeline, never double-embedded.
- Archiving is **best-effort**: any failure (SSRF rejection, fetch failure, parse failure, image/favicon fetch failure) must be caught and logged, never thrown — it must not block the article save. A missing image/favicon must not prevent the title/description from being archived (catch those failures independently, per-field).
- **SSRF guard is mandatory** on every outbound fetch this feature makes (the page itself, and its image/favicon, which may be on a different host): resolve the hostname via DNS and reject if the resolved IP is in a private/loopback/link-local range — checking the hostname string alone is insufficient.
- No new npm dependencies — reuses `cheerio` (already present) and `optimizeImage()` (already present).
- Rendered card is fully static HTML (media inlined as `data:` URIs) — no client JS, no live call to the linked site at render time.
- Unarchived (or never-fetchable) URL renders as a plain, escaped `<a>` link — never a broken/empty card.

---

### Task 1: Prisma schema — `Bookmark`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `Bookmark { url, title, description, imageData, imageMimeType, faviconData, faviconMimeType, fetchedAt }`, available via `@prisma/client` as `prisma.bookmark` after `prisma generate`.

- [ ] **Step 1: Add the model**

Append to `prisma/schema.prisma` (after the existing `TweetMedia` model):

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

- [ ] **Step 2: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 3: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Verify**

Run: `node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.bookmark.findFirst().then(()=>console.log('OK')).catch(e=>{console.error(e);process.exit(1)})"` — should print `OK`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Bookmark model for archived link-preview embeds"
```

---

### Task 2: Extract shared isolation helper

**Files:**
- Create: `src/lib/isolated-url.ts`
- Test: `src/lib/isolated-url.test.ts`
- Modify: `src/lib/tweet-archive.ts`

**Interfaces:**
- Produces: `findIsolatedUrlLines(source: string, matchUrl: (trimmedLine: string) => string | null): Map<number, string>` — for each line in `source`, if it's outside a fenced code block (` ``` `/`~~~` toggled), calls `matchUrl` on the trimmed line; if it returns a non-null string AND the line is isolated (blank line or document boundary immediately before and after), records `lineIndex -> matchUrl's return value` in the result map.
- Consumes (in `tweet-archive.ts`): the new `findIsolatedUrlLines`, replacing that file's own copy of the isolation/fence logic.

This task is a **behavior-preserving refactor** — `tweet-archive.ts`'s existing 8 `extractTweetIds`/`findIsolatedTweetUrlLines` tests (already in `tweet-archive.test.ts`) must pass unchanged after this task, proving the extraction didn't change behavior.

- [ ] **Step 1: Write the failing tests for the generic helper**

Create `src/lib/isolated-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findIsolatedUrlLines } from "./isolated-url";

const matchDigits = (line: string): string | null => (/^\d+$/.test(line) ? line : null);

describe("findIsolatedUrlLines", () => {
  it("matches a value alone on its own paragraph", () => {
    const source = "Some text\n\n42\n\nMore text";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map([[2, "42"]]));
  });

  it("does not match a value that isn't isolated by blank lines", () => {
    const source = "Check this out:\n42\nThanks!";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map());
  });

  it("does not match a value inside a fenced code block", () => {
    const source = "```\n42\n```";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map());
  });

  it("matches at document start and end with no surrounding blank lines needed", () => {
    const source = "42";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map([[0, "42"]]));
  });

  it("matches multiple isolated values independently", () => {
    const source = "1\n\n2";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(
      new Map([
        [0, "1"],
        [2, "2"],
      ]),
    );
  });

  it("passes the matcher's return value through, not the raw line", () => {
    const source = "hello";
    expect(findIsolatedUrlLines(source, (line) => (line === "hello" ? "world" : null))).toEqual(
      new Map([[0, "world"]]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/isolated-url.test.ts`
Expected: FAIL — `Failed to resolve import "./isolated-url"`.

- [ ] **Step 3: Implement `isolated-url.ts`**

Create `src/lib/isolated-url.ts`:

```ts
function isFenceDelimiter(line: string): boolean {
  return /^(```|~~~)/.test(line.trim());
}

/**
 * Line-index -> matchUrl's return value, for every line that is BOTH
 * matched by `matchUrl` and isolated as its own Markdown paragraph (blank
 * line or document boundary immediately before and after), outside any
 * fenced code block.
 */
export function findIsolatedUrlLines(
  source: string,
  matchUrl: (trimmedLine: string) => string | null,
): Map<number, string> {
  const lines = source.split("\n");
  const result = new Map<number, string>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isFenceDelimiter(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const matched = matchUrl(line.trim());
    if (!matched) continue;

    const prevLine = lines[i - 1];
    const nextLine = lines[i + 1];
    const isolatedBefore = i === 0 || prevLine === "";
    const isolatedAfter = i === lines.length - 1 || nextLine === "";
    if (isolatedBefore && isolatedAfter) {
      result.set(i, matched);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/isolated-url.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Refactor `tweet-archive.ts` to use the shared helper**

In `src/lib/tweet-archive.ts`, replace the top of the file (from the `TWEET_URL_LINE_RE` declaration through `findIsolatedTweetUrlLines`'s closing brace) with:

```ts
import { findIsolatedUrlLines } from "./isolated-url";

export const TWEET_URL_LINE_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)(?:\?\S*)?\/?$/;

export function findIsolatedTweetUrlLines(source: string): Map<number, string> {
  return findIsolatedUrlLines(source, (line) => TWEET_URL_LINE_RE.exec(line)?.[1] ?? null);
}

export function extractTweetIds(source: string): string[] {
  return [...new Set(findIsolatedTweetUrlLines(source).values())];
}
```

Delete the old `isFenceDelimiter` function and the old body of `findIsolatedTweetUrlLines` (the manual line-by-line loop) — they're now superseded by `isolated-url.ts`. Everything else in `tweet-archive.ts` (from `ParsedTweet` onward) stays exactly as-is. Note the existing `import { prisma } from "~/lib/db";` and `import { optimizeImage, videoToGif } from "./tweet-media";` lines further down in the file are unrelated and must stay where they are — only add the new `import { findIsolatedUrlLines } from "./isolated-url";` at the top.

- [ ] **Step 6: Run the full existing tweet-archive test suite to verify no regressions**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: PASS — all pre-existing tests (including the 8 `extractTweetIds` tests covering bare-URL, host variants, inline-prose exclusion, markdown-link exclusion, dedup, query strings, non-isolated exclusion, and fenced-code exclusion) still pass unchanged, proving the refactor preserved behavior exactly.

- [ ] **Step 7: Typecheck and full suite**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: zero type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/isolated-url.ts src/lib/isolated-url.test.ts src/lib/tweet-archive.ts
git commit -m "refactor: extract shared line-isolation helper for tweet and bookmark detection"
```

---

### Task 3: Bookmark URL detection

**Files:**
- Create: `src/lib/bookmark-archive.ts`
- Test: `src/lib/bookmark-archive.test.ts`

**Interfaces:**
- Consumes: `findIsolatedUrlLines` (`./isolated-url`, Task 2), `TWEET_URL_LINE_RE` (`./tweet-archive`, existing).
- Produces: `findIsolatedBookmarkUrlLines(source: string): Map<number, string>` (value is the matched URL itself). `extractBookmarkUrls(source: string): string[]` — deduped list of bookmark-eligible URLs found on their own isolated line.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bookmark-archive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractBookmarkUrls, findIsolatedBookmarkUrlLines } from "./bookmark-archive";

describe("findIsolatedBookmarkUrlLines / extractBookmarkUrls", () => {
  it("matches a bare non-tweet URL alone on its own paragraph", () => {
    const source = "Some text\n\nhttps://example.com/article\n\nMore text";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/article"]);
  });

  it("excludes a tweet-shaped URL — that goes through the tweet pipeline instead", () => {
    const source = "https://x.com/someuser/status/1234567890";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("excludes a twitter.com-hosted status URL too", () => {
    const source = "https://twitter.com/someuser/status/42";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("matches a non-status x.com URL (e.g. a profile link) as a bookmark", () => {
    const source = "https://x.com/someuser";
    expect(extractBookmarkUrls(source)).toEqual(["https://x.com/someuser"]);
  });

  it("ignores the URL when it's inline prose", () => {
    const source = "Check this out: https://example.com/article it's great";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("ignores the URL when written as a markdown link", () => {
    const source = "[an article](https://example.com/article)";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("does not match a URL that isn't isolated by blank lines", () => {
    const source = "Check this out:\nhttps://example.com/article\nThanks!";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("does not match a URL inside a fenced code block", () => {
    const source = "```\nhttps://example.com/article\n```";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("dedupes repeated URLs", () => {
    const source = "https://example.com/a\n\nhttps://example.com/a";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/a"]);
  });

  it("a document with both a tweet URL and a bookmark URL matches only the bookmark one here", () => {
    const source = "https://x.com/someuser/status/1\n\nhttps://example.com/article";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/article"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: FAIL — `Failed to resolve import "./bookmark-archive"`.

- [ ] **Step 3: Implement the detection functions**

Create `src/lib/bookmark-archive.ts`:

```ts
import { findIsolatedUrlLines } from "./isolated-url";
import { TWEET_URL_LINE_RE } from "./tweet-archive";

const BARE_URL_RE = /^https?:\/\/\S+$/;

export function findIsolatedBookmarkUrlLines(source: string): Map<number, string> {
  return findIsolatedUrlLines(source, (line) => {
    if (TWEET_URL_LINE_RE.test(line)) return null;
    return BARE_URL_RE.test(line) ? line : null;
  });
}

export function extractBookmarkUrls(source: string): string[] {
  return [...new Set(findIsolatedBookmarkUrlLines(source).values())];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bookmark-archive.ts src/lib/bookmark-archive.test.ts
git commit -m "feat: detect bare non-tweet URLs isolated on their own paragraph"
```

---

### Task 4: SSRF guard — `isPrivateIp` + `assertPublicUrl`

**Files:**
- Modify: `src/lib/bookmark-archive.ts`
- Test: `src/lib/bookmark-archive.test.ts`

**Interfaces:**
- Produces: `isPrivateIp(ip: string): boolean` — pure, given a raw IPv4 or IPv6 address string, returns whether it's in a private/loopback/link-local range. `assertPublicUrl(url: string): Promise<void>` — throws if the URL's scheme isn't `http:`/`https:`, or if its hostname resolves (via DNS) to a private IP; resolves silently otherwise.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/bookmark-archive.test.ts` (mock goes at the very top of the file, before other imports run — add it right after the existing `import` line):

```ts
import { vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
```

Then append these test suites at the end of the file:

```ts
import { lookup } from "node:dns/promises";
import { assertPublicUrl, isPrivateIp } from "./bookmark-archive";

describe("isPrivateIp", () => {
  it.each([
    ["10.0.0.1", true],
    ["172.16.5.5", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.1.1", true],
    ["0.0.0.5", true],
    ["8.8.8.8", false],
    ["93.184.216.34", false],
    ["::1", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["2001:4860:4860::8888", false],
    ["::ffff:10.0.0.1", true],
    ["::ffff:8.8.8.8", false],
  ])("isPrivateIp(%s) === %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("assertPublicUrl", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it("rejects a hostname that resolves to a private IP", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.5", family: 4 });
    await expect(assertPublicUrl("http://internal.example.com/")).rejects.toThrow();
  });

  it("resolves silently for a hostname that resolves to a public IP", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
    await expect(assertPublicUrl("http://example.com/")).resolves.toBeUndefined();
  });

  it("rejects a non-http(s) protocol without ever resolving DNS", async () => {
    await expect(assertPublicUrl("ftp://example.com/")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
});
```

Also add `beforeEach` to the existing `import { describe, expect, it } from "vitest";` line at the top of the file (change it to `import { beforeEach, describe, expect, it, vi } from "vitest";` — merge with the `vi` already needed for the mock above).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: FAIL — `isPrivateIp`/`assertPublicUrl` not exported.

- [ ] **Step 3: Implement the SSRF guard**

Append to `src/lib/bookmark-archive.ts` (add the `dns/promises` import at the top alongside the existing imports):

```ts
import { lookup } from "node:dns/promises";
```

```ts
function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const long = ipv4ToLong(ip);
  if (long === null) return true;
  const inRange = (base: string, bits: number) => {
    const baseLong = ipv4ToLong(base);
    if (baseLong === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (long & mask) === (baseLong & mask);
  };
  return (
    inRange("10.0.0.0", 8) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.168.0.0", 16) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("0.0.0.0", 8)
  );
}

export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(":")) {
    if (lower === "::1") return true;
    if (lower.startsWith("::ffff:")) {
      return isPrivateIpv4(lower.slice("::ffff:".length));
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(lower)) return true;
    return false;
  }
  return isPrivateIpv4(lower);
}

export async function assertPublicUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${parsed.protocol}`);
  }
  const { address } = await lookup(parsed.hostname);
  if (isPrivateIp(address)) {
    throw new Error(`refusing to fetch private/internal address: ${address}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: PASS (30 tests total: 10 from Task 3 + 20 new — 17 `isPrivateIp.each` cases + 3 `assertPublicUrl` cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bookmark-archive.ts src/lib/bookmark-archive.test.ts
git commit -m "feat: add DNS-resolve-based SSRF guard for bookmark fetches"
```

---

### Task 5: Metadata parser — `parseBookmarkMetadata`

**Files:**
- Modify: `src/lib/bookmark-archive.ts`
- Test: `src/lib/bookmark-archive.test.ts`

**Interfaces:**
- Produces: `interface ParsedBookmark { title: string | null; description: string | null; imageUrl: string | null; faviconUrl: string | null }` and `parseBookmarkMetadata(html: string, pageUrl: string): ParsedBookmark` — pure, `cheerio`-based parser for `<title>`, `<meta name="description">` (falling back to `<meta property="og:description">`), `<meta property="og:image">`, and `<link rel="icon">`/`<link rel="shortcut icon">` (falling back to `/favicon.ico`); relative image/favicon URLs are resolved against `pageUrl`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/bookmark-archive.test.ts`:

```ts
import { parseBookmarkMetadata } from "./bookmark-archive";

describe("parseBookmarkMetadata", () => {
  it("parses full metadata", () => {
    const html = `<html><head>
      <title>Example Title</title>
      <meta name="description" content="Example description">
      <meta property="og:image" content="https://example.com/image.png">
      <link rel="icon" href="/favicon.png">
    </head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/page")).toEqual({
      title: "Example Title",
      description: "Example description",
      imageUrl: "https://example.com/image.png",
      faviconUrl: "https://example.com/favicon.png",
    });
  });

  it("falls back to og:description when a plain meta description is missing", () => {
    const html = `<html><head><title>T</title><meta property="og:description" content="OG desc"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/").description).toBe("OG desc");
  });

  it("resolves a relative image URL against the page URL", () => {
    const html = `<html><head><title>T</title><meta property="og:image" content="/img.png"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/blog/post").imageUrl).toBe(
      "https://example.com/img.png",
    );
  });

  it("falls back to /favicon.ico when no icon link is present", () => {
    const html = `<html><head><title>T</title></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/page").faviconUrl).toBe(
      "https://example.com/favicon.ico",
    );
  });

  it("returns null title/description/image when totally absent", () => {
    const html = `<html><head></head><body></body></html>`;
    const result = parseBookmarkMetadata(html, "https://example.com/");
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
  });

  it("falls back to shortcut icon when rel=icon is absent", () => {
    const html = `<html><head><title>T</title><link rel="shortcut icon" href="/s.ico"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/").faviconUrl).toBe(
      "https://example.com/s.ico",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: FAIL — `parseBookmarkMetadata` not exported.

- [ ] **Step 3: Implement the parser**

Append to `src/lib/bookmark-archive.ts` (add the `cheerio` import at the top alongside the existing imports):

```ts
import * as cheerio from "cheerio";
```

```ts
export interface ParsedBookmark {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

export function parseBookmarkMetadata(html: string, pageUrl: string): ParsedBookmark {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || null;
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const rawImage = $('meta[property="og:image"]').attr("content");
  const imageUrl = rawImage ? resolveUrl(rawImage, pageUrl) : null;
  const rawFavicon =
    $('link[rel="icon"]').attr("href") || $('link[rel="shortcut icon"]').attr("href");
  const faviconUrl = rawFavicon
    ? resolveUrl(rawFavicon, pageUrl)
    : resolveUrl("/favicon.ico", pageUrl);
  return { title, description, imageUrl, faviconUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: PASS (all tests from Tasks 3-5 combined)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bookmark-archive.ts src/lib/bookmark-archive.test.ts
git commit -m "feat: parse bookmark page metadata via cheerio"
```

---

### Task 6: `archiveBookmark` + `archiveBookmarksInContent`

**Files:**
- Modify: `src/lib/bookmark-archive.ts`
- Test: `src/lib/bookmark-archive.test.ts`

**Interfaces:**
- Consumes: `extractBookmarkUrls`, `assertPublicUrl`, `parseBookmarkMetadata` (this file, Tasks 3-5), `optimizeImage` (`./tweet-media`, existing), `prisma` (`~/lib/db`).
- Produces: `archiveBookmark(url: string): Promise<void>` — no-op if already cached; otherwise validates the URL, fetches the page, parses metadata, best-effort fetches+optimizes image/favicon (each independently — a failed image fetch must not prevent title/description from being archived), and writes a `Bookmark` row; swallows and logs all top-level errors. `archiveBookmarksInContent(source: string): Promise<void>` — runs `archiveBookmark` for every URL `extractBookmarkUrls` finds.

- [ ] **Step 1: Write the failing tests**

Append to the top of `src/lib/bookmark-archive.test.ts`, right after the `node:dns/promises` mock added in Task 4, add a second mock block:

```ts
vi.mock("~/lib/db", () => ({
  prisma: {
    bookmark: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("./tweet-media", () => ({
  optimizeImage: vi.fn(async () => ({ data: Buffer.from("img"), mimeType: "image/webp" })),
}));
```

Then append these test suites at the end of the file:

```ts
import { prisma } from "~/lib/db";
import { optimizeImage } from "./tweet-media";
import { archiveBookmark, archiveBookmarksInContent } from "./bookmark-archive";

const SAMPLE_HTML = `<html><head>
  <title>Example Page</title>
  <meta name="description" content="An example page">
  <meta property="og:image" content="https://example.com/image.png">
  <link rel="icon" href="https://example.com/favicon.png">
</head></html>`;

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer>; headers?: { get: (k: string) => string | null } }>) {
  let call = 0;
  return vi.fn(async () => {
    const res = responses[call];
    call++;
    return res as Response;
  });
}

describe("archiveBookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
  });

  it("skips the network entirely when already archived", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ url: "https://example.com/" } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await archiveBookmark("https://example.com/");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("fetches the page, optimizes image and favicon, and stores a new bookmark", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      mockFetchSequence([
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        },
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(4),
        },
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(4),
        },
      ]),
    );

    await archiveBookmark("https://example.com/");

    expect(optimizeImage).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://example.com/",
          title: "Example Page",
          description: "An example page",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("archives title/description even when the image fetch fails", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/") {
        return {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveBookmark("https://example.com/");

    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Example Page",
          description: "An example page",
          imageData: null,
          faviconData: null,
        }),
      }),
    );
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("falls back to the hostname as title when the page has no <title>", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode("<html><head></head></html>").buffer as ArrayBuffer,
      })) as unknown as typeof fetch,
    );

    await archiveBookmark("https://example.com/no-title");

    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "example.com" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("swallows a page fetch failure without throwing and without writing a row", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveBookmark("https://example.com/")).resolves.toBeUndefined();

    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("swallows a private-IP rejection without throwing and without writing a row", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.5", family: 4 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveBookmark("http://internal.example.com/")).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("archiveBookmarksInContent", () => {
  it("checks the cache for every bookmark URL found in the source", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ url: "cached" } as never);
    vi.stubGlobal("fetch", vi.fn());
    const source = "https://example.com/a\n\nsome text\n\nhttps://example.com/b";

    await archiveBookmarksInContent(source);

    expect(prisma.bookmark.findUnique).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: FAIL — `archiveBookmark`/`archiveBookmarksInContent` not exported.

- [ ] **Step 3: Implement the orchestration**

Append to `src/lib/bookmark-archive.ts` (add these imports at the top alongside the existing ones):

```ts
import { prisma } from "~/lib/db";
import { optimizeImage } from "./tweet-media";
```

```ts
const MAX_BOOKMARK_FETCH_BYTES = 5 * 1024 * 1024; // 5MB

async function fetchPublicBuffer(url: string): Promise<Buffer> {
  await assertPublicUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`failed to fetch (${res.status}): ${url}`);
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BOOKMARK_FETCH_BYTES) {
    throw new Error(`response too large (${contentLength} bytes): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function archiveBookmark(url: string): Promise<void> {
  try {
    const existing = await prisma.bookmark.findUnique({ where: { url } });
    if (existing) return;

    const html = (await fetchPublicBuffer(url)).toString("utf-8");
    const parsed = parseBookmarkMetadata(html, url);

    let imageData: Buffer<ArrayBuffer> | null = null;
    let imageMimeType: string | null = null;
    if (parsed.imageUrl) {
      try {
        const raw = await fetchPublicBuffer(parsed.imageUrl);
        const optimized = await optimizeImage(raw);
        imageData = optimized.data as Buffer<ArrayBuffer>;
        imageMimeType = optimized.mimeType;
      } catch (err) {
        console.error(`[bookmark-archive] failed to fetch/optimize image for ${url}:`, err);
      }
    }

    let faviconData: Buffer<ArrayBuffer> | null = null;
    let faviconMimeType: string | null = null;
    if (parsed.faviconUrl) {
      try {
        const raw = await fetchPublicBuffer(parsed.faviconUrl);
        const optimized = await optimizeImage(raw);
        faviconData = optimized.data as Buffer<ArrayBuffer>;
        faviconMimeType = optimized.mimeType;
      } catch (err) {
        console.error(`[bookmark-archive] failed to fetch/optimize favicon for ${url}:`, err);
      }
    }

    await prisma.bookmark.create({
      data: {
        url,
        title: parsed.title ?? new URL(url).hostname,
        description: parsed.description,
        imageData,
        imageMimeType,
        faviconData,
        faviconMimeType,
      },
    });
  } catch (err) {
    console.error(`[bookmark-archive] failed to archive bookmark ${url}:`, err);
  }
}

export async function archiveBookmarksInContent(source: string): Promise<void> {
  for (const url of extractBookmarkUrls(source)) {
    await archiveBookmark(url);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bookmark-archive.test.ts`
Expected: PASS (all tests from Tasks 3-6 combined)

- [ ] **Step 5: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bookmark-archive.ts src/lib/bookmark-archive.test.ts
git commit -m "feat: fetch, parse, and cache bookmark metadata in archiveBookmark"
```

---

### Task 7: Wire archiving into admin save handlers

**Files:**
- Modify: `src/routes/admin_.new.tsx`
- Modify: `src/routes/admin_.edit.$slug.tsx`

**Interfaces:**
- Consumes: `archiveBookmarksInContent(source: string): Promise<void>` from `~/lib/bookmark-archive` (Task 6).

- [ ] **Step 1: Call it from `createArticle`**

In `src/routes/admin_.new.tsx`, add the import alongside the existing `archiveTweetsInContent` import:

```ts
import { archiveBookmarksInContent } from "~/lib/bookmark-archive";
```

And add the call right after the existing `await archiveTweetsInContent(data.contentHtml);` line:

```ts
    await archiveTweetsInContent(data.contentHtml);
    await archiveBookmarksInContent(data.contentHtml);
    return { ok: true };
```

- [ ] **Step 2: Call it from `saveArticle`**

In `src/routes/admin_.edit.$slug.tsx`, add the same import and the same call right after its existing `await archiveTweetsInContent(data.contentHtml);` line (inside the `saveArticle` handler).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Log into `/admin`, create or edit an article, paste a real public URL with rich Open Graph metadata (e.g. a well-known news article or blog post) alone on its own line in the content, save. Confirm no error and the save completes.

Then check it landed in the DB: `npx prisma studio`, open the `Bookmark` table, confirm a row exists with the right `url`/`title`/`description`, and `imageData`/`faviconData` are populated if the page had them.

Also test the SSRF guard directly: paste `http://127.0.0.1/` or `http://10.0.0.1/` alone on its own line, save — confirm the save still succeeds (best-effort) and no `Bookmark` row was created for that URL (`npx prisma studio` again).

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin_.new.tsx src/routes/admin_.edit.\$slug.tsx
git commit -m "feat: archive bookmarks found in article content on save"
```

---

### Task 8: Render bookmark cards

**Files:**
- Modify: `src/lib/render-article.ts`
- Test: `src/lib/render-article.test.ts`

**Interfaces:**
- Consumes: `extractBookmarkUrls`, `findIsolatedBookmarkUrlLines` (`./bookmark-archive`, Task 3).
- Produces: `buildBookmarkCardHtml(bookmark: { url: string; title: string; description: string | null; imageData: Buffer | null; imageMimeType: string | null; faviconData: Buffer | null; faviconMimeType: string | null }): string`. `renderArticleContent`'s existing signature (`(source: string): Promise<string>`) is unchanged — bookmark handling is purely additive to its internals.

**Why the internal restructuring:** the current `renderArticleContent` has a single `if (tweetIds.length === 0) return html;` early exit. With two independent embed types, a document could have bookmarks but no tweets (or vice versa), so each type needs its own independent "skip the DB query if none found" guard rather than one combined early return.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/render-article.test.ts` — first, extend the existing `vi.mock("~/lib/db", ...)` block near the top of the file to also include `bookmark.findMany`:

```ts
vi.mock("~/lib/db", () => ({
  prisma: {
    tweet: {
      findMany: vi.fn(),
    },
    bookmark: {
      findMany: vi.fn(),
    },
  },
}));
```

(This replaces the existing mock block that only has `tweet.findMany` — merge, don't duplicate.)

Then append these test cases (add `buildBookmarkCardHtml` to the existing `import { buildTweetCardHtml, renderArticleContent } from "./render-article";` line):

```ts
describe("buildBookmarkCardHtml", () => {
  it("renders title, description, image, and favicon, all escaped, linking to the source", () => {
    const html = buildBookmarkCardHtml({
      url: "https://example.com/a\"b",
      title: "Example <Title>",
      description: "Some & description",
      imageData: Buffer.from("img"),
      imageMimeType: "image/webp",
      faviconData: Buffer.from("fav"),
      faviconMimeType: "image/webp",
    });
    expect(html).toContain("Example &lt;Title&gt;");
    expect(html).toContain("Some &amp; description");
    expect(html).toContain("data:image/webp;base64,");
    expect(html).toContain('href="https://example.com/a&quot;b"');
  });

  it("omits the description and image blocks when absent", () => {
    const html = buildBookmarkCardHtml({
      url: "https://example.com/",
      title: "Example",
      description: null,
      imageData: null,
      imageMimeType: null,
      faviconData: null,
      faviconMimeType: null,
    });
    expect(html).not.toContain("text-[--color-wiki-muted] text-sm");
    expect(html).not.toContain("w-full rounded mt-2");
  });
});

describe("renderArticleContent — bookmarks", () => {
  it("skips the bookmark DB lookup entirely when there are no bookmark URLs", async () => {
    const html = await renderArticleContent("# Just markdown\n\nno links here");
    expect(prisma.bookmark.findMany).not.toHaveBeenCalled();
    expect(html).toContain("<h1>Just markdown</h1>");
  });

  it("substitutes an archived bookmark URL for a rendered card", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      {
        url: "https://example.com/article",
        title: "Example Article",
        description: "A description",
        imageData: null,
        imageMimeType: null,
        faviconData: null,
        faviconMimeType: null,
        fetchedAt: new Date(),
      },
    ] as never);

    const html = await renderArticleContent(
      "Before\n\nhttps://example.com/article\n\nAfter",
    );

    expect(html).toContain("Example Article");
    expect(html).toContain("A description");
    expect(html).not.toContain("BOOKMARK_EMBED_PLACEHOLDER");
  });

  it("falls back to a plain escaped link when the bookmark was never archived", async () => {
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);

    const html = await renderArticleContent("https://example.com/unarchived");

    expect(html).toContain('href="https://example.com/unarchived"');
  });

  it("renders a tweet and a bookmark independently in the same document", async () => {
    vi.mocked(prisma.tweet.findMany).mockResolvedValue([
      {
        id: "1",
        authorName: "Some User",
        authorHandle: "someuser",
        text: "hi",
        sourceUrl: "https://x.com/someuser/status/1",
        videoUrl: null,
        fetchedAt: new Date(),
        media: [],
      },
    ] as never);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([
      {
        url: "https://example.com/article",
        title: "Example Article",
        description: null,
        imageData: null,
        imageMimeType: null,
        faviconData: null,
        faviconMimeType: null,
        fetchedAt: new Date(),
      },
    ] as never);

    const html = await renderArticleContent(
      "https://x.com/someuser/status/1\n\nhttps://example.com/article",
    );

    expect(html).toContain("Some User");
    expect(html).toContain("Example Article");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/render-article.test.ts`
Expected: FAIL — `buildBookmarkCardHtml` not exported / bookmark tests fail.

- [ ] **Step 3: Implement the changes**

Replace the full contents of `src/lib/render-article.ts` with:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db";
import { extractBookmarkUrls, findIsolatedBookmarkUrlLines } from "./bookmark-archive";
import { extractTweetIds, findIsolatedTweetUrlLines } from "./tweet-archive";
import { renderWikiHtml } from "./wiki-html";

function placeholderForTweet(tweetId: string): string {
  return `TWEET_EMBED_PLACEHOLDER_${tweetId}`;
}

function placeholderForBookmark(index: number): string {
  return `BOOKMARK_EMBED_PLACEHOLDER_${index}`;
}

function withPlaceholders(source: string, bookmarkUrlByIndex: string[]): string {
  const isolatedTweets = findIsolatedTweetUrlLines(source);
  const isolatedBookmarks = findIsolatedBookmarkUrlLines(source);
  return source
    .split("\n")
    .map((line, i) => {
      const tweetId = isolatedTweets.get(i);
      if (tweetId !== undefined) return placeholderForTweet(tweetId);
      const bookmarkUrl = isolatedBookmarks.get(i);
      if (bookmarkUrl !== undefined) {
        const index = bookmarkUrlByIndex.length;
        bookmarkUrlByIndex.push(bookmarkUrl);
        return placeholderForBookmark(index);
      }
      return line;
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildTweetCardHtml(
  tweet: {
    authorName: string;
    authorHandle: string;
    text: string;
    sourceUrl: string;
    videoUrl: string | null;
  },
  media: { kind: string; mimeType: string; data: Buffer }[],
): string {
  const mediaHtml = media
    .map((m) => {
      const src = `data:${escapeHtml(m.mimeType)};base64,${m.data.toString("base64")}`;
      if (tweet.videoUrl && m.kind === "gif") {
        return `<video src="${escapeHtml(tweet.videoUrl)}" controls class="w-full rounded mt-2" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"></video><img src="${src}" alt="" class="w-full rounded mt-2" style="display:none" />`;
      }
      return `<img src="${src}" alt="" class="w-full rounded mt-2" />`;
    })
    .join("");
  return `<blockquote class="tweet-embed border border-[--color-wiki-border] rounded p-3 my-3 max-w-md">
  <p class="font-semibold">${escapeHtml(tweet.authorName)} <span class="text-[--color-wiki-muted]">@${escapeHtml(tweet.authorHandle)}</span></p>
  <p class="mt-1 whitespace-pre-wrap">${escapeHtml(tweet.text)}</p>
  ${mediaHtml}
  <a href="${escapeHtml(tweet.sourceUrl)}" target="_blank" rel="noreferrer external" class="text-[--color-wiki-link] text-xs mt-2 inline-block">Ver en X</a>
</blockquote>`;
}

export function buildBookmarkCardHtml(bookmark: {
  url: string;
  title: string;
  description: string | null;
  imageData: Buffer | null;
  imageMimeType: string | null;
  faviconData: Buffer | null;
  faviconMimeType: string | null;
}): string {
  const faviconHtml =
    bookmark.faviconData && bookmark.faviconMimeType
      ? `<img src="data:${escapeHtml(bookmark.faviconMimeType)};base64,${bookmark.faviconData.toString("base64")}" alt="" class="w-4 h-4 inline-block mr-1 align-text-bottom" />`
      : "";
  const imageHtml =
    bookmark.imageData && bookmark.imageMimeType
      ? `<img src="data:${escapeHtml(bookmark.imageMimeType)};base64,${bookmark.imageData.toString("base64")}" alt="" class="w-full rounded mt-2" />`
      : "";
  const descriptionHtml = bookmark.description
    ? `<p class="mt-1 text-[--color-wiki-muted] text-sm">${escapeHtml(bookmark.description)}</p>`
    : "";
  return `<a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noreferrer external" class="bookmark-embed block border border-[--color-wiki-border] rounded p-3 my-3 max-w-md no-underline">
  <p class="font-semibold text-[--color-wiki-link]">${faviconHtml}${escapeHtml(bookmark.title)}</p>
  ${descriptionHtml}
  ${imageHtml}
</a>`;
}

export async function renderArticleContent(source: string): Promise<string> {
  const tweetIds = extractTweetIds(source);
  const bookmarkUrls = extractBookmarkUrls(source);
  const bookmarkUrlByIndex: string[] = [];
  const html = renderWikiHtml(withPlaceholders(source, bookmarkUrlByIndex));

  let tweets: Prisma.TweetGetPayload<{ include: { media: true } }>[] = [];
  if (tweetIds.length > 0) {
    try {
      tweets = await prisma.tweet.findMany({
        where: { id: { in: tweetIds } },
        include: { media: { orderBy: { order: "asc" } } },
      });
    } catch (err) {
      console.error(`[render-article] failed to load archived tweets:`, err);
    }
  }
  const tweetById = new Map(tweets.map((t) => [t.id, t]));

  let bookmarks: Awaited<ReturnType<typeof prisma.bookmark.findMany>> = [];
  if (bookmarkUrls.length > 0) {
    try {
      bookmarks = await prisma.bookmark.findMany({ where: { url: { in: bookmarkUrls } } });
    } catch (err) {
      console.error(`[render-article] failed to load archived bookmarks:`, err);
    }
  }
  const bookmarkByUrl = new Map(bookmarks.map((b) => [b.url, b]));

  let output = html.replace(/<p>TWEET_EMBED_PLACEHOLDER_(\d+)<\/p>/g, (_m, id: string) => {
    const tweet = tweetById.get(id);
    if (!tweet) {
      const fallbackUrl = `https://x.com/i/status/${id}`;
      return `<p><a href="${fallbackUrl}" target="_blank" rel="noreferrer external">${fallbackUrl}</a></p>`;
    }
    const media = tweet.media.map((m) => ({
      kind: m.kind,
      mimeType: m.mimeType,
      data: Buffer.from(m.data),
    }));
    return buildTweetCardHtml(tweet, media);
  });

  output = output.replace(/<p>BOOKMARK_EMBED_PLACEHOLDER_(\d+)<\/p>/g, (_m, idxStr: string) => {
    const url = bookmarkUrlByIndex[Number(idxStr)];
    if (!url) return _m;
    const bookmark = bookmarkByUrl.get(url);
    if (!bookmark) {
      return `<p><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer external">${escapeHtml(url)}</a></p>`;
    }
    return buildBookmarkCardHtml({
      url: bookmark.url,
      title: bookmark.title ?? bookmark.url,
      description: bookmark.description,
      imageData: bookmark.imageData ? Buffer.from(bookmark.imageData) : null,
      imageMimeType: bookmark.imageMimeType,
      faviconData: bookmark.faviconData ? Buffer.from(bookmark.faviconData) : null,
      faviconMimeType: bookmark.faviconMimeType,
    });
  });

  return output;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/render-article.test.ts`
Expected: PASS (all tweet tests unchanged + all new bookmark tests)

- [ ] **Step 5: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass, no type errors.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. Open the article you saved a bookmark URL into in Task 7 (`/article/<slug>`). Confirm the bookmark card renders (title, description, image if present) with no live network request to the linked site visible in the browser devtools Network tab (the `<img>` `src` values should be `data:` URIs). Confirm a tweet embed elsewhere on the same site still renders correctly (regression check).

- [ ] **Step 7: Commit**

```bash
git add src/lib/render-article.ts src/lib/render-article.test.ts
git commit -m "feat: render bookmark embeds alongside tweet embeds"
```
