import { describe, expect, it } from "vitest";
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
