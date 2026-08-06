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
