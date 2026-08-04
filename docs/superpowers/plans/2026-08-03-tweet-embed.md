# Tweet Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bare tweet URL alone on its own line in article Markdown renders as a self-hosted, static tweet card (text + optimized images/silent gif), archived into our own DB on article save so the site never depends on a live call to Twitter/X at view time.

**Architecture:** On article save, scan the content for bare `x.com`/`twitter.com` status-URL lines, fetch each via the unofficial syndication endpoint, optimize media (images via `sharp`, video via `fluent-ffmpeg`+`ffmpeg-static` transcoded to a silent gif), and cache everything in two new Prisma models (`Tweet`, `TweetMedia`). At render time (server-only, inside the article loader), swap each detected URL line for a placeholder before Markdown parsing, then substitute the placeholder for a static HTML card built from the cached DB row (or a plain link if never archived).

**Tech Stack:** TanStack Start (server fns), Prisma/Postgres, `marked` (existing), `sharp`, `ffmpeg-static` + `fluent-ffmpeg`, Vitest (new — no test runner exists in this repo yet).

## Global Constraints

- Only a URL that is the **entire content of its own line** triggers an embed — inline prose or `[text](url)` markdown links are never touched.
- Archiving is **best-effort**: any fetch/transcode/parse failure must be caught and logged, never thrown — it must not block the article save.
- Rendered embed is **fully static HTML** (media inlined as `data:` URIs) — no client JS, no `widgets.js`, no live call to Twitter/X at render time.
- Tweet data source is the **unofficial** `https://cdn.syndication.twimg.com/tweet-result?id=<id>` endpoint — no API key, no official API.
- GIF output must be **audio-stripped** (`-an`) and size-capped (fps/width limited).
- New runtime deps: `sharp`, `ffmpeg-static`, `fluent-ffmpeg` (+ `@types/fluent-ffmpeg` dev dep). New dev dep: `vitest` (+ `vite-tsconfig-paths` is already present, reuse it).

---

### Task 1: Prisma schema — `Tweet` + `TweetMedia`

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `Tweet { id, authorName, authorHandle, text, sourceUrl, fetchedAt, media }` and `TweetMedia { id, tweetId, tweet, kind, mimeType, data, order }`, available via `@prisma/client` as `prisma.tweet` / `prisma.tweetMedia` after `prisma generate`.

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma` (after the existing `ArticleCategory` model):

```prisma
model Tweet {
  id           String       @id
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
  kind     String
  mimeType String
  data     Bytes
  order    Int

  @@index([tweetId])
}
```

- [ ] **Step 2: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client` success message, no errors.

- [ ] **Step 3: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Tweet and TweetMedia models for archived tweet embeds"
```

---

### Task 2: Test runner setup + `extractTweetIds`

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDependency + `"test"` script)
- Create: `src/lib/tweet-archive.ts`
- Test: `src/lib/tweet-archive.test.ts`

**Interfaces:**
- Produces: `TWEET_URL_LINE_RE: RegExp` (matches a *trimmed, whole* line of the form `https://(x.com|twitter.com)/<handle>/status/<id>` with optional trailing `?query` and/or `/`, capture group 1 = numeric id). `extractTweetIds(source: string): string[]` — deduped list of ids found on their own line.

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, inside `"scripts"`, add:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/tweet-archive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractTweetIds } from "./tweet-archive";

describe("extractTweetIds", () => {
  it("matches a bare tweet URL alone on its own line", () => {
    const source =
      "Some text\n\nhttps://x.com/someuser/status/1234567890\n\nMore text";
    expect(extractTweetIds(source)).toEqual(["1234567890"]);
  });

  it("matches the twitter.com host too", () => {
    expect(extractTweetIds("https://twitter.com/someuser/status/42")).toEqual([
      "42",
    ]);
  });

  it("ignores the URL when it's inline prose", () => {
    const source =
      "Check this out: https://x.com/someuser/status/1234567890 it's great";
    expect(extractTweetIds(source)).toEqual([]);
  });

  it("ignores the URL when written as a markdown link", () => {
    const source = "[a tweet](https://x.com/someuser/status/1234567890)";
    expect(extractTweetIds(source)).toEqual([]);
  });

  it("dedupes repeated ids", () => {
    const source = "https://x.com/a/status/1\n\nhttps://x.com/b/status/1";
    expect(extractTweetIds(source)).toEqual(["1"]);
  });

  it("tolerates a trailing query string", () => {
    expect(extractTweetIds("https://x.com/someuser/status/99?s=20")).toEqual([
      "99",
    ]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: FAIL — `Failed to resolve import "./tweet-archive"` (file doesn't exist yet).

- [ ] **Step 6: Implement `extractTweetIds`**

Create `src/lib/tweet-archive.ts`:

```ts
export const TWEET_URL_LINE_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)(?:\?\S*)?\/?$/;

export function extractTweetIds(source: string): string[] {
  const ids = new Set<string>();
  for (const line of source.split("\n")) {
    const match = TWEET_URL_LINE_RE.exec(line.trim());
    if (match) ids.add(match[1]);
  }
  return [...ids];
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/tweet-archive.ts src/lib/tweet-archive.test.ts
git commit -m "feat: add vitest and extractTweetIds for bare tweet URL detection"
```

---

### Task 3: `parseSyndicationResponse`

**Files:**
- Modify: `src/lib/tweet-archive.ts`
- Test: `src/lib/tweet-archive.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface ParsedTweet { authorName: string; authorHandle: string; text: string; photos: string[]; videoUrl: string | null }` and `parseSyndicationResponse(json: unknown): ParsedTweet | null` — pure parser for the `cdn.syndication.twimg.com/tweet-result` JSON shape (`{ text, user: { name, screen_name }, photos?: [{url}], video?: { variants: [{type, src, bitrate}] } }`). Returns `null` if `text`/`user.name`/`user.screen_name` are missing.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tweet-archive.test.ts`:

```ts
import { parseSyndicationResponse } from "./tweet-archive";

describe("parseSyndicationResponse", () => {
  it("parses text, author, and photos", () => {
    const result = parseSyndicationResponse({
      text: "hello world",
      user: { name: "Some User", screen_name: "someuser" },
      photos: [{ url: "https://pbs.twimg.com/media/abc.jpg" }],
    });
    expect(result).toEqual({
      authorName: "Some User",
      authorHandle: "someuser",
      text: "hello world",
      photos: ["https://pbs.twimg.com/media/abc.jpg"],
      videoUrl: null,
    });
  });

  it("picks the highest-bitrate mp4 variant for video", () => {
    const result = parseSyndicationResponse({
      text: "watch this",
      user: { name: "Some User", screen_name: "someuser" },
      video: {
        variants: [
          { type: "video/mp4", src: "https://video.twimg.com/low.mp4", bitrate: 100 },
          { type: "application/x-mpegURL", src: "https://video.twimg.com/hls.m3u8" },
          { type: "video/mp4", src: "https://video.twimg.com/high.mp4", bitrate: 900 },
        ],
      },
    });
    expect(result?.videoUrl).toBe("https://video.twimg.com/high.mp4");
  });

  it("returns null when required fields are missing", () => {
    expect(parseSyndicationResponse({ text: "no user here" })).toBeNull();
    expect(parseSyndicationResponse(null)).toBeNull();
    expect(parseSyndicationResponse("not an object")).toBeNull();
  });

  it("defaults photos to [] and videoUrl to null when absent", () => {
    const result = parseSyndicationResponse({
      text: "plain tweet",
      user: { name: "Some User", screen_name: "someuser" },
    });
    expect(result).toEqual({
      authorName: "Some User",
      authorHandle: "someuser",
      text: "plain tweet",
      photos: [],
      videoUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: FAIL — `parseSyndicationResponse is not a function` / import error.

- [ ] **Step 3: Implement `parseSyndicationResponse`**

Append to `src/lib/tweet-archive.ts`:

```ts
export interface ParsedTweet {
  authorName: string;
  authorHandle: string;
  text: string;
  photos: string[];
  videoUrl: string | null;
}

export function parseSyndicationResponse(json: unknown): ParsedTweet | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const user = obj.user as Record<string, unknown> | undefined;
  const authorName = typeof user?.name === "string" ? user.name : null;
  const authorHandle =
    typeof user?.screen_name === "string" ? user.screen_name : null;
  const text = typeof obj.text === "string" ? obj.text : null;
  if (!authorName || !authorHandle || !text) return null;

  const photos: string[] = [];
  if (Array.isArray(obj.photos)) {
    for (const p of obj.photos) {
      const url = (p as Record<string, unknown> | null)?.url;
      if (typeof url === "string") photos.push(url);
    }
  }

  let videoUrl: string | null = null;
  const video = obj.video as Record<string, unknown> | undefined;
  if (video && Array.isArray(video.variants)) {
    const mp4Variants = (video.variants as Record<string, unknown>[]).filter(
      (v) => v.type === "video/mp4" && typeof v.src === "string",
    );
    mp4Variants.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
    videoUrl = (mp4Variants[0]?.src as string) ?? null;
  }

  return { authorName, authorHandle, text, photos, videoUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/tweet-archive.ts src/lib/tweet-archive.test.ts
git commit -m "feat: parse syndication endpoint response into ParsedTweet"
```

---

### Task 4: Media processing — `optimizeImage` + `videoToGif`

**Files:**
- Create: `src/lib/tweet-media.ts`
- Test: `src/lib/tweet-media.test.ts`

**Interfaces:**
- Produces: `optimizeImage(input: Buffer): Promise<{ data: Buffer; mimeType: string }>` (resizes to fit within 1200x1200, re-encodes as webp). `videoToGif(input: Buffer): Promise<{ data: Buffer; mimeType: string }>` (transcodes to an audio-stripped, 480px-wide, 10fps gif).

- [ ] **Step 1: Install media deps**

Run: `npm install sharp ffmpeg-static fluent-ffmpeg && npm install -D @types/fluent-ffmpeg`

- [ ] **Step 2: Write the failing tests**

Create `src/lib/tweet-media.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeImage, videoToGif } from "./tweet-media";

async function makeTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
}

async function makeTestMp4(): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "fixture-mp4-"));
  const outputPath = join(dir, "test.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input("testsrc=size=64x64:rate=10:duration=1")
      .inputOptions(["-f", "lavfi"])
      .outputOptions(["-t", "1", "-pix_fmt", "yuv420p"])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });
  const data = await readFile(outputPath);
  await rm(dir, { recursive: true, force: true });
  return data;
}

describe("optimizeImage", () => {
  it("resizes a large image down and re-encodes as webp", async () => {
    const input = await makeTestPng(2000, 2000);
    const { data, mimeType } = await optimizeImage(input);
    expect(mimeType).toBe("image/webp");
    expect(data.length).toBeLessThan(input.length);
    const meta = await sharp(data).metadata();
    expect(meta.width).toBeLessThanOrEqual(1200);
  });

  it("does not upscale a small image", async () => {
    const input = await makeTestPng(100, 100);
    const { data } = await optimizeImage(input);
    const meta = await sharp(data).metadata();
    expect(meta.width).toBe(100);
  });
}, 20_000);

describe("videoToGif", () => {
  it("transcodes a video into a gif", async () => {
    const input = await makeTestMp4();
    const { data, mimeType } = await videoToGif(input);
    expect(mimeType).toBe("image/gif");
    expect(data.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
}, 30_000);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/tweet-media.test.ts`
Expected: FAIL — `Failed to resolve import "./tweet-media"`.

- [ ] **Step 4: Implement `tweet-media.ts`**

Create `src/lib/tweet-media.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

export async function optimizeImage(
  input: Buffer,
): Promise<{ data: Buffer; mimeType: string }> {
  const data = await sharp(input)
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { data, mimeType: "image/webp" };
}

export async function videoToGif(
  input: Buffer,
): Promise<{ data: Buffer; mimeType: string }> {
  const dir = await mkdtemp(join(tmpdir(), "tweet-video-"));
  const inputPath = join(dir, `${randomUUID()}.mp4`);
  const outputPath = join(dir, `${randomUUID()}.gif`);
  try {
    await writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(["-an", "-vf", "fps=10,scale=480:-1:flags=lanczos"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
    const data = await readFile(outputPath);
    return { data, mimeType: "image/gif" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/tweet-media.test.ts`
Expected: PASS (3 tests). Note: the video test shells out to the bundled ffmpeg binary twice (fixture generation + transcode) — it's slower (~5-15s) than the rest of the suite, that's expected.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/tweet-media.ts src/lib/tweet-media.test.ts
git commit -m "feat: add sharp/ffmpeg-backed image and gif optimization"
```

---

### Task 5: `archiveTweet` + `archiveTweetsInContent`

**Files:**
- Modify: `src/lib/tweet-archive.ts`
- Test: `src/lib/tweet-archive.test.ts`

**Interfaces:**
- Consumes: `extractTweetIds`, `parseSyndicationResponse` (this file, Task 2/3), `optimizeImage`, `videoToGif` (`./tweet-media`, Task 4), `prisma` (`~/lib/db`).
- Produces: `archiveTweet(tweetId: string): Promise<void>` — no-op if already cached; otherwise fetches, processes media, and writes a `Tweet` + `TweetMedia[]` row; swallows and logs all errors. `archiveTweetsInContent(source: string): Promise<void>` — runs `archiveTweet` for every id `extractTweetIds` finds.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tweet-archive.test.ts` (mocks go at the top of the file, before other imports execute — add them right after the existing `import` statements):

```ts
import { beforeEach, vi } from "vitest";

vi.mock("~/lib/db", () => ({
  prisma: {
    tweet: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("./tweet-media", () => ({
  optimizeImage: vi.fn(async () => ({ data: Buffer.from("img"), mimeType: "image/webp" })),
  videoToGif: vi.fn(async () => ({ data: Buffer.from("gif"), mimeType: "image/gif" })),
}));
```

Then append the test suites (uses `archiveTweet`, `archiveTweetsInContent` — not yet implemented):

```ts
import { prisma } from "~/lib/db";
import { optimizeImage } from "./tweet-media";
import { archiveTweet, archiveTweetsInContent } from "./tweet-archive";

const SYNDICATION_FIXTURE = {
  text: "hello world",
  user: { name: "Some User", screen_name: "someuser" },
  photos: [{ url: "https://pbs.twimg.com/media/abc.jpg" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("archiveTweet", () => {
  it("skips the network entirely when already archived", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue({ id: "1" } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await archiveTweet("1");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.tweet.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("fetches, optimizes media, and stores a new tweet", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("cdn.syndication.twimg.com")) {
        return { ok: true, json: async () => SYNDICATION_FIXTURE } as Response;
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await archiveTweet("1234567890");

    expect(optimizeImage).toHaveBeenCalledTimes(1);
    expect(prisma.tweet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "1234567890",
          authorName: "Some User",
          authorHandle: "someuser",
          text: "hello world",
          media: { create: [expect.objectContaining({ kind: "image", order: 0 })] },
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("swallows fetch failures without throwing and without writing a row", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 }) as Response),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveTweet("999")).resolves.toBeUndefined();

    expect(prisma.tweet.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("archiveTweetsInContent", () => {
  it("checks the cache for every tweet id found in the source, deduped", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue({ id: "cached" } as never);
    vi.stubGlobal("fetch", vi.fn());
    const source = "https://x.com/a/status/1\n\nsome text\n\nhttps://x.com/b/status/2";

    await archiveTweetsInContent(source);

    expect(prisma.tweet.findUnique).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: FAIL — `archiveTweet is not a function` / import error.

- [ ] **Step 3: Implement `archiveTweet` + `archiveTweetsInContent`**

Append to `src/lib/tweet-archive.ts`:

```ts
import { prisma } from "~/lib/db";
import { optimizeImage, videoToGif } from "./tweet-media";

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch media (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function archiveTweet(tweetId: string): Promise<void> {
  const existing = await prisma.tweet.findUnique({ where: { id: tweetId } });
  if (existing) return;

  try {
    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`,
    );
    if (!res.ok) throw new Error(`syndication fetch failed (${res.status})`);
    const parsed = parseSyndicationResponse(await res.json());
    if (!parsed) throw new Error("unparseable syndication response");

    const media: { kind: string; mimeType: string; data: Buffer; order: number }[] =
      [];
    for (const [i, photoUrl] of parsed.photos.entries()) {
      const raw = await fetchBuffer(photoUrl);
      const { data, mimeType } = await optimizeImage(raw);
      media.push({ kind: "image", mimeType, data, order: i });
    }
    if (parsed.videoUrl) {
      const raw = await fetchBuffer(parsed.videoUrl);
      const { data, mimeType } = await videoToGif(raw);
      media.push({ kind: "gif", mimeType, data, order: media.length });
    }

    await prisma.tweet.create({
      data: {
        id: tweetId,
        authorName: parsed.authorName,
        authorHandle: parsed.authorHandle,
        text: parsed.text,
        sourceUrl: `https://x.com/${parsed.authorHandle}/status/${tweetId}`,
        media: { create: media },
      },
    });
  } catch (err) {
    console.error(`[tweet-archive] failed to archive tweet ${tweetId}:`, err);
  }
}

export async function archiveTweetsInContent(source: string): Promise<void> {
  for (const id of extractTweetIds(source)) {
    await archiveTweet(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tweet-archive.test.ts`
Expected: PASS (14 tests total)

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tweet-archive.ts src/lib/tweet-archive.test.ts
git commit -m "feat: fetch, process, and cache tweets in archiveTweet"
```

---

### Task 6: Wire archiving into admin save handlers

**Files:**
- Modify: `src/routes/admin_.new.tsx`
- Modify: `src/routes/admin_.edit.$slug.tsx`

**Interfaces:**
- Consumes: `archiveTweetsInContent(source: string): Promise<void>` from `~/lib/tweet-archive` (Task 5).

- [ ] **Step 1: Call it from `createArticle`**

In `src/routes/admin_.new.tsx`, add the import and call after the create succeeds:

```ts
import { archiveTweetsInContent } from "~/lib/tweet-archive";
```

```ts
  .handler(async ({ data }) => {
    await prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
      },
    });
    await archiveTweetsInContent(data.contentHtml);
    return { ok: true };
  });
```

- [ ] **Step 2: Call it from `saveArticle`**

In `src/routes/admin_.edit.$slug.tsx`, add the same import and call after the upsert:

```ts
import { archiveTweetsInContent } from "~/lib/tweet-archive";
```

```ts
  .handler(async ({ data }) => {
    await prisma.article.upsert({
      where: { slug: data.slug },
      create: {
        slug: data.slug,
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
      },
      update: {
        title: data.title,
        summary: data.summary,
        contentHtml: data.contentHtml,
        published: data.published,
      },
    });
    await archiveTweetsInContent(data.contentHtml);
    return { ok: true };
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Log into `/admin`, create or edit an article, paste a real tweet URL (e.g. one with a photo) alone on its own line in the content, save. Confirm no error and the save completes (archiving happens synchronously but shouldn't visibly hang beyond a couple seconds).

Then check it landed in the DB: `npx prisma studio`, open the `Tweet` table, confirm a row exists with the right `id`/`authorHandle`/`text`, and `TweetMedia` has at least one row for it.

Save the same article again without changing the tweet URL — confirm the save completes quickly (no re-fetch/re-processing) and the `fetchedAt` timestamp on the existing `Tweet` row is unchanged (cache hit, per `archiveTweet`'s early-return).

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin_.new.tsx src/routes/admin_.edit.$slug.tsx
git commit -m "feat: archive tweets found in article content on save"
```

---

### Task 7: `renderArticleContent` — placeholder substitution + tweet card

**Files:**
- Create: `src/lib/render-article.ts`
- Test: `src/lib/render-article.test.ts`

**Interfaces:**
- Consumes: `extractTweetIds`, `TWEET_URL_LINE_RE` (`./tweet-archive`, Task 2), `renderWikiHtml` (`./wiki-html`, existing), `prisma` (`~/lib/db`).
- Produces: `buildTweetCardHtml(tweet: { authorName: string; authorHandle: string; text: string; sourceUrl: string }, media: { kind: string; mimeType: string; data: Buffer }[]): string`. `renderArticleContent(source: string): Promise<string>` — the new single entry point article pages should call instead of `renderWikiHtml` directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/render-article.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/db", () => ({
  prisma: {
    tweet: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "~/lib/db";
import { buildTweetCardHtml, renderArticleContent } from "./render-article";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildTweetCardHtml", () => {
  it("renders author, text, media, and a link back to the source", () => {
    const html = buildTweetCardHtml(
      {
        authorName: "Ada <Lovelace>",
        authorHandle: "ada",
        text: "hello & welcome",
        sourceUrl: "https://x.com/ada/status/1",
      },
      [{ kind: "image", mimeType: "image/webp", data: Buffer.from("img") }],
    );
    expect(html).toContain("Ada &lt;Lovelace&gt;");
    expect(html).toContain("@ada");
    expect(html).toContain("hello &amp; welcome");
    expect(html).toContain("data:image/webp;base64,");
    expect(html).toContain('href="https://x.com/ada/status/1"');
  });
});

describe("renderArticleContent", () => {
  it("skips the DB lookup entirely when there are no tweet URLs", async () => {
    const html = await renderArticleContent("# Just markdown\n\nno tweets here");
    expect(prisma.tweet.findMany).not.toHaveBeenCalled();
    expect(html).toContain("<h1>Just markdown</h1>");
  });

  it("substitutes an archived tweet URL for a rendered card", async () => {
    vi.mocked(prisma.tweet.findMany).mockResolvedValue([
      {
        id: "1234567890",
        authorName: "Some User",
        authorHandle: "someuser",
        text: "hi",
        sourceUrl: "https://x.com/someuser/status/1234567890",
        fetchedAt: new Date(),
        media: [],
      },
    ] as never);

    const html = await renderArticleContent(
      "Before\n\nhttps://x.com/someuser/status/1234567890\n\nAfter",
    );

    expect(html).toContain("Some User");
    expect(html).toContain("@someuser");
    expect(html).not.toContain("TWEET_EMBED_PLACEHOLDER");
  });

  it("falls back to a plain link when the tweet was never archived", async () => {
    vi.mocked(prisma.tweet.findMany).mockResolvedValue([]);

    const html = await renderArticleContent(
      "https://x.com/someuser/status/999",
    );

    expect(html).toContain('href="https://x.com/i/status/999"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/render-article.test.ts`
Expected: FAIL — `Failed to resolve import "./render-article"`.

- [ ] **Step 3: Implement `render-article.ts`**

Create `src/lib/render-article.ts`:

```ts
import { prisma } from "~/lib/db";
import { extractTweetIds, TWEET_URL_LINE_RE } from "./tweet-archive";
import { renderWikiHtml } from "./wiki-html";

function placeholderFor(tweetId: string): string {
  return `TWEET_EMBED_PLACEHOLDER_${tweetId}`;
}

function withPlaceholders(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const match = TWEET_URL_LINE_RE.exec(line.trim());
      return match ? placeholderFor(match[1]) : line;
    })
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTweetCardHtml(
  tweet: { authorName: string; authorHandle: string; text: string; sourceUrl: string },
  media: { kind: string; mimeType: string; data: Buffer }[],
): string {
  const mediaHtml = media
    .map((m) => {
      const src = `data:${m.mimeType};base64,${m.data.toString("base64")}`;
      return `<img src="${src}" alt="" class="w-full rounded mt-2" />`;
    })
    .join("");
  return `<blockquote class="tweet-embed border border-[--color-wiki-border] rounded p-3 my-3 max-w-md">
  <p class="font-semibold">${escapeHtml(tweet.authorName)} <span class="text-[--color-wiki-muted]">@${escapeHtml(tweet.authorHandle)}</span></p>
  <p class="mt-1 whitespace-pre-wrap">${escapeHtml(tweet.text)}</p>
  ${mediaHtml}
  <a href="${tweet.sourceUrl}" target="_blank" rel="noreferrer external" class="text-[--color-wiki-link] text-xs mt-2 inline-block">Ver en X</a>
</blockquote>`;
}

export async function renderArticleContent(source: string): Promise<string> {
  const tweetIds = extractTweetIds(source);
  const html = renderWikiHtml(withPlaceholders(source));
  if (tweetIds.length === 0) return html;

  const tweets = await prisma.tweet.findMany({
    where: { id: { in: tweetIds } },
    include: { media: { orderBy: { order: "asc" } } },
  });
  const tweetById = new Map(tweets.map((t) => [t.id, t]));

  return html.replace(/<p>TWEET_EMBED_PLACEHOLDER_(\d+)<\/p>/g, (_m, id: string) => {
    const tweet = tweetById.get(id);
    if (!tweet) {
      const fallbackUrl = `https://x.com/i/status/${id}`;
      return `<p><a href="${fallbackUrl}" target="_blank" rel="noreferrer external">${fallbackUrl}</a></p>`;
    }
    return buildTweetCardHtml(tweet, tweet.media);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/render-article.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/render-article.ts src/lib/render-article.test.ts
git commit -m "feat: render article content with archived tweet cards"
```

---

### Task 8: Move rendering server-side into the article loader

**Files:**
- Modify: `src/routes/article.$slug.tsx`

**Interfaces:**
- Consumes: `renderArticleContent(source: string): Promise<string>` from `~/lib/render-article` (Task 7).

**Why this task exists:** `renderWikiHtml` is currently called inside the `ArticlePage` component body, which runs on both server and client. `renderArticleContent` needs Prisma (server-only), so the call must move into the `getArticle` loader (already a `createServerFn`, server-only).

- [ ] **Step 1: Update the loader to pre-render HTML**

In `src/routes/article.$slug.tsx`, replace the import and the `getArticle` handler:

```ts
import { renderArticleContent } from "~/lib/render-article";
```

(remove the old `import { renderWikiHtml } from "~/lib/wiki-html";`)

```ts
const getArticle = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const article = await prisma.article.findUnique({
      where: { slug },
      include: {
        categories: { include: { category: true } },
      },
    });
    if (!article) return null;
    const html = await renderArticleContent(article.contentHtml);
    return { ...article, html };
  });
```

- [ ] **Step 2: Update the component to use the pre-rendered HTML**

In `ArticlePage`, replace:

```ts
  const article = Route.useLoaderData();
  const html = renderWikiHtml(article.contentHtml);
```

with:

```ts
  const article = Route.useLoaderData();
```

And change `<div dangerouslySetInnerHTML={{ __html: html }} />` to `<div dangerouslySetInnerHTML={{ __html: article.html }} />`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Open the article you saved a tweet URL into in Task 6 (`/article/<slug>`). Confirm:
- The tweet card renders (author, text, image) with no visible network request to Twitter/X in the browser devtools Network tab (view source / inspect — the `<img>` `src` should be a `data:` URI).
- Create a second article with a tweet URL you *don't* archive first (or use one you know will fail, e.g. a bogus numeric id) — confirm it renders as a plain clickable link instead of a broken card, and the page still loads fine.

- [ ] **Step 5: Commit**

```bash
git add src/routes/article.$slug.tsx
git commit -m "feat: render tweet embeds server-side in the article loader"
```
