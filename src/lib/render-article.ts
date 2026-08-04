import type { Prisma } from "@prisma/client";
import { prisma } from "~/lib/db";
import { extractTweetIds, findIsolatedTweetUrlLines } from "./tweet-archive";
import { renderWikiHtml } from "./wiki-html";

function placeholderFor(tweetId: string): string {
  return `TWEET_EMBED_PLACEHOLDER_${tweetId}`;
}

function withPlaceholders(source: string): string {
  const isolated = findIsolatedTweetUrlLines(source);
  return source
    .split("\n")
    .map((line, i) => {
      const id = isolated.get(i);
      return id !== undefined ? placeholderFor(id) : line;
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
        // Prefer the live Twitter-hosted video (with audio) — only the gif
        // is archived in our DB, so if the live URL ever dies, swap to it.
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

export async function renderArticleContent(source: string): Promise<string> {
  const tweetIds = extractTweetIds(source);
  const html = renderWikiHtml(withPlaceholders(source));
  if (tweetIds.length === 0) return html;

  let tweets: Prisma.TweetGetPayload<{ include: { media: true } }>[] = [];
  try {
    tweets = await prisma.tweet.findMany({
      where: { id: { in: tweetIds } },
      include: { media: { orderBy: { order: "asc" } } },
    });
  } catch (err) {
    console.error(`[render-article] failed to load archived tweets:`, err);
  }
  const tweetById = new Map(tweets.map((t) => [t.id, t]));

  return html.replace(/<p>TWEET_EMBED_PLACEHOLDER_(\d+)<\/p>/g, (_m, id: string) => {
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
}
