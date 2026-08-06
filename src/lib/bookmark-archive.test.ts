import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

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
