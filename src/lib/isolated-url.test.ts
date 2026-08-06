import { describe, expect, it } from "vitest";
import { findIsolatedUrlLines } from "./isolated-url";

const matchDigits = (line: string): string | null => (/^\d+$/.test(line) ? line : null);

describe("findIsolatedUrlLines", () => {
  it("matches a value alone on its own paragraph", () => {
    const source = "Some text\n\n42\n\nMore text";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map([[2, "42"]]));
  });

  it("does not match a value that isn't isolated by blank lines", () => {
    const source = "Check this out:\n42\nThanks!";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map());
  });

  it("does not match a value inside a fenced code block", () => {
    const source = "```\n42\n```";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map());
  });

  it("matches at document start and end with no surrounding blank lines needed", () => {
    const source = "42";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(new Map([[0, "42"]]));
  });

  it("matches multiple isolated values independently", () => {
    const source = "1\n\n2";
    expect(findIsolatedUrlLines(source, matchDigits)).toEqual(
      new Map([
        [0, "1"],
        [2, "2"],
      ]),
    );
  });

  it("passes the matcher's return value through, not the raw line", () => {
    const source = "hello";
    expect(findIsolatedUrlLines(source, (line) => (line === "hello" ? "world" : null))).toEqual(
      new Map([[0, "world"]]),
    );
  });
});
