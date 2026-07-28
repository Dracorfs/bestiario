import { useState } from "react";

export interface ArticleFormValues {
  slug: string;
  title: string;
  summary: string;
  contentHtml: string;
  published: boolean;
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
  const [published, setPublished] = useState(initial.published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSubmit({ slug, title, summary, contentHtml, published });
        } catch {
          setError(
            "No se pudo guardar el artículo. Puede que el slug ya exista o haya un problema de conexión. Intentá de nuevo.",
          );
        } finally {
          setSaving(false);
        }
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
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        <span className="text-sm font-semibold">Publicado</span>
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
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
