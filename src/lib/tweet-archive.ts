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
