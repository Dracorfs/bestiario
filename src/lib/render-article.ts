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
