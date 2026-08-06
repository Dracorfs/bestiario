import { describe, expect, it } from "vitest";
import { bufferToDataUrl, dataUrlToBuffer } from "./data-url";

describe("dataUrlToBuffer", () => {
  it("parses a base64 data URL into its buffer and mime type", () => {
    const dataUrl = `data:image/png;base64,${Buffer.from("hello").toString("base64")}`;
    const result = dataUrlToBuffer(dataUrl);
    expect(result.mimeType).toBe("image/png");
    expect(result.data.toString()).toBe("hello");
  });

  it("throws on a string that isn't a base64 data URL", () => {
    expect(() => dataUrlToBuffer("not a data url")).toThrow();
  });
});

describe("bufferToDataUrl", () => {
  it("encodes a buffer and mime type into a base64 data URL", () => {
    const result = bufferToDataUrl(Buffer.from("hello"), "image/png");
    expect(result).toBe(`data:image/png;base64,${Buffer.from("hello").toString("base64")}`);
  });
});

describe("round-trip", () => {
  it("bufferToDataUrl then dataUrlToBuffer returns the original bytes and mime type", () => {
    const original = Buffer.from([1, 2, 3, 255, 0]);
    const dataUrl = bufferToDataUrl(original, "image/webp");
    const result = dataUrlToBuffer(dataUrl);
    expect(result.data.equals(original)).toBe(true);
    expect(result.mimeType).toBe("image/webp");
  });
});
