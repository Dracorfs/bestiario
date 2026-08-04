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
