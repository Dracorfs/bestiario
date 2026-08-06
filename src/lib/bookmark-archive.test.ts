import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("~/lib/db", () => ({
  prisma: {
    bookmark: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("./tweet-media", () => ({
  optimizeImage: vi.fn(async () => ({ data: Buffer.from("img"), mimeType: "image/webp" })),
}));

import { extractBookmarkUrls, findIsolatedBookmarkUrlLines } from "./bookmark-archive";

describe("findIsolatedBookmarkUrlLines / extractBookmarkUrls", () => {
  it("matches a bare non-tweet URL alone on its own paragraph", () => {
    const source = "Some text\n\nhttps://example.com/article\n\nMore text";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/article"]);
  });

  it("excludes a tweet-shaped URL — that goes through the tweet pipeline instead", () => {
    const source = "https://x.com/someuser/status/1234567890";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("excludes a twitter.com-hosted status URL too", () => {
    const source = "https://twitter.com/someuser/status/42";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("matches a non-status x.com URL (e.g. a profile link) as a bookmark", () => {
    const source = "https://x.com/someuser";
    expect(extractBookmarkUrls(source)).toEqual(["https://x.com/someuser"]);
  });

  it("ignores the URL when it's inline prose", () => {
    const source = "Check this out: https://example.com/article it's great";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("ignores the URL when written as a markdown link", () => {
    const source = "[an article](https://example.com/article)";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("does not match a URL that isn't isolated by blank lines", () => {
    const source = "Check this out:\nhttps://example.com/article\nThanks!";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("does not match a URL inside a fenced code block", () => {
    const source = "```\nhttps://example.com/article\n```";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });

  it("dedupes repeated URLs", () => {
    const source = "https://example.com/a\n\nhttps://example.com/a";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/a"]);
  });

  it("a document with both a tweet URL and a bookmark URL matches only the bookmark one here", () => {
    const source = "https://x.com/someuser/status/1\n\nhttps://example.com/article";
    expect(extractBookmarkUrls(source)).toEqual(["https://example.com/article"]);
  });

  it("does not match a URL indented by 4 spaces (Markdown indented code block)", () => {
    const source = "Some text\n\n    https://example.com/article\n\nMore text";
    expect(extractBookmarkUrls(source)).toEqual([]);
  });
});

import { lookup } from "node:dns/promises";
import { assertPublicUrl, isPrivateIp } from "./bookmark-archive";

describe("isPrivateIp", () => {
  it.each([
    ["10.0.0.1", true],
    ["172.16.5.5", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.1.1", true],
    ["0.0.0.5", true],
    ["8.8.8.8", false],
    ["93.184.216.34", false],
    ["::1", true],
    ["fe80::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["2001:4860:4860::8888", false],
    ["::ffff:10.0.0.1", true],
    ["::ffff:8.8.8.8", false],
    ["100.64.1.1", true],
    ["100.100.100.200", true],
    ["100.63.255.255", false],
    ["100.128.0.0", false],
    ["::", true],
    ["224.0.0.1", true],
    ["240.0.0.1", true],
    ["255.255.255.255", true],
    ["fec0::1", true],
  ])("isPrivateIp(%s) === %s", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("assertPublicUrl", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it("rejects a hostname that resolves to a private IP", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.5", family: 4 });
    await expect(assertPublicUrl("http://internal.example.com/")).rejects.toThrow();
  });

  it("resolves silently for a hostname that resolves to a public IP", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
    await expect(assertPublicUrl("http://example.com/")).resolves.toBeUndefined();
  });

  it("rejects a non-http(s) protocol without ever resolving DNS", async () => {
    await expect(assertPublicUrl("ftp://example.com/")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });
});

import { parseBookmarkMetadata } from "./bookmark-archive";

describe("parseBookmarkMetadata", () => {
  it("parses full metadata", () => {
    const html = `<html><head>
      <title>Example Title</title>
      <meta name="description" content="Example description">
      <meta property="og:image" content="https://example.com/image.png">
      <link rel="icon" href="/favicon.png">
    </head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/page")).toEqual({
      title: "Example Title",
      description: "Example description",
      imageUrl: "https://example.com/image.png",
      faviconUrl: "https://example.com/favicon.png",
    });
  });

  it("falls back to og:description when a plain meta description is missing", () => {
    const html = `<html><head><title>T</title><meta property="og:description" content="OG desc"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/").description).toBe("OG desc");
  });

  it("resolves a relative image URL against the page URL", () => {
    const html = `<html><head><title>T</title><meta property="og:image" content="/img.png"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/blog/post").imageUrl).toBe(
      "https://example.com/img.png",
    );
  });

  it("falls back to /favicon.ico when no icon link is present", () => {
    const html = `<html><head><title>T</title></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/page").faviconUrl).toBe(
      "https://example.com/favicon.ico",
    );
  });

  it("returns null title/description/image when totally absent", () => {
    const html = `<html><head></head><body></body></html>`;
    const result = parseBookmarkMetadata(html, "https://example.com/");
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.imageUrl).toBeNull();
  });

  it("falls back to shortcut icon when rel=icon is absent", () => {
    const html = `<html><head><title>T</title><link rel="shortcut icon" href="/s.ico"></head></html>`;
    expect(parseBookmarkMetadata(html, "https://example.com/").faviconUrl).toBe(
      "https://example.com/s.ico",
    );
  });
});

import { prisma } from "~/lib/db";
import { optimizeImage } from "./tweet-media";
import { archiveBookmark, archiveBookmarksInContent } from "./bookmark-archive";

const SAMPLE_HTML = `<html><head>
  <title>Example Page</title>
  <meta name="description" content="An example page">
  <meta property="og:image" content="https://example.com/image.png">
  <link rel="icon" href="https://example.com/favicon.png">
</head></html>`;

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer>; headers?: { get: (k: string) => string | null } }>) {
  let call = 0;
  return vi.fn(async () => {
    const res = responses[call];
    call++;
    return res as Response;
  });
}

describe("archiveBookmark", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
  });

  it("skips the network entirely when already archived", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ url: "https://example.com/" } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await archiveBookmark("https://example.com/");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("fetches the page, optimizes image and favicon, and stores a new bookmark", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      mockFetchSequence([
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        },
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(4),
        },
        {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(4),
        },
      ]),
    );

    await archiveBookmark("https://example.com/");

    expect(optimizeImage).toHaveBeenCalledTimes(2);
    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://example.com/",
          title: "Example Page",
          description: "An example page",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("archives title/description even when the image fetch fails", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://example.com/") {
        return {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveBookmark("https://example.com/");

    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Example Page",
          description: "An example page",
          imageData: null,
          faviconData: null,
        }),
      }),
    );
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("falls back to the hostname as title when the page has no <title>", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode("<html><head></head></html>").buffer as ArrayBuffer,
      })) as unknown as typeof fetch,
    );

    await archiveBookmark("https://example.com/no-title");

    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "example.com" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("swallows a page fetch failure without throwing and without writing a row", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveBookmark("https://example.com/")).resolves.toBeUndefined();

    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("swallows a private-IP rejection without throwing and without writing a row", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.5", family: 4 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveBookmark("http://internal.example.com/")).resolves.toBeUndefined();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("re-validates a redirect target and refuses to follow it to a private IP", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.mocked(lookup).mockImplementation(async (hostname: unknown) => {
      if (hostname === "internal.example.com") return { address: "169.254.169.254", family: 4 };
      return { address: "93.184.216.34", family: 4 };
    });
    const fetchMock = vi.fn(async () => ({
      status: 302,
      ok: false,
      headers: {
        get: (k: string) => (k.toLowerCase() === "location" ? "http://internal.example.com/secret" : null),
      },
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(archiveBookmark("https://example.com/")).resolves.toBeUndefined();

    // fetch is only ever called once: the redirect target must be rejected by
    // assertPublicUrl BEFORE a second network request is ever made.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.bookmark.create).not.toHaveBeenCalled();
    errSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("follows a redirect to a legitimate public host after re-validating it", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 });
    let pageFetchCount = 0;
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === "https://example.com/") {
        pageFetchCount++;
        return {
          status: 302,
          ok: false,
          headers: {
            get: (k: string) => (k.toLowerCase() === "location" ? "https://example.com/final" : null),
          },
        } as unknown as Response;
      }
      if (url === "https://example.com/final") {
        pageFetchCount++;
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        } as unknown as Response;
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(4),
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await archiveBookmark("https://example.com/");

    expect(pageFetchCount).toBe(2);
    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: "https://example.com/",
          title: "Example Page",
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("stores an ICO-format favicon raw with image/x-icon mime, skipping optimizeImage", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);
    const icoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(SAMPLE_HTML).buffer as ArrayBuffer,
        } as unknown as Response;
      }
      if (url === "https://example.com/image.png") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(4),
        } as unknown as Response;
      }
      if (url === "https://example.com/favicon.png") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => icoBytes.buffer,
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await archiveBookmark("https://example.com/");

    // only the image goes through optimizeImage; the favicon is stored raw
    expect(optimizeImage).toHaveBeenCalledTimes(1);
    expect(prisma.bookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          faviconMimeType: "image/x-icon",
          faviconData: Buffer.from(icoBytes),
        }),
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe("archiveBookmarksInContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks the cache for every bookmark URL found in the source", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ url: "cached" } as never);
    vi.stubGlobal("fetch", vi.fn());
    const source = "https://example.com/a\n\nsome text\n\nhttps://example.com/b";

    await archiveBookmarksInContent(source);

    expect(prisma.bookmark.findUnique).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("caps archiving at 20 bookmarks per save even when more are present in the source", async () => {
    vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({ url: "cached" } as never);
    vi.stubGlobal("fetch", vi.fn());
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/${i}`);
    const source = urls.join("\n\n");

    await archiveBookmarksInContent(source);

    expect(prisma.bookmark.findUnique).toHaveBeenCalledTimes(20);
    vi.unstubAllGlobals();
  });
});
