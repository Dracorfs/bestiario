export const TWEET_URL_LINE_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)(?:\?\S*)?\/?$/;

function isFenceDelimiter(line: string): boolean {
  return /^(```|~~~)/.test(line.trim());
}

/**
 * Line-index -> tweetId, for every line that is BOTH a bare tweet URL and
 * isolated as its own Markdown paragraph (blank line or document boundary
 * immediately before and after), outside any fenced code block.
 */
export function findIsolatedTweetUrlLines(source: string): Map<number, string> {
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

    const match = TWEET_URL_LINE_RE.exec(line.trim());
    const id = match?.[1];
    if (!id) continue;

    const prevLine = lines[i - 1];
    const nextLine = lines[i + 1];
    const isolatedBefore = i === 0 || prevLine === "";
    const isolatedAfter = i === lines.length - 1 || nextLine === "";
    if (isolatedBefore && isolatedAfter) {
      result.set(i, id);
    }
  }
  return result;
}

export function extractTweetIds(source: string): string[] {
  return [...new Set(findIsolatedTweetUrlLines(source).values())];
}

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
  if (authorName === null || authorHandle === null || text === null) return null;

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

import { prisma } from "~/lib/db";
import { optimizeImage, videoToGif } from "./tweet-media";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024; // 25MB

function assertTwimgUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".twimg.com")) {
    throw new Error(`refusing to fetch non-twimg media URL: ${url}`);
  }
}

async function fetchBuffer(url: string): Promise<Buffer> {
  assertTwimgUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`failed to fetch media (${res.status}): ${url}`);
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_MEDIA_BYTES) {
    throw new Error(`media too large (${contentLength} bytes): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function getSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export async function archiveTweet(tweetId: string): Promise<void> {
  try {
    const existing = await prisma.tweet.findUnique({ where: { id: tweetId } });
    if (existing) return;

    const res = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${getSyndicationToken(tweetId)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`syndication fetch failed (${res.status})`);
    const parsed = parseSyndicationResponse(await res.json());
    if (!parsed) throw new Error("unparseable syndication response");

    const media: {
      kind: string;
      mimeType: string;
      data: Buffer<ArrayBuffer>;
      order: number;
    }[] = [];
    for (const [i, photoUrl] of parsed.photos.entries()) {
      const raw = await fetchBuffer(photoUrl);
      const { data, mimeType } = await optimizeImage(raw);
      media.push({ kind: "image", mimeType, data: data as Buffer<ArrayBuffer>, order: i });
    }
    if (parsed.videoUrl) {
      const raw = await fetchBuffer(parsed.videoUrl);
      const { data, mimeType } = await videoToGif(raw);
      media.push({
        kind: "gif",
        mimeType,
        data: data as Buffer<ArrayBuffer>,
        order: media.length,
      });
    }

    await prisma.tweet.create({
      data: {
        id: tweetId,
        authorName: parsed.authorName,
        authorHandle: parsed.authorHandle,
        text: parsed.text,
        sourceUrl: `https://x.com/${parsed.authorHandle}/status/${tweetId}`,
        videoUrl: parsed.videoUrl,
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
