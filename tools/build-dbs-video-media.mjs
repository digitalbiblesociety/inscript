/**
 * Build the verse -> DBS video map used by the 'dbsvideo' media library.
 *
 *   pnpm build-dbs-video-media
 *
 * Reads the DBS video catalog and, for each chapter-linked title, the English
 * (or plainest-named) edition's metadata, then turns each item's `reference`
 * into a verse id and writes browserbible/public/content/media/dbsvideo/info.json.
 *
 * Chapter numbers (`n`) and cover images are identical across languages, so one
 * map serves every language; DbsVideoApi resolves (org, chapter) to a video in
 * the reader's language at play time.
 *
 * Why Playwright and not fetch(): *.dbs.org sits behind Cloudflare's bot
 * protection, which 403s curl, node fetch and headless browsers alike. A headed
 * browser passes, so this drives one and does the fetching in page context.
 *
 * Titles skipped on purpose: the Visual Bible: Acts (org Acts_VB) and Gospel of
 * John (org John) are chapter-linked products, but their catalog metadata ships
 * no `reference` on any item in any language, so there is nothing to key a verse
 * off. Add them here once upstream publishes references (or hand-author a map).
 */

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOOK_DATA } from '../browserbible/js/bible/BibleData.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = resolve(rootDir, 'browserbible/public/content/media/dbsvideo/info.json');

const CATALOG_URL = 'https://dbs.org/data/video.json';
const TITLES_URL = 'https://dbs.org/data/video_titles.json';
const META_BASE = 'https://meta.dbs.org/data/data-video/video';

// Catalog orgs whose items carry a Bible reference, in the order their thumbs
// should appear on a verse. `name` falls back to video_titles.json.
const ORGS = [
  { org: 'Jesus' },
  { org: 'Lumo-Matthew' },
  { org: 'Lumo-Mark' },
  { org: 'Lumo-Luke' },
  { org: 'Lumo-John' },
  { org: 'Lumo-Acts' },
  { org: 'Lumo-Covenant' },
  { org: 'Matthew' },
  { org: 'Luke' },
  { org: 'Genesis' },
  { org: 'Bible_Slides' },
  { org: 'John_Slides' }
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.]/g, '');

/** Book name (English name or alias) -> DBS 2-letter book code. */
const BOOK_NAME_TO_CODE = (() => {
  const map = {};
  for (const code of Object.keys(BOOK_DATA)) {
    const book = BOOK_DATA[code];
    map[norm(book.name)] = code;
    for (const alias of book.names?.eng ?? []) map[norm(alias)] = code;
  }
  // Spellings DBS uses that are not in the alias lists.
  map[norm('Psalms')] = 'PS';
  map[norm('Song of Solomon')] = 'SS';
  return map;
})();

/**
 * First verse a reference points at, as a verse id.
 * Handles "Matthew 1", "Luke 1:1-25", "Genesis 1:1-2:3", "Acts 1-7" (en dash),
 * "Genesis 12, 15, 17" and "Exodus 5-20 and beyond"; returns null for prose
 * such as "Frame narrative - Ezra in Jerusalem". Yields ids like "LK1_25".
 */
export function referenceToVerseId(reference) {
  const text = String(reference ?? '').replace(/[‐-―]/g, '-').trim();
  if (!text) return null;

  // Longest leading book name wins, so "Song of Solomon 1" beats "Song".
  const match = text.match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z\s]*?)\s*(\d+)(?::(\d+))?/);
  if (!match) return null;

  const code = BOOK_NAME_TO_CODE[norm(match[1])];
  if (!code) return null;

  return `${code}${Number(match[2])}_${Number(match[3] ?? 1)}`;
}

/**
 * Edition to build the map from: an English one when the title has one (its
 * titles are what shows before playback swaps in the reader's language), and
 * within that the most complete edition, since the map is what limits coverage.
 * Same shape of heuristic as DbsVideoApi.pickCatalogEntry.
 */
function pickSourceEntry(catalog, org) {
  const entries = catalog.filter((e) => (e.o ?? e.org) === org && (e.j ?? e.file));
  const english = entries.filter((e) => String(e.i ?? '').toLowerCase() === 'eng');
  const pool = english.length ? english : entries;
  if (!pool.length) return null;

  return [...pool].sort((a, b) =>
    Number(b.k ?? 0) - Number(a.k ?? 0) ||
    String(a.l ?? '').length - String(b.l ?? '').length ||
    String(a.l ?? '').localeCompare(String(b.l ?? '')) ||
    String(a.j ?? '').localeCompare(String(b.j ?? ''))
  )[0];
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const getJson = (url) => page.evaluate(async (u) => {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
    return res.json();
  }, url);

  try {
    // Land on the site first so Cloudflare is satisfied before the data fetches.
    await page.goto('https://dbs.org/', { waitUntil: 'domcontentloaded' });

    const [catalog, titles] = await Promise.all([getJson(CATALOG_URL), getJson(TITLES_URL)]);
    console.log(`catalog: ${catalog.length} editions, ${titles.length} titles`);

    const titleName = new Map(titles.map((t) => [t.org, t.displayTitle || t.title]));
    const map = {};
    let total = 0;

    for (const { org, name } of ORGS) {
      const entry = pickSourceEntry(catalog, org);
      if (!entry) {
        console.warn(`  ${org}: not in the catalog, skipped`);
        continue;
      }

      const raw = await getJson(`${META_BASE}/${org}/${entry.j}`);
      const items = Array.isArray(raw.sections)
        ? raw.sections.flatMap((s) => s.items ?? [])
        : (raw.chapters ?? []);

      const source = name || titleName.get(org) || raw.title || org;
      const seen = new Set();
      let mapped = 0;
      const skipped = [];

      for (const item of items) {
        const chapter = Number(item.n ?? item.chapter);
        if (!Number.isFinite(chapter) || seen.has(chapter)) continue; // repeat = another audio translation
        seen.add(chapter);

        const verseid = referenceToVerseId(item.reference);
        if (!verseid) {
          skipped.push(`${chapter}:${JSON.stringify(item.reference ?? null)}`);
          continue;
        }

        // Deliberately no description: this map is fetched at startup, and the
        // per-chapter text is already in the title JSON loaded at play time.
        (map[verseid] ??= []).push({
          org,
          chapter,
          filename: `${org}-${String(chapter).padStart(2, '0')}`,
          name: clean(item.title),
          source,
          cover: item.cover ?? ''
        });
        mapped++;
      }

      total += mapped;
      console.log(`  ${org.padEnd(14)} ${String(mapped).padStart(3)} mapped from ${entry.j}` +
        (skipped.length ? `  (no reference: ${skipped.join(' ')})` : ''));
    }

    // Sort verse keys canonically so the file diffs readably.
    const order = new Map(Object.keys(BOOK_DATA).map((code, i) => [code, i]));
    const sorted = Object.fromEntries(Object.keys(map)
      .sort((a, b) => {
        const [ba, ca, va] = [a.slice(0, 2), ...a.slice(2).split('_')];
        const [bb, cb, vb] = [b.slice(0, 2), ...b.slice(2).split('_')];
        return (order.get(ba) ?? 999) - (order.get(bb) ?? 999) || Number(ca) - Number(cb) || Number(va) - Number(vb);
      })
      .map((key) => [key, map[key]]));

    mkdirSync(dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(sorted, null, '\t') + '\n');
    console.log(`\n${total} videos on ${Object.keys(sorted).length} verses -> ${OUT_FILE}`);
  } finally {
    await browser.close();
  }
}

// Only run when invoked directly, so the reference parser above can be unit tested.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
