import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractTweetIds, getSyndicationToken, parseSyndicationResponse } from "./tweet-archive";

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

  it("does not match a tweet URL that isn't isolated by blank lines", () => {
    const source = "Check this out:\nhttps://x.com/someuser/status/5\nThanks!";
    expect(extractTweetIds(source)).toEqual([]);
  });

  it("does not match a tweet URL inside a fenced code block", () => {
    const source = "```\nhttps://x.com/someuser/status/7\n```";
    expect(extractTweetIds(source)).toEqual([]);
  });
});

describe("getSyndicationToken", () => {
  it("computes the token the syndication endpoint requires, for a real tweet id", () => {
    // Verified live: cdn.syndication.twimg.com/tweet-result?id=2084263129966342226
    // returns 200 {} without a token, and a full real payload with this exact token.
    expect(getSyndicationToken("2084263129966342226")).toBe("51vwlu2rzkm");
  });
});

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

  it("handles empty text (media-only tweet with no caption)", () => {
    const result = parseSyndicationResponse({
      text: "",
      user: { name: "Some User", screen_name: "someuser" },
      photos: [{ url: "https://pbs.twimg.com/media/xyz.jpg" }],
    });
    expect(result).toEqual({
      authorName: "Some User",
      authorHandle: "someuser",
      text: "",
      photos: ["https://pbs.twimg.com/media/xyz.jpg"],
      videoUrl: null,
    });
  });
});

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
      return {
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response;
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

  it("swallows a findUnique rejection without throwing and without writing a row", async () => {
    vi.mocked(prisma.tweet.findUnique).mockRejectedValue(new Error("db down"));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveTweet("42")).resolves.toBeUndefined();

    expect(prisma.tweet.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("stores the live video URL alongside the archived gif fallback", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("cdn.syndication.twimg.com")) {
        return {
          ok: true,
          json: async () => ({
            text: "watch this",
            user: { name: "Some User", screen_name: "someuser" },
            video: {
              variants: [
                { type: "video/mp4", src: "https://video.twimg.com/clip.mp4", bitrate: 900 },
              ],
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await archiveTweet("777");

    expect(prisma.tweet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          videoUrl: "https://video.twimg.com/clip.mp4",
          media: { create: [expect.objectContaining({ kind: "gif", order: 0 })] },
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("refuses to fetch media from a non-twimg host and fails the archive attempt closed", async () => {
    vi.mocked(prisma.tweet.findUnique).mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("cdn.syndication.twimg.com")) {
        return {
          ok: true,
          json: async () => ({
            text: "hello world",
            user: { name: "Some User", screen_name: "someuser" },
            photos: [{ url: "https://evil.example.com/x.jpg" }],
          }),
        } as Response;
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveTweet("555")).resolves.toBeUndefined();

    expect(optimizeImage).not.toHaveBeenCalled();
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
