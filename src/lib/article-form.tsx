import { useState } from "react";

export interface ArticleFormValues {
  slug: string;
  title: string;
  summary: string;
  contentHtml: string;
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function ArticleForm({
  initial,
  slugEditable,
  onSubmit,
  submitLabel,
}: {
  initial: ArticleFormValues;
  slugEditable: boolean;
  onSubmit: (values: ArticleFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!slugEditable || initial.slug !== "");
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [contentHtml, setContentHtml] = useState(initial.contentHtml);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit({ slug, title, summary, contentHtml });
        setSaving(false);
      }}
    >
      {slugEditable && (
        <label className="block">
          <span className="text-sm font-semibold">Slug</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            required
            className="block w-full border border-[--color-wiki-border] p-1 bg-white font-mono text-sm"
          />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-semibold">Título</span>
        <input
          value={title}
          onChange={(e) => {
            const value = e.target.value;
            setTitle(value);
            if (slugEditable && !slugTouched) setSlug(slugify(value));
          }}
          required
          className="block w-full border border-[--color-wiki-border] p-1 bg-white"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Resumen</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="block w-full border border-[--color-wiki-border] p-1 bg-white"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Contenido (HTML)</span>
        <textarea
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          rows={20}
          className="block w-full border border-[--color-wiki-border] p-2 font-mono text-sm bg-white"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="border border-[--color-wiki-border] px-4 py-1 bg-[--color-wiki-sidebar] hover:bg-white disabled:opacity-50"
      >
        {saving ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
