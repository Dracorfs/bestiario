export const TWEET_URL_LINE_RE =
  /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)(?:\?\S*)?\/?$/;

export function extractTweetIds(source: string): string[] {
  const ids = new Set<string>();
  for (const line of source.split("\n")) {
    const match = TWEET_URL_LINE_RE.exec(line.trim());
    const id = match?.[1];
    if (id) ids.add(id);
  }
  return [...ids];
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
