import { describe, expect, it } from "vitest";
import { extractTweetIds, parseSyndicationResponse } from "./tweet-archive";

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
});
