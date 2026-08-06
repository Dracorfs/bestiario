function isFenceDelimiter(line: string): boolean {
  return /^(```|~~~)/.test(line.trim());
}

/**
 * Line-index -> matchUrl's return value, for every line that is BOTH
 * matched by `matchUrl` and isolated as its own Markdown paragraph (blank
 * line or document boundary immediately before and after), outside any
 * fenced code block.
 */
export function findIsolatedUrlLines(
  source: string,
  matchUrl: (trimmedLine: string) => string | null,
): Map<number, string> {
  const lines = source.split("\n");
  const result = new Map<number, string>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isFenceDelimiter(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^( {4,}|\t)/.test(line)) continue;

    const matched = matchUrl(line.trim());
    if (!matched) continue;

    const prevLine = lines[i - 1];
    const nextLine = lines[i + 1];
    const isolatedBefore = i === 0 || prevLine === "";
    const isolatedAfter = i === lines.length - 1 || nextLine === "";
    if (isolatedBefore && isolatedAfter) {
      result.set(i, matched);
    }
  }
  return result;
}
