import { useRef, useState } from "react";
import { ARTICLE_KINDS, kindLabel, type ArticleKind } from "~/lib/kind";
import { categorySlug, normalizeCategoryNames } from "~/lib/categories";

export interface ArticleFormValues {
  slug: string;
  title: string;
  kind: ArticleKind;
  summary: string;
  contentHtml: string;
  published: boolean;
  pictureBase64: string | null;
  /** Category names. Unknown ones are created on save. */
  categories: string[];
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
  availableCategories,
  onSubmit,
  submitLabel,
}: {
  initial: ArticleFormValues;
  slugEditable: boolean;
  availableCategories: Array<{ slug: string; name: string }>;
  onSubmit: (values: ArticleFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(!slugEditable || initial.slug !== "");
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState<ArticleKind>(initial.kind);
  const [summary, setSummary] = useState(initial.summary);
  const [contentHtml, setContentHtml] = useState(initial.contentHtml);
  const [published, setPublished] = useState(initial.published);
  const [pictureBase64, setPictureBase64] = useState<string | null>(initial.pictureBase64);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  const selectedSlugs = new Set(categories.map(categorySlug));
  // Existing categories plus any new name typed in this session, so a name
  // added and then unticked stays visible instead of vanishing from the list.
  const options = normalizeCategoryNames([
    ...availableCategories.map((c) => c.name),
    ...categories,
  ]);

  function addNewCategory() {
    const name = newCategory.trim();
    if (!name || !categorySlug(name)) return;
    setCategories((current) => normalizeCategoryNames([...current, name]));
    setNewCategory("");
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSubmit({
            slug,
            title,
            kind,
            summary,
            contentHtml,
            published,
            pictureBase64,
            categories,
          });
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
            className="block w-full border border-(--color-wiki-border) p-1 bg-white font-mono text-sm"
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
          className="block w-full border border-(--color-wiki-border) p-1 bg-white"
        />
      </label>
      <fieldset className="block">
        <legend className="text-sm font-semibold">Tipo</legend>
        <div className="mt-1 inline-flex border border-(--color-wiki-border)">
          {ARTICLE_KINDS.map((k) => (
            <label
              key={k}
              className={`px-3 py-1 text-sm cursor-pointer border-r border-(--color-wiki-border) last:border-r-0 ${
                kind === k
                  ? "bg-(--color-wiki-sidebar) font-semibold"
                  : "bg-white hover:bg-(--color-wiki-sidebar)"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="sr-only"
              />
              {kindLabel(k)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold">Resumen</span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="block w-full border border-(--color-wiki-border) p-1 bg-white"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold">Imagen de presentación</span>
        {pictureBase64 && (
          <div className="mt-1">
            <img
              src={pictureBase64}
              alt="Vista previa"
              className="max-w-xs border border-(--color-wiki-border)"
            />
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => pictureInputRef.current?.click()}
            className="border border-(--color-wiki-border) px-3 py-1 text-sm bg-(--color-wiki-sidebar) hover:bg-white"
          >
            {pictureBase64 ? "Cambiar imagen" : "Subir imagen"}
          </button>
          {pictureBase64 && (
            <button
              type="button"
              onClick={() => setPictureBase64(null)}
              className="border border-(--color-wiki-link-red) text-(--color-wiki-link-red) px-3 py-1 text-sm hover:bg-(--color-wiki-link-red) hover:text-white"
            >
              Quitar imagen
            </button>
          )}
          <input
            ref={pictureInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                setError("La imagen es demasiado grande (máximo 10 MB).");
                e.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setPictureBase64(reader.result as string);
              };
              reader.readAsDataURL(file);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      </label>
      <fieldset className="block">
        <legend className="text-sm font-semibold">Categorías</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {options.map((name) => (
            <label key={categorySlug(name)} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={selectedSlugs.has(categorySlug(name))}
                onChange={(e) =>
                  setCategories((current) =>
                    e.target.checked
                      ? normalizeCategoryNames([...current, name])
                      : current.filter((c) => categorySlug(c) !== categorySlug(name)),
                  )
                }
              />
              {name}
            </label>
          ))}
          {options.length === 0 && (
            <span className="text-sm text-(--color-wiki-muted)">
              Todavía no hay categorías. Creá la primera abajo.
            </span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              // Enter inside the form would otherwise submit the article.
              if (e.key === "Enter") {
                e.preventDefault();
                addNewCategory();
              }
            }}
            placeholder="Nueva categoría"
            className="border border-(--color-wiki-border) p-1 bg-white text-sm"
          />
          <button
            type="button"
            onClick={addNewCategory}
            className="border border-(--color-wiki-border) px-3 py-1 text-sm bg-(--color-wiki-sidebar) hover:bg-white"
          >
            Agregar
          </button>
        </div>
      </fieldset>
      <label className="block">
        <span className="text-sm font-semibold">Contenido (Markdown)</span>
        <textarea
          value={contentHtml}
          onChange={(e) => setContentHtml(e.target.value)}
          rows={20}
          className="block w-full border border-(--color-wiki-border) p-2 font-mono text-sm bg-white"
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
        className="border border-(--color-wiki-border) px-4 py-1 bg-(--color-wiki-sidebar) hover:bg-white disabled:opacity-50"
      >
        {saving ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
