import type { Heading } from "~/lib/headings";

/**
 * Rendered as a <details> so it can be folded away on a phone, where it would
 * otherwise push the article down the screen. It ships open, which is what a
 * desktop reader wants, and sticks alongside the text there.
 */
export function TableOfContents({ headings }: { headings: Heading[] }) {
  return (
    <details
      open
      className="rounded-lg border border-(--color-border) bg-(--color-surface-alt) p-3 text-sm lg:sticky lg:top-4"
    >
      <summary className="cursor-pointer font-serif text-base">Contenido</summary>
      <ul className="mt-2 space-y-1 pl-0">
        {headings.map((h) => (
          <li
            key={h.id}
            // list-none on the item: .prose-entry ul sets a disc the TOC would
            // otherwise inherit.
            className={`list-none ${h.level === 3 ? "pl-3" : ""}`}
          >
            <a href={`#${h.id}`} className="text-(--color-link) hover:underline">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
