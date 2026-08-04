import { describe, expect, it } from "vitest";
import { extractTweetIds } from "./tweet-archive";

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
});
