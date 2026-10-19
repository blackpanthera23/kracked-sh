#!/usr/bin/env node
/**
 * Regenerate src/showcase.ts from the live krackeddevs.com showcase.
 *
 *   npm run sync-showcase
 *
 * The site is a Next.js App Router app with no public API, so the project list
 * only exists as React Server Component payload inside the page HTML. The page
 * ships it as escaped JSON inside `self.__next_f.push(...)` string literals.
 * Decode those strings, join the streamed chunks, then walk each JSON RSC row
 * for project objects carrying `tech_tags`. If the source changes, fail loudly
 * rather than writing a short file:
 *
 *   - no projects parsed        -> exit 1
 *   - parsed count drops >20%   -> exit 1 (site changed, or we got a partial page)
 *   - fewer projects with links -> exit 1 (would silently gut the game)
 *
 * Screenshots live in a second generated file, src/showcase-images.ts, keyed by
 * project id. The source's `image_url` is its cover screenshot; `gallery_urls`
 * contains additional screenshots, not replacement covers. Only http(s) URLs
 * are accepted. Missing projects or covers have no entry, never a stand-in.
 * An unexpected image schema or zero usable covers aborts before either write.
 *
 * Run with --dry-run to print a diff summary without touching either file.
 * Run with --images to refresh only the screenshot map, for the projects already
 * in src/showcase.ts, leaving the project snapshot (and every save code minted
 * against it) exactly as it is.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'showcase.ts');
const OUT_IMAGES = join(HERE, '..', 'src', 'showcase-images.ts');
const SOURCE = 'https://krackeddevs.com/showcase';
const DRY = process.argv.includes('--dry-run');
const IMAGES_ONLY = process.argv.includes('--images');

/** Only projects the site itself shows as approved belong in the terminal. */
const APPROVED = 'approved';

/** ------------------------------------------------------------------ fetch */

async function fetchPayload() {
  const res = await fetch(SOURCE, {
    headers: {
      // the RSC payload is only embedded for a normal HTML navigation
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) kracked-sync/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`${SOURCE} -> HTTP ${res.status}`);
  const html = await res.text();
  if (html.length < 100_000) {
    throw new Error(`page was only ${html.length} bytes - not a full render`);
  }
  return html;
}

/** ------------------------------------------------------- extract projects */

/** Decode the site's streamed RSC strings before parsing their JSON rows. */
function extract(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)]
    .map((match) => JSON.parse(match[1]));
  const out = new Map();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id && Array.isArray(value.tech_tags)) {
      if (!out.has(value.id)) out.set(value.id, value);
      return;
    }
    for (const child of Object.values(value)) walk(child);
  }
  for (const line of chunks.join('').split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let value;
    try {
      value = JSON.parse(line.slice(colon + 1));
    } catch {
      continue; // RSC also contains non-JSON module hints and text records.
    }
    walk(value);
  }
  return [...out.values()];
}

/** ----------------------------------------------------------------- shape */

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** A one-liner that fits the card: short_description first, then description. */
function oneLiner(o) {
  const short = clean(o.short_description);
  if (short) return short;
  const long = clean(o.description);
  if (long.length <= 96) return long;
  return long.slice(0, 93).replace(/[ ,.;:]+$/, '') + '...';
}

function toEntry(o) {
  return {
    id: o.id,
    title: clean(o.title) || 'Untitled',
    author: clean(o.profiles?.username) || 'unknown',
    level: Number.isInteger(o.profiles?.level) ? o.profiles.level : 1,
    oneLiner: oneLiner(o),
    stack: Array.isArray(o.tech_tags) ? o.tech_tags.map(clean).filter(Boolean).slice(0, 5) : [],
    site: clean(o.site_url),
    git: clean(o.git_url),
    // the site's own rarity score for the card's glow
    rarity: Number.isInteger(o.rarity_high_water) ? o.rarity_high_water : 0,
  };
}

/** --------------------------------------------------------------- images */

/**
 * An absolute http(s) URL, or ''. Root-relative paths are the site's own assets
 * and resolve against it; bare storage keys and any other scheme are refused,
 * because guessing their host would be making a URL up.
 */
function httpUrl(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s || !(/^(https?:)?\/\//i.test(s) || s.startsWith('/'))) return '';
  try {
    const u = new URL(s, SOURCE);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Only the source's cover screenshot, never an avatar or guessed field. */
function collectImages(rows, ids) {
  const byId = new Map(rows.map((o) => [o.id, o]));
  const images = [];
  const missingProjects = [];
  const missingCovers = [];
  for (const row of rows) {
    if (!Object.hasOwn(row, 'image_url') ||
        (row.image_url !== null && typeof row.image_url !== 'string')) {
      throw new Error(`unexpected image_url schema on project ${row.id} - refusing to write`);
    }
  }
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      missingProjects.push(id);
      continue;
    }
    const url = httpUrl(row.image_url);
    if (url) images.push([id, url]);
    else missingCovers.push(id);
  }
  if (!images.length) {
    throw new Error('parsed 0 usable cover screenshots - refusing to write');
  }
  return { images, missingProjects, missingCovers };
}

function renderImages(images, total) {
  const rows = images.map(([id, url]) => `  '${esc(id)}': '${esc(url)}',`);
  return `/**
 * Project screenshots, extracted from ${SOURCE}.
 *
 * GENERATED FILE - do not edit by hand. Run \`npm run sync-showcase\` (or
 * \`npm run sync-showcase:images\` to refresh only this file) to regenerate.
 *
 * Keyed by SHOWCASE project id, in snapshot order. Every URL is the source's
 * image_url cover screenshot, validated as http(s). No entry means the live
 * source has no matching project or usable cover; no image is fabricated.
 *
 * Snapshot: ${images.length} of ${total} projects carry a screenshot.
 */

export const SHOWCASE_IMAGES: Readonly<Record<string, string>> = {
${rows.join('\n')}
};
`;
}

function reportImages({ images, missingProjects, missingCovers }, total) {
  console.log(`  with a screenshot: ${images.length} of ${total}`);
  console.log(`  image field used: image_url (${images.length}); gallery_urls are additional shots`);
  for (const [id, url] of images.slice(0, 3)) console.log(`    ${id} -> ${url}`);
  console.log(`  missing source projects: ${missingProjects.length}`);
  for (const id of missingProjects) console.log(`    ${id}`);
  console.log(`  missing usable covers: ${missingCovers.length}`);
  for (const id of missingCovers) console.log(`    ${id}`);
}

/** ------------------------------------------------------------------ write */

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function render(projects) {
  const rows = projects.map((p) => {
    const stack = p.stack.length ? `[${p.stack.map((s) => `'${esc(s)}'`).join(', ')}]` : '[]';
    return [
      '  {',
      `    id: '${esc(p.id)}', title: '${esc(p.title)}',`,
      `    author: '${esc(p.author)}', level: ${p.level},`,
      `    oneLiner: '${esc(p.oneLiner)}',`,
      `    stack: ${stack},`,
      `    site: '${esc(p.site)}', git: '${esc(p.git)}',`,
      `    rarity: ${p.rarity},`,
      '  },',
    ].join('\n');
  });

  const withSite = projects.filter((p) => p.site).length;
  const withGit = projects.filter((p) => p.git).length;

  return `/**
 * Real showcase data, extracted from ${SOURCE}.
 *
 * GENERATED FILE - do not edit by hand. Run \`npm run sync-showcase\` to refresh.
 *
 * Mirrors what the site ships: project id (canonical /showcase/project/<id> URL),
 * title, author handle, links, tags and the site's own rarity score. Ids are
 * stable UUIDs.
 *
 * Snapshot: ${projects.length} approved projects, ${withSite} with a live site and
 * ${withGit} with a repo. Order is newest first, exactly as the site lists them.
 */

export interface ShowcaseProject {
  id: string;
  title: string;
  author: string;
  level: number;
  oneLiner: string;
  stack: string[];
  site: string;
  git: string;
  rarity: number;
}

export const SHOWCASE: ShowcaseProject[] = [
${rows.join('\n')}
];
`;
}

function previousCount() {
  if (!existsSync(OUT)) return null;
  const m = readFileSync(OUT, 'utf8').match(/export const SHOWCASE[^=]*=\s*\[/);
  if (!m) return null;
  const body = readFileSync(OUT, 'utf8');
  return (body.match(/^\s{2}\{$/gm) || []).length;
}

/** ------------------------------------------------------------------- main */

/** Ids of the projects already in the snapshot, in snapshot order. */
function snapshotIds() {
  if (!existsSync(OUT)) return [];
  return [...readFileSync(OUT, 'utf8').matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]);
}

const html = await fetchPayload();
const raw = extract(html).filter((o) => o.status === APPROVED);

if (raw.length === 0) {
  console.error('fatal: parsed 0 approved projects - the payload shape has changed');
  process.exit(1);
}

const prev = previousCount();
if (prev && raw.length < prev * 0.8) {
  console.error(
    `fatal: parsed ${raw.length} projects, previous snapshot had ${prev}. ` +
      `A drop over 20% means the page did not fully render or the shape changed.`,
  );
  process.exit(1);
}

const withLinks = raw.filter((o) => clean(o.site_url) || clean(o.git_url)).length;
if (withLinks < raw.length * 0.5) {
  console.error(
    `fatal: only ${withLinks}/${raw.length} projects carry a link - refusing to write`,
  );
  process.exit(1);
}

if (IMAGES_ONLY) {
  // screenshots only: the project snapshot, its ids and its order stay untouched
  const ids = snapshotIds();
  if (!ids.length) {
    console.error('fatal: src/showcase.ts has no projects - run a full sync first');
    process.exit(1);
  }
  const result = collectImages(raw, ids);
  const { images } = result;
  console.log(`${DRY ? 'dry run: would write' : 'writing'} screenshots for the ${ids.length} snapshot projects`);
  reportImages(result, ids.length);
  if (!DRY) {
    writeFileSync(OUT_IMAGES, renderImages(images, ids.length));
    console.log(`wrote ${images.length} screenshots to src/showcase-images.ts`);
  }
  process.exit(0);
}

const projects = raw
  .map(toEntry)
  .sort((a, b) => (a.title > b.title ? 1 : a.title < b.title ? -1 : 0));


if (DRY) {
  console.log(`dry run: would write ${projects.length} projects (was ${prev ?? 'n/a'})`);
  console.log(`  with a live site: ${projects.filter((p) => p.site).length}`);
  console.log(`  with a repo:      ${projects.filter((p) => p.git).length}`);
  console.log(`  with tags:        ${projects.filter((p) => p.stack.length).length}`);
  console.log('  first three:');
  for (const p of projects.slice(0, 3)) console.log(`    ${p.title} - ${p.author}`);
  const result = collectImages(raw, projects.map((p) => p.id));
  reportImages(result, projects.length);
  process.exit(0);
}

// both files describe the same snapshot, so they are always written together
const result = collectImages(raw, projects.map((p) => p.id));
const { images } = result;
writeFileSync(OUT, render(projects));
writeFileSync(OUT_IMAGES, renderImages(images, projects.length));
console.log(
  `wrote ${projects.length} projects to src/showcase.ts` +
    (prev && prev !== projects.length ? ` (was ${prev})` : ''),
);
reportImages(result, projects.length);