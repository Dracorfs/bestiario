import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render stored article content: Markdown, with raw HTML passed through
 * verbatim per CommonMark.
 */
export function renderWikiHtml(source: string): string {
  return marked.parse(source, { async: false });
}
