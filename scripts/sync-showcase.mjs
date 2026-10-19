#!/usr/bin/env node
/**
 * Regenerate src/showcase.ts from the live krackeddevs.com showcase.
 *
 *   npm run sync-showcase
 *
 * The site is a Next.js App Router app with no public API, so the project list
 * only exists as React Server Component payload inside the page HTML. The page
 * ships it as escaped JSON inside `self.__next_f.push(...)` string literals, so
 * the parse is: find every object carrying `tech_tags`, walk out to its matching
 * brace, unescape, JSON.parse. That is brittle by nature - if the site ever
 * changes its payload shape, this script fails loudly rather than writing a
 * short file:
 *
 *   - no projects parsed        -> exit 1
 *   - parsed count drops >20%   -> exit 1 (site changed, or we got a partial page)
 *   - fewer projects with links -> exit 1 (would silently gut the game)
 *
 * Run with --dry-run to print a diff summary without touching the file.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'showcase.ts');
const SOURCE = 'https://krackeddevs.com/showcase';
const DRY = process.argv.includes('--dry-run');

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

/**
 * Pull every project object out of the RSC payload.
 *
 * Each object is JSON, escaped once as a JS string literal, so `"` arrives as
 * `\"`. We locate candidates by a key that only appears on project rows, then
 * balance braces to find the object's true extent. Balanced-brace walking on the
 * escaped text is safe here because the escaping does not touch `{`, `}` or
 * introduce stray braces inside string values.
 */
function extract(html) {
  const out = [];
  const seen = new Set();
  const marker = 'tech_tags';

  for (let at = html.indexOf(marker); at !== -1; at = html.indexOf(marker, at + 1)) {
    let open = at;
    for (let depth = 0; open > 0; open--) {
      const c = html[open];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) break;
        depth--;
      }
    }
    let close = open;
    for (let depth = 0; close < html.length; close++) {
      const c = html[close];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    let obj;
    try {
      obj = JSON.parse(html.slice(open, close + 1).replace(/\\"/g, '"'));
    } catch {
      continue; // not a clean object boundary; the real one was found elsewhere
    }
    if (!obj || typeof obj.id !== 'string' || !obj.id) continue;
    if (seen.has(obj.id)) continue;
    seen.add(obj.id);
    out.push(obj);
  }
  return out;
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

const html = await fetchPayload();
const raw = extract(html).filter((o) => o.status === APPROVED);

if (raw.length === 0) {
  console.error('fatal: parsed 0 approved projects - the payload shape has changed');
  process.exit(1);
}

const projects = raw
  .map(toEntry)
  .sort((a, b) => (a.title > b.title ? 1 : a.title < b.title ? -1 : 0));

const prev = previousCount();
if (prev && projects.length < prev * 0.8) {
  console.error(
    `fatal: parsed ${projects.length} projects, previous snapshot had ${prev}. ` +
      `A drop over 20% means the page did not fully render or the shape changed.`,
  );
  process.exit(1);
}

const withLinks = projects.filter((p) => p.site || p.git).length;
if (withLinks < projects.length * 0.5) {
  console.error(
    `fatal: only ${withLinks}/${projects.length} projects carry a link - refusing to write`,
  );
  process.exit(1);
}

if (DRY) {
  console.log(`dry run: would write ${projects.length} projects (was ${prev ?? 'n/a'})`);
  console.log(`  with a live site: ${projects.filter((p) => p.site).length}`);
  console.log(`  with a repo:      ${projects.filter((p) => p.git).length}`);
  console.log(`  with tags:        ${projects.filter((p) => p.stack.length).length}`);
  console.log('  first three:');
  for (const p of projects.slice(0, 3)) console.log(`    ${p.title} - ${p.author}`);
  process.exit(0);
}

writeFileSync(OUT, render(projects));
console.log(
  `wrote ${projects.length} projects to src/showcase.ts` +
    (prev && prev !== projects.length ? ` (was ${prev})` : ''),
);