/**
 * Seed Bestiario. with a small set of Argentinian-politics articles
 * pulled from es.wikipedia.org. Content is licensed CC BY-SA 4.0;
 * we keep the source URL on each Article.
 *
 * Run: npm run seed   (requires DATABASE_URL in .env)
 */
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";

const prisma = new PrismaClient();

type SeedSpec = {
  /** es.wikipedia article title (URL-encoded form not needed) */
  wikiTitle: string;
  /** slug used inside Bestiario. — kebab-case ascii */
  slug: string;
  /** override display title (else use Wikipedia title) */
  title?: string;
  /** category slugs to attach */
  categories: string[];
};

const SEEDS: SeedSpec[] = [
  {
    wikiTitle: "Política_de_Argentina",
    slug: "politica-de-argentina",
    title: "Política de Argentina",
    categories: ["instituciones"],
  },
  {
    wikiTitle: "Juan_Domingo_Perón",
    slug: "juan-domingo-peron",
    title: "Juan Domingo Perón",
    categories: ["presidentes"],
  },
  {
    wikiTitle: "Néstor_Kirchner",
    slug: "nestor-kirchner",
    title: "Néstor Kirchner",
    categories: ["presidentes"],
  },
  {
    wikiTitle: "Cristina_Fernández_de_Kirchner",
    slug: "cristina-fernandez-de-kirchner",
    title: "Cristina Fernández de Kirchner",
    categories: ["presidentes"],
  },
  {
    wikiTitle: "Javier_Milei",
    slug: "javier-milei",
    title: "Javier Milei",
    categories: ["presidentes"],
  },
  {
    wikiTitle: "Mauricio_Macri",
    slug: "mauricio-macri",
    title: "Mauricio Macri",
    categories: ["presidentes"],
  },
  {
    wikiTitle: "Partido_Justicialista",
    slug: "partido-justicialista",
    title: "Partido Justicialista",
    categories: ["partidos-politicos"],
  },
  {
    wikiTitle: "La_Libertad_Avanza",
    slug: "la-libertad-avanza",
    title: "La Libertad Avanza",
    categories: ["partidos-politicos"],
  },
  {
    wikiTitle: "Casa_Rosada",
    slug: "casa-rosada",
    title: "Casa Rosada",
    categories: ["instituciones"],
  },
  {
    wikiTitle: "Congreso_de_la_Nación_Argentina",
    slug: "congreso-de-la-nacion-argentina",
    title: "Congreso de la Nación Argentina",
    categories: ["instituciones"],
  },
];

const CATEGORIES: Record<string, { name: string; description: string }> = {
  presidentes: {
    name: "Presidentes",
    description: "Jefes de Estado de la República Argentina.",
  },
  "partidos-politicos": {
    name: "Partidos políticos",
    description: "Agrupaciones políticas argentinas activas e históricas.",
  },
  instituciones: {
    name: "Instituciones",
    description: "Órganos del Estado y sedes del poder público.",
  },
};

const TITLE_TO_SLUG: Record<string, string> = Object.fromEntries(
  SEEDS.map((s) => [safeDecode(s.wikiTitle).replace(/_/g, " "), s.slug]),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, label: string, attempts = 4): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "Bestiario-Seeder/0.1 (contact: bestiario)" },
    });
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const wait = 1500 * (i + 1) ** 2;
      console.warn(`  ${label} ${res.status}, retry in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${label}: ${res.status}`);
  }
  throw new Error(`${label}: exhausted retries`);
}

async function fetchSummary(wikiTitle: string) {
  const res = await fetchWithRetry(
    `https://es.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`,
    `summary ${wikiTitle}`,
  );
  return (await res.json()) as {
    title: string;
    extract?: string;
    extract_html?: string;
    content_urls?: { desktop?: { page?: string } };
  };
}

async function fetchHtml(wikiTitle: string): Promise<string> {
  const res = await fetchWithRetry(
    `https://es.wikipedia.org/api/rest_v1/page/html/${wikiTitle}`,
    `html ${wikiTitle}`,
  );
  return await res.text();
}

function safeDecode(s: string): string {
  try {
    return safeDecode(s);
  } catch {
    return s;
  }
}

/**
 * Strip noise from the Wikipedia parsoid HTML and rewrite internal links.
 * Returns { contentHtml, infobox }.
 */
function normalize(html: string): { contentHtml: string; infobox: Record<string, string> | null } {
  const $ = cheerio.load(html);

  // Drop noise: edit sections, references, navboxes, message boxes, scripts/styles.
  $(
    [
      "script",
      "style",
      ".mw-editsection",
      ".mbox-text",
      ".ambox",
      ".navbox",
      ".reference",
      ".reflist",
      ".noprint",
      ".metadata",
      ".error",
      "table.infobox",
      "figure",
      "img",
      "sup.reference",
      "sup.noprint",
      ".sistersitebox",
      ".thumb",
      ".gallery",
    ].join(","),
  ).remove();

  // Extract infobox (we removed the table above — re-parse to capture first).
  const $orig = cheerio.load(html);
  const infobox: Record<string, string> = {};
  $orig("table.infobox tr").each((_, tr) => {
    const $tr = $orig(tr);
    const k = $tr.find("th").first().text().trim();
    const v = $tr.find("td").first().text().trim();
    if (k && v && k.length < 60 && v.length < 200) infobox[k] = v;
  });

  // Rewrite internal links: <a rel="mw:WikiLink" href="./Foo"> → data-internal="slug" if seeded, else red link.
  $("a").each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href") ?? "";
    const rel = $a.attr("rel") ?? "";
    const isInternal = rel.includes("mw:WikiLink") || href.startsWith("./");
    if (!isInternal) {
      // External: rewrite root-relative ./ → absolute es.wikipedia.
      if (href.startsWith("./")) {
        $a.attr("href", `https://es.wikipedia.org/wiki/${href.slice(2)}`);
      }
      $a.attr("target", "_blank");
      $a.attr("rel", "noreferrer external");
      return;
    }
    const wikiTitle = safeDecode(href.replace(/^\.\//, "")).replace(
      /_/g,
      " ",
    );
    const slug = TITLE_TO_SLUG[wikiTitle];
    if (slug) {
      $a.attr("data-internal", slug);
      $a.removeAttr("href");
      $a.removeAttr("rel");
      $a.removeAttr("title");
    } else {
      // No article yet: turn into red link to /edit/<derived-slug>.
      const derived = wikiTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      $a.attr("href", `/edit/${derived}`);
      $a.attr("class", "red");
      $a.removeAttr("rel");
    }
  });

  // Drop everything after first References/Bibliography heading.
  $('h2:contains("Referencias"), h2:contains("Bibliografía"), h2:contains("Enlaces externos"), h2:contains("Véase también")')
    .first()
    .nextAll()
    .remove();
  $('h2:contains("Referencias"), h2:contains("Bibliografía"), h2:contains("Enlaces externos"), h2:contains("Véase también")')
    .first()
    .remove();

  // Take only the body — parsoid wraps in <html><body>.
  const body = $("body").length ? $("body").html() : $.html();
  return {
    contentHtml: (body ?? "").trim(),
    infobox: Object.keys(infobox).length ? infobox : null,
  };
}

async function ensureCategories() {
  for (const [slug, meta] of Object.entries(CATEGORIES)) {
    await prisma.category.upsert({
      where: { slug },
      create: { slug, name: meta.name, description: meta.description },
      update: { name: meta.name, description: meta.description },
    });
  }
}

async function seedOne(spec: SeedSpec) {
  console.log(`→ ${spec.wikiTitle}`);
  const [summary, html] = await Promise.all([
    fetchSummary(spec.wikiTitle),
    fetchHtml(spec.wikiTitle),
  ]);
  const { contentHtml, infobox } = normalize(html);
  const sourceUrl =
    summary.content_urls?.desktop?.page ??
    `https://es.wikipedia.org/wiki/${spec.wikiTitle}`;

  const article = await prisma.article.upsert({
    where: { slug: spec.slug },
    create: {
      slug: spec.slug,
      title: spec.title ?? summary.title,
      summary: summary.extract ?? null,
      contentHtml,
      infoboxJson: infobox ?? undefined,
      sourceUrl,
      published: true,
    },
    update: {
      title: spec.title ?? summary.title,
      summary: summary.extract ?? null,
      contentHtml,
      infoboxJson: infobox ?? undefined,
      sourceUrl,
    },
  });

  // Link categories.
  for (const catSlug of spec.categories) {
    const cat = await prisma.category.findUnique({ where: { slug: catSlug } });
    if (!cat) continue;
    await prisma.articleCategory.upsert({
      where: {
        articleId_categoryId: { articleId: article.id, categoryId: cat.id },
      },
      create: { articleId: article.id, categoryId: cat.id },
      update: {},
    });
  }
}

async function main() {
  await ensureCategories();
  for (const spec of SEEDS) {
    try {
      await seedOne(spec);
    } catch (err) {
      console.error(`  failed ${spec.wikiTitle}:`, err);
    }
    await sleep(750); // be nice to Wikipedia
  }
  const count = await prisma.article.count();
  console.log(`Done. ${count} articles in DB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
