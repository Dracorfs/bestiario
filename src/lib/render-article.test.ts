import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { prisma } from "~/lib/db";
import { buildBookmarkCardHtml, buildTweetCardHtml, renderArticleContent } from "./render-article";

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
        videoUrl: null,
      },
      [{ kind: "image", mimeType: "image/webp", data: Buffer.from("img") }],
    );
    expect(html).toContain("Ada &lt;Lovelace&gt;");
    expect(html).toContain("@ada");
    expect(html).toContain("hello &amp; welcome");
    expect(html).toContain("data:image/webp;base64,");
    expect(html).toContain('href="https://x.com/ada/status/1"');
  });

  it("escapes a double-quote in sourceUrl so it cannot break out of the href attribute", () => {
    const maliciousUrl = 'https://x.com/i/status/1" onmouseover="alert(1)';
    const html = buildTweetCardHtml(
      {
        authorName: "Ada",
        authorHandle: "ada",
        text: "hello",
        sourceUrl: maliciousUrl,
        videoUrl: null,
      },
      [],
    );
    expect(html).not.toContain('href="https://x.com/i/status/1" onmouseover="alert(1)"');
    expect(html).toContain(
      'href="https://x.com/i/status/1&quot; onmouseover=&quot;alert(1)"',
    );
  });

  it("renders a live <video> with a hidden gif fallback when the tweet has a videoUrl", () => {
    const html = buildTweetCardHtml(
      {
        authorName: "Ada",
        authorHandle: "ada",
        text: "watch this",
        sourceUrl: "https://x.com/ada/status/1",
        videoUrl: "https://video.twimg.com/clip.mp4",
      },
      [{ kind: "gif", mimeType: "image/gif", data: Buffer.from("gif") }],
    );
    expect(html).toContain('<video');
    expect(html).toContain('src="https://video.twimg.com/clip.mp4"');
    expect(html).toContain("onerror=");
    expect(html).toContain('style="display:none"');
    expect(html).toContain("data:image/gif;base64,");
  });

  it("renders a plain image (no <video>) when the tweet has no videoUrl", () => {
    const html = buildTweetCardHtml(
      {
        authorName: "Ada",
        authorHandle: "ada",
        text: "just a photo",
        sourceUrl: "https://x.com/ada/status/1",
        videoUrl: null,
      },
      [{ kind: "image", mimeType: "image/webp", data: Buffer.from("img") }],
    );
    expect(html).not.toContain("<video");
    expect(html).not.toContain("onerror=");
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

  it("leaves a non-isolated tweet URL as plain rendered text, no leaked placeholder", async () => {
    vi.mocked(prisma.tweet.findMany).mockResolvedValue([]);

    const html = await renderArticleContent(
      "Check this out:\nhttps://x.com/someuser/status/5\nThanks!",
    );
    expect(html).not.toContain("TWEET_EMBED_PLACEHOLDER");
  });

  it("leaves a tweet URL inside a fenced code block untouched", async () => {
    vi.mocked(prisma.tweet.findMany).mockResolvedValue([]);

    const html = await renderArticleContent("```\nhttps://x.com/someuser/status/7\n```");
    expect(html).not.toContain("TWEET_EMBED_PLACEHOLDER");
    expect(html).toContain("https://x.com/someuser/status/7");
  });

  it("degrades to plain links for every tweet instead of throwing when the DB lookup fails", async () => {
    vi.mocked(prisma.tweet.findMany).mockRejectedValue(new Error("relation \"Tweet\" does not exist"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const html = await renderArticleContent(
      "https://x.com/someuser/status/111\n\nhttps://x.com/other/status/222",
    );

    expect(html).not.toContain("TWEET_EMBED_PLACEHOLDER");
    expect(html).toContain('href="https://x.com/i/status/111"');
    expect(html).toContain('href="https://x.com/i/status/222"');
    errSpy.mockRestore();
  });
});

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
