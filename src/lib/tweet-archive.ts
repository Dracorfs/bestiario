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
