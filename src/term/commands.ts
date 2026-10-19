/**
 * Command registry. Each command is a small pure-ish function over Ctx.
 */

import { COMMUNITY, MEMBERS, BOUNTIES, type Member } from '../data';
import { SHOWCASE, type ShowcaseProject } from '../showcase';
import type { Command, Ctx } from './shell';
import { line, blank, kv, table, pwrBar, tag, card as panel, link, raw, cmdLink, cmdRow, meter } from './output';
import {
  award, snapshot, exportSave, importSave, reset as resetProgress,
  levelOf, tierOf, xpForLevel, isPersistent, type Award,
} from './progress';

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

function banner(): HTMLElement {
  const art = String.raw`
   ██╗  ██╗██████╗  █████╗  ██████╗██╗  ██╗███████╗██████╗
   ██║ ██╔╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
   █████╔╝ ██████╔╝███████║██║     █████╔╝ █████╗  ██║  ██║
   ██╔═██╗ ██╔══██╗██╔══██║██║     ██╔═██╗ ██╔══╝  ██║  ██║
   ██║  ██╗██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██████╔╝
   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝
                 d e v s   ·   community shell`;
  const pre = document.createElement('pre');
  pre.className = 'ascii';
  pre.textContent = art.replace(/^\n/, '');
  return pre;
}

async function boot(ctx: Ctx): Promise<void> {
  ctx.status('booting', true);
  const steps: [string, number][] = [
    ['mounting /dev/community', 240],
    ['loading builder registry', 200],
    ['hydrating 565 projects', 260],
    ['negotiating guild sockets', 220],
  ];
  for (const [label, wait] of steps) {
    await ctx.write(line(`  ${label}`, 'line--dim'));
    await ctx.sleep(wait);
  }
  await ctx.write(line('  ready.', 'line--ok'));
  await ctx.sleep(160);
}

const help: Command['run'] = async (_a, ctx) => {
  ctx.out(blank());
  ctx.out(line('  Commands', 'line--info'));
  ctx.out(blank());
  const groups: Record<string, Command[]> = {};
  for (const c of REGISTRY) {
    if (c.hidden) continue;
    (groups[c.group] ??= []).push(c);
  }
  const titles: Record<string, string> = {
    community: 'explore the community',
    navigate: 'go somewhere',
    system: 'shell',
    fun: 'maybe just for fun',
  };
  for (const g of ['community', 'navigate', 'system', 'fun']) {
    if (!groups[g]) continue;
    ctx.out(line(`  ${titles[g]}`, 'line--faint'));
    for (const c of groups[g]) {
      ctx.out(raw(
        `    <span style="color:var(--cyan)">${pad(c.usage ?? c.name, 22)}</span>` +
        `<span style="color:var(--fg-dim)">${c.summary}</span>`,
      ));
    }
    ctx.out(blank());
  }
  ctx.out(line('  Tip: press Tab to complete, ↑/↓ to recall. New here? type `start`.', 'line--faint'));
};

const whoami: Command['run'] = (_a, ctx) => {
  const me = MEMBERS[0];
  ctx.out(blank());
  ctx.out(panel(
    `${me.name}  ·  @${me.handle}`,
    `${me.role}  ·  pwr ${me.pwr}  ·  ${me.shipped} shipped  ·  ${me.status}`,
    me.bio,
  ));
  ctx.out(kv([['stack', me.stack.join(', ')]]));
  const links = document.createElement('div');
  links.className = 'line';
  links.append(line('links', 'kv__k').firstChild ? document.createTextNode('') : document.createTextNode(''));
  links.textContent = 'links   ';
  me.links.forEach((l, i) => {
    if (i) links.append(document.createTextNode('  ·  '));
    links.append(link(l.label, l.href));
  });
  ctx.out(links);
  ctx.out(line('  (you are browsing as a guest — `join` to claim this handle)', 'line--faint'));
};

const members: Command['run'] = (args, ctx) => {
  const filter = args[0]?.toLowerCase();
  const rows = filter
    ? MEMBERS.filter((m) => m.stack.some((s) => s.toLowerCase().includes(filter)) || m.role.toLowerCase().includes(filter))
    : MEMBERS;

  if (!rows.length) {
    ctx.out(line(`no builders matching "${args[0]}"`, 'line--warn'));
    return;
  }
  ctx.out(blank());
  ctx.out(line(`  ${rows.length} of ${COMMUNITY.builders.toLocaleString()} builders`, 'line--faint'));
  ctx.out(blank());
  ctx.out(table<Member>(rows, [
    { head: 'handle', cell: (m) => `@${m.handle}` },
    { head: 'role', cell: (m) => m.role, muted: true },
    { head: 'stack', cell: (m) => m.stack.join(' · '), muted: true },
{ head: 'pwr', num: true, cell: (m) => String(m.pwr) },
      { head: 'meter', cell: (m) => pwrBar(m.pwr) },
      { head: 'status', cell: (m) => (m.status === 'online' ? tag('online', 'ok') : m.status === 'building' ? tag('building', 'hot') : tag('away')) },
  ]));
  ctx.out(line('  `whois <handle>` for a full profile.', 'line--faint'));
};

const whois: Command['run'] = (args, ctx) => {
  const q = (args[0] ?? '').replace(/^@/, '').toLowerCase();
  const m = MEMBERS.find((x) => x.handle.toLowerCase() === q);
  if (!m) {
    ctx.out(line(`whois: unknown builder "${args[0] ?? ''}"`, 'line--err'));
    ctx.out(line('  try `members` to list handles.', 'line--faint'));
    return;
  }
  ctx.out(blank());
  ctx.out(panel(`${m.name}  ·  @${m.handle}`, `${m.role}  ·  ${m.status}`, m.bio));
  ctx.out(kv([
    ['power', `${m.pwr} pwr`],
    ['shipped', String(m.shipped)],
    ['stack', m.stack.join(', ')],
  ]));
  const lk = document.createElement('div');
  lk.className = 'line';
  lk.append(document.createTextNode('links   '));
  m.links.forEach((l, i) => {
    if (i) lk.append(document.createTextNode('  ·  '));
    lk.append(link(l.label, l.href));
  });
  ctx.out(lk);
  const a = award('guild', m.handle);
  ctx.out(blank());
  ctx.out(cmdRow('  next:', [
    ['follow', `follow ${m.handle}`],
    ['showcase', 'showcase'],
    ['player', 'player'],
  ]));
  reportAward(a, ctx);
};

const bounties: Command['run'] = (_a, ctx) => {
  ctx.out(blank());
  ctx.out(line('  Open bounties', 'line--info'));
  ctx.out(blank());
  ctx.out(table(BOUNTIES, [
    { head: 'id', cell: (b) => b.id },
    { head: 'title', cell: (b) => b.title },
    {
      head: 'state',
      cell: (b) =>
        b.state === 'closing' ? tag('closing soon', 'hot') : b.state === 'judging' ? tag('judging') : tag('open', 'ok'),
    },
    { head: 'reward', cell: (b) => b.reward, muted: true },
    { head: 'deadline', cell: (b) => b.deadline },
  ]));
  const active = BOUNTIES.find((b) => b.state === 'closing');
  if (active) {
    ctx.out(line(`  → \`cat bounty ${active.id}\` for the full brief.`, 'line--faint'));
  }
};

const cat: Command['run'] = async (args, ctx) => {
  const target = args[0];
  if (target === 'bounties' || target === 'bounty') {
    if (args[1]) return printBounty(args[1], ctx);
    return bounties([], ctx);
  }
  if (target === 'about') return about(ctx);
  if (target === 'manifesto') return manifesto(ctx);
  ctx.out(line(`cat: ${target ?? ''}: No such file`, 'line--err'));
  ctx.out(line('  available: bounties, about, manifesto', 'line--faint'));
};

async function printBounty(id: string, ctx: Ctx): Promise<void> {
  const key = id.toLowerCase();
  // accept the full id (kd-comm-01), its numeric suffix (01), or its row number (1)
  const suffix = key.replace(/^kd-[a-z]+-/, '');
  const n = Number(key);
  const b =
    BOUNTIES.find((x) => x.id.toLowerCase() === key) ??
    BOUNTIES.find((x) => x.id.toLowerCase().endsWith(`-${suffix}`) && suffix !== '') ??
    (Number.isInteger(n) && n >= 1 && n <= BOUNTIES.length ? BOUNTIES[n - 1] : undefined);
  if (!b) {
    ctx.out(line(`cat: ${id}: no such bounty`, 'line--err'));
    ctx.out(line(`  try: ${BOUNTIES.map((x) => x.id).join(', ')}`, 'line--faint'));
    return;
  }
  ctx.out(blank());
  ctx.out(panel(b.title, `${b.id}  ·  ${b.reward}  ·  ${b.slots} winner${b.slots > 1 ? 's' : ''}  ·  closes ${b.deadline}`, b.brief));
  const tags = document.createElement('div');
  tags.className = 'line';
  b.tags.forEach((t) => tags.append(tag(t)));
  ctx.out(tags);
  const a = award('bounty', b.id);
  ctx.out(blank());
  ctx.out(cmdRow('  next:', [
    ['all bounties', 'bounties'],
    ['showcase', 'showcase'],
    ['player', 'player'],
  ]));
  reportAward(a, ctx);
}

async function about(ctx: Ctx): Promise<void> {
  ctx.out(blank());
  ctx.out(panel(
    COMMUNITY.name,
    `${COMMUNITY.builders.toLocaleString()} builders  ·  ${COMMUNITY.shipped} shipped  ·  ${COMMUNITY.guilds} guilds`,
    COMMUNITY.tagline,
  ));
  ctx.out(line('  Kracked Devs is a builder community that runs on shipping, not talking', 'line--dim'));
  ctx.out(line('  about shipping. Bounties are short, scoped and judged by the people', 'line--dim'));
  ctx.out(line('  who build here. The showcase is the only résumé that matters.', 'line--dim'));
  ctx.out(blank());
  const lk = document.createElement('div');
  lk.className = 'line';
  lk.append(link('krackeddevs.com', COMMUNITY.site), document.createTextNode('   '), link('showcase', COMMUNITY.showcase));
  ctx.out(lk);
}

async function manifesto(ctx: Ctx): Promise<void> {
  const lines = [
    ['01', 'Ship the smallest thing that proves the idea.'],
    ['02', 'A screenshot of localhost is a claim. A URL is evidence.'],
    ['03', 'Prefer one thing finished over three things scaffolded.'],
    ['04', 'Delete before you abstract.'],
    ['05', 'If it needs a paragraph to justify, it needs a rebuild.'],
  ];
  ctx.out(blank());
  for (const [n, t] of lines) {
    ctx.out(raw(`  <span style="color:var(--fg-faint)">${n}</span>  <span style="color:var(--fg)">${t}</span>`));
    await ctx.sleep(70);
  }
}

/** Canonical URLs on the real site. */
const projectUrl = (id: string) => `${COMMUNITY.showcase}/project/${id}`;

const showcase: Command['run'] = (args, ctx) => {
  const filter = args.join(' ').toLowerCase().trim();
  const rows = filter
    ? SHOWCASE.filter(
        (p) =>
          p.title.toLowerCase().includes(filter) ||
          p.author.toLowerCase().includes(filter) ||
          p.stack.some((s) => s.toLowerCase().includes(filter)),
      )
    : SHOWCASE;
  if (!rows.length) {
    ctx.out(line(`showcase: nothing matching "${args.join(' ')}"`, 'line--warn'));
    ctx.out(line('  try a stack (`showcase react`) or a handle (`showcase @yunn`).', 'line--faint'));
    return;
  }
  const shown = rows.slice(0, 30);
  ctx.out(blank());
  ctx.out(line(
    `  ${rows.length}${rows.length > shown.length ? ` (showing ${shown.length})` : ''} of ${SHOWCASE.length} shipped projects`,
    'line--faint',
  ));
  ctx.out(blank());
  ctx.out(table<ShowcaseProject>(shown, [
    { head: 'project', cell: (p) => cmdLink(p.title, `open ${p.id}`) },
    { head: 'by', cell: (p) => `@${p.author}`, muted: true },
    { head: 'stack', cell: (p) => p.stack.slice(0, 3).join(' · '), muted: true },
    { head: 'live', cell: (p) => (p.site ? link('visit ↗', p.site) : '—'), muted: true },
  ]));
  ctx.out(line('  click a title to inspect · `open <title|@handle|id>` · `visit <project>` opens the live site', 'line--faint'));
};

/** Normalise a query: lowercase, strip a leading @, collapse separators. */
function normQuery(s: string): string {
  return s.toLowerCase().replace(/^@/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Rank showcase projects against a free-form query. */
function resolveProjects(query: string): ShowcaseProject[] {
  const q = normQuery(query);
  if (!q) return [];
  const scored: [ShowcaseProject, number][] = [];
  for (const p of SHOWCASE) {
    const title = normQuery(p.title);
    const author = normQuery(p.author);
    let score = 0;
    if (p.id === query.trim() || p.id.startsWith(query.trim())) score = 120; // exact uuid
    else if (title === q) score = 100;
    else if (author === q) score = 90;
    else if (title.startsWith(q)) score = 70;
    else if (title.includes(q)) score = 50;
    else if (author.includes(q)) score = 40;
    else if (p.stack.some((s) => normQuery(s).includes(q))) score = 20;
    if (score) scored.push([p, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** A card for one project, with real links out to the site. */
function projectCard(p: ShowcaseProject, ctx: Ctx): void {
  const lvl = p.level > 1 ? `  ·  level ${p.level}` : '';
  ctx.out(blank());
  ctx.out(panel(p.title, `by @${p.author}${lvl}${p.site ? '  ·  shipped' : ''}`, p.oneLiner));
  if (p.stack.length) ctx.out(kv([['stack', p.stack.join(', ')]]));
  const links = document.createElement('div');
  links.className = 'line';
  links.append(link('showcase page ↗', projectUrl(p.id)));
  if (p.site) links.append(document.createTextNode('  '), link('live site ↗', p.site));
  if (p.git) links.append(document.createTextNode('  '), link('repo ↗', p.git));
  ctx.out(links);
  ctx.out(blank());
  const next: [string, string][] = [[`whois @${p.author}`, `whois ${p.author}`]];
  if (p.site) next.push(['visit', `visit ${p.id}`]);
  next.push(['more by them', `showcase @${p.author}`], ['showcase', 'showcase']);
  ctx.out(cmdRow('  next:', next));
  ctx.out(blank());
}

const open: Command['run'] = (args, ctx) => {
  const raw = args.join(' ');
  if (!raw) {
    ctx.out(line('open: which project?  try `showcase`', 'line--warn'));
    return;
  }
  const matches = resolveProjects(raw);
  if (!matches.length) {
    ctx.out(line(`open: nothing matching "${raw}"`, 'line--err'));
    ctx.out(line('  try `showcase` for the list.', 'line--faint'));
    return;
  }
  const exact = normQuery(matches[0].title) === normQuery(raw) || matches[0].id === raw.trim();
  if (matches.length > 1 && !exact) {
    ctx.out(blank());
    ctx.out(line(`  ${matches.length} projects match "${raw}" — pick one:`, 'line--warn'));
    ctx.out(blank());
    ctx.out(table<ShowcaseProject>(matches.slice(0, 12), [
      { head: 'project', cell: (p) => cmdLink(p.title, `open ${p.id}`) },
      { head: 'by', cell: (p) => `@${p.author}`, muted: true },
      { head: 'stack', cell: (p) => p.stack.slice(0, 2).join(' · '), muted: true },
    ]));
    return;
  }
  projectCard(matches[0], ctx);
  reportAward(award('scan', matches[0].id), ctx);
};

/** Open the live site of a project in a new tab — the point of the showcase. */
const visit: Command['run'] = (args, ctx) => {
  const raw = args.join(' ');
  const p = raw ? resolveProjects(raw)[0] : undefined;
  if (!p) {
    ctx.out(line(`visit: no project matching "${raw}"`, 'line--err'));
    return;
  }
  if (!p.site) {
    ctx.out(line(`visit: "${p.title}" has no live URL on record.`, 'line--warn'));
    ctx.out(line('  try `open` to see its showcase page.', 'line--faint'));
    return;
  }
  ctx.out(line(`  opening ${p.title} → ${p.site}`, 'line--ok'));
  window.open(p.site, '_blank', 'noopener,noreferrer');
  const a = award('visit', p.id);
  if (a.first) reportAward(a, ctx);
  else alreadySeen(ctx, `${p.title} live site`);
};

const stats: Command['run'] = (_a, ctx) => {
  ctx.out(blank());
  ctx.out(kv([
    ['builders', COMMUNITY.builders.toLocaleString()],
    ['shipped', String(COMMUNITY.shipped)],
    ['projects', String(COMMUNITY.projects)],
    ['guilds', String(COMMUNITY.guilds)],
  ]));
  ctx.out(blank());
  ctx.out(line('  builder dist (pwr)', 'line--faint'));
  const top = [...MEMBERS].sort((a, b) => b.pwr - a.pwr).slice(0, 6);
  const max = top[0].pwr;
  for (const m of top) {
    const w = Math.round((m.pwr / max) * 30);
    ctx.out(raw(
      `  <span style="color:var(--fg-dim)">@${pad(m.handle, 18)}</span>` +
      `<span style="color:var(--green)">${'█'.repeat(w)}</span>` +
      `<span style="color:var(--fg-faint)">${'░'.repeat(30 - w)}</span> ` +
      `<span style="color:var(--amber)">${m.pwr}</span>`,
    ));
  }
};

const attach: Command['run'] = async (_a, ctx) => {
  ctx.out(line('  attaching to community topology…', 'line--dim'));
  await ctx.sleep(260);
  ctx.attach(true);
  ctx.status('attached', false);
};

/** Walk the city. With an argument, walk straight to that project's door. */
const explore: Command['run'] = async (args, ctx) => {
  const want = args.join(' ').trim();
  if (!want) {
    ctx.out(line('  opening the city…', 'line--dim'));
    await ctx.sleep(260);
    ctx.explore();
    ctx.status('walking', false);
    return;
  }
  const hits = resolveProjects(want);
  if (hits.length === 0) {
    ctx.out(line(`explore: nothing matches "${want}".`, 'line--warn'));
    return;
  }
  const target = hits[0];
  ctx.out(line(`  walking to ${target.title}…`, 'line--dim'));
  await ctx.sleep(260);
  ctx.explore(target.id);
  ctx.status('walking', false);
};

/** Open the project sky. With an argument, fly to that project's star. */
const sky: Command['run'] = async (args, ctx) => {
  const want = args.join(' ').trim();
  if (!want) {
    ctx.out(line('  charting the project sky…', 'line--dim'));
    await ctx.sleep(260);
    ctx.sky();
    ctx.status('drifting', false);
    return;
  }
  const hits = resolveProjects(want);
  if (hits.length === 0) {
    ctx.out(line(`sky: nothing matches "${want}".`, 'line--warn'));
    return;
  }
  const target = hits[0];
  ctx.out(line(`  flying to ${target.title}…`, 'line--dim'));
  await ctx.sleep(260);
  ctx.sky(target.id);
  ctx.status('drifting', false);
};

const join: Command['run'] = async (_a, ctx) => {
  ctx.out(blank());
  ctx.out(line('  kracked.sh — joining the community', 'line--info'));
  ctx.out(blank());
  const l1 = document.createElement('div');
  l1.className = 'line';
  l1.append(raw('<span style="color:var(--fg-faint)">  1. </span>').firstChild?.firstChild ?? document.createTextNode(''), document.createTextNode('open the browser flow → '), link('krackeddevs.com/showcase/submit', 'https://krackeddevs.com/showcase/submit'));
  ctx.out(l1);
  ctx.out(raw('  <span style="color:var(--fg-faint)">  2. </span>stay here and drive it from the shell:'));

  const seq = ['.join --handle yourname', '.join --handle yourname --stack "Vite,TypeScript"'];
  for (const s of seq) {
    await ctx.sleep(220);
    ctx.out(raw(`      <span style="color:var(--fg-faint)">$ </span><span style="color:var(--fg)">${s}</span>`));
  }
  ctx.out(blank());
  ctx.out(line('  Authentication is GitHub OAuth only. No passwords stored here.', 'line--faint'));
};

const dotjoin: Command['run'] = (args, ctx) => {
  const get = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const handle = get('--handle');
  if (!handle) {
    ctx.out(line('.join: --handle is required', 'line--err'));
    ctx.out(line('  e.g. .join --handle blackpanthera23', 'line--faint'));
    return;
  }
  const stack = get('--stack');
  ctx.out(blank());
  ctx.out(line(`  requesting handle @${handle}…`, 'line--dim'));
  ctx.out(line('  this is a demo shell — no account is created.', 'line--warn'));
  if (stack) ctx.out(kv([['stack', stack]]));
  ctx.out(blank());
  const lk = document.createElement('div');
  lk.className = 'line';
  lk.append(document.createTextNode('  continue in the browser → '), link('krackeddevs.com', COMMUNITY.site));
  ctx.out(lk);
};

const clear: Command['run'] = (_a, ctx) => ctx.clear();

const motd: Command['run'] = (_a, ctx) => {
  ctx.out(line('  the only résumé that matters is a URL that loads.', 'line--ok'));
  ctx.out(line('  new here? type `start`.', 'line--faint'));
};

const exit: Command['run'] = (_a, ctx) => {
  ctx.out(line('  there is no exit. only deployments.', 'line--warn'));
};

/* hidden easter eggs ------------------------------------------------------ */

const sudo: Command['run'] = (args, ctx) => {
  const rest = args.join(' ');
  if (/make me a sandwich/i.test(rest)) {
    ctx.out(line('  ok.', 'line--ok'));
    return;
  }
  if (/rm -rf/.test(rest)) {
    ctx.out(line('  nice try. nothing here is deletable.', 'line--warn'));
    return;
  }
  ctx.out(line(`  visitor is not in the sudoers file. This incident has been logged.`, 'line--err'));
  ctx.out(line('  …and by logged, we mean admired.', 'line--faint'));
};

const rm: Command['run'] = (args, ctx) => {
  if (/-rf?\s*\/(\s|$)/.test(args.join(' '))) {
    ctx.out(line('  permission denied. this entire page is 40 KB of static files.', 'line--err'));
    ctx.out(line('  deleting it would take longer than the bounty deadline.', 'line--faint'));
    return;
  }
  ctx.out(line('  rm: refusing to delete. try shipping something instead.', 'line--warn'));
};

const vim: Command['run'] = async (_a, ctx) => {
  ctx.out(line('  entering vim…', 'line--dim'));
  await ctx.sleep(700);
  ctx.out(line('  to exit, press :q  then Enter', 'line--faint'));
  await ctx.sleep(1400);
  ctx.out(line('  just kidding. there is no editor here. press Esc.', 'line--warn'));
};

const matrix: Command['run'] = async (_a, ctx) => {
  const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ0123456789$#%&*+';
  for (let i = 0; i < 4; i++) {
    let row = '  ';
    for (let j = 0; j < Math.min(64, ctx.width() - 6); j++) {
      row += Math.random() > 0.5 ? glyphs[Math.floor(Math.random() * glyphs.length)] : ' ';
    }
    ctx.out(line(row, 'line--ok'));
    await ctx.sleep(90);
  }
  ctx.out(line('  wake up, builder.', 'line--info'));
};

/* ------------------------------------------------- guided + player card --- */

/** The newcomer path: one ordered set of steps, each clickable. */
const start: Command['run'] = (_a, ctx) => {
  ctx.out(blank());
  ctx.out(line('  ── start here ──', 'line--info'));
  ctx.out(line('  Four steps from "what is this" to "I shipped something".', 'line--faint'));
  ctx.out(blank());
  const steps: [string, string, string][] = [
    ['1. what is Kracked Devs', 'about', 'the community, the guilds, the point'],
    ['2. what builders earn', 'members', 'handles, power, what moves it'],
    ['3. what people shipped', 'showcase', 'real projects, with live links'],
    ['4. how you join in', 'join', 'bounties, submission, first ship'],
  ];
  for (const [label, cmd, note] of steps) {
    const row = document.createElement('div');
    row.className = 'line';
    row.append(cmdLink(label, cmd), document.createTextNode(`  — ${note}`));
    ctx.out(row);
  }
  ctx.out(blank());
  ctx.out(line('  ── how the game works ──', 'line--info'));
  ctx.out(line('  every new project you inspect pays xp. xp buys levels and elements.', 'line--faint'));
  ctx.out(line('  repeats pay nothing, so the only way up is to keep looking.', 'line--faint'));
  ctx.out(cmdRow('  earn:', [
    ['scan a project  +15', 'scan'],
    ['open its live site  +10', 'showcase'],
    ['read a bounty  +25', 'bounties'],
  ]));
  ctx.out(blank());
  ctx.out(cmdRow('  or skip ahead:', [
    ['see the topology', 'attach'],
    ['walk the city', 'explore'],
    ['chart the sky', 'sky'],
    ['your player card', 'player'],
    ['read the manifesto', 'manifesto'],
  ]));
  ctx.out(blank());
  ctx.out(line('  tip: `help` lists everything · `player` shows where your run stands', 'line--faint'));
  ctx.out(blank());
};

/**
 * Player card. Scored with the same formula the site uses:
 *   pwr   = xp + 100*approvedProjects + 20*postCount + 50*badgeCount
 *   level = min(floor(sqrt(pwr/100)) + 1, 100)
 *   tier  = pwr >= 800 ? legendary : pwr >= 300 ? rare : common
 * Elements are the site's four: FIRE (bounties) WATER (ships) VOLT (streak) WIND (badges).
 */
const ELEMENTS: { element: string; glyph: string; label: string; has: (m: Member) => boolean }[] = [
  { element: 'WATER', glyph: '\u25bc', label: 'Ships projects to the showcase', has: (m) => m.shipped > 0 },
  { element: 'FIRE', glyph: '\u25b2', label: 'Wins bounties and competitions', has: (m) => m.pwr >= 90 },
  { element: 'VOLT', glyph: '\u2731', label: 'Keeps a live contribution streak', has: (m) => m.status === 'online' },
  { element: 'WIND', glyph: '\u2248', label: 'Earns badges across the platform', has: (m) => m.pwr >= 60 },
];

/** The four elements, scored off a record's own numbers. */
function elementsFor(m: Member): { glyph: string; element: string; label: string; on: boolean }[] {
  return ELEMENTS.map((e) => ({ glyph: e.glyph, element: e.element, label: e.label, on: e.has(m) }));
}

/** Anyone's static card — the lookup half of `player`. */
function builderCard(m: Member, ctx: Ctx): void {
  const pwr = (m.xp ?? 0) + 100 * m.shipped + 20 * (m.posts ?? 0) + 50 * (m.badges ?? 0);
  const level = levelOf(pwr);
  const tier = tierOf(pwr);
  ctx.out(blank());
  const head = document.createElement('div');
  head.className = 'line';
  head.append(cmdLink(`@${m.handle}`, `whois ${m.handle}`), document.createTextNode('   '), tag(tier, tier === 'COMMON' ? '' : 'hot'));
  ctx.out(head);
  ctx.out(line(`  ${m.name} · ${m.role}`, 'line--faint'));
  ctx.out(blank());
  ctx.out(kv([
    ['power', `${m.pwr} pwr`],
    ['level', String(level)],
    ['tier', tier],
    ['shipped', String(m.shipped)],
    ['stack', m.stack.join(', ')],
  ]));
  ctx.out(blank());
  ctx.out(line('  elements', 'line--faint'));
  for (const e of elementsFor(m)) {
    ctx.out(line(`   ${e.glyph} ${e.element.padEnd(6)} ${e.on ? e.label : '— locked'}`, e.on ? 'line--ok' : 'line--faint'));
  }
  ctx.out(blank());
  ctx.out(cmdRow('  next:', [
    ['whois', `whois ${m.handle}`],
    ['follow', `follow ${m.handle}`],
    ['showcase', 'showcase'],
  ]));
  ctx.out(blank());
}

/**
 * `player` — the playable card.
 *
 * Bare, it shows the player's own run: XP earned by exploring, the level that
 * XP buys, which elements are unlocked, the streak, and the next thing worth
 * doing. Given a handle, it falls back to that builder's static card.
 */
const player: Command['run'] = (args, ctx) => {
  const me = MEMBERS[0];

  if (args.length) {
    const q = normQuery(args.join(' '));
    const m = MEMBERS.find((x) => normQuery(x.handle) === q || normQuery(x.name) === q);
    if (!m) {
      ctx.out(line(`player: unknown builder "${args.join(' ')}"`, 'line--err'));
      ctx.out(line('  try `members` for handles, or bare `player` for your own card.', 'line--faint'));
      return;
    }
    builderCard(m, ctx);
    return;
  }

  const p = snapshot();
  // Power is the xp actually earned. The site's 100/shipped and 50/badge weights
  // describe authored work; a visitor authors nothing, so those stay at zero.
  const pwr = p.xp;
  const level = levelOf(p.xp);
  const tier = tierOf(pwr);
  const toNext = xpForLevel(level + 1) - p.xp;

  ctx.out(blank());
  const head = document.createElement('div');
  head.className = 'line';
  head.append(
    cmdLink(`@${me.handle}`, 'progress'),
    document.createTextNode('   '),
    tag(tier, tier === 'COMMON' ? '' : 'hot'),
    document.createTextNode('   '),
    tag(`Lv ${level}`, 'ok'),
  );
  ctx.out(head);
  ctx.out(line(`  ${me.name} · visitor is the player · this card is your run`, 'line--faint'));
  ctx.out(blank());

  // XP meter toward the next level
  const floorXp = xpForLevel(level);
  const span = Math.max(1, xpForLevel(level + 1) - floorXp);
  ctx.out(meter(Math.round(((p.xp - floorXp) / span) * 100), 24));
  ctx.out(line(
    level >= 100 ? '  max level.' : `  ${p.xp} xp · ${toNext} to level ${level + 1}`,
    'line--faint',
  ));
  ctx.out(blank());

  ctx.out(kv([
    ['xp', `${p.xp} xp`],
    ['power', `${pwr} pwr`],
    ['scanned', `${p.scanned.length} / ${SHOWCASE.length} projects`],
    ['visited', `${p.visited.length}`],
    ['repos', `${p.repoed.length}`],
    ['bounties read', `${p.bounties.length}`],
    ['following', p.followed.length ? p.followed.map((h) => `@${h}`).join(', ') : '— nobody yet'],
    ['streak', p.streak > 1 ? `${p.streak} days` : p.streak === 1 ? 'day 1 — come back tomorrow' : '— start today'],
  ]));
  ctx.out(blank());

  ctx.out(line('  elements', 'line--faint'));
  // Unlocks come from what the run actually did, so each one names a real act.
  const ELEMENT_UNLOCKS: { glyph: string; element: string; label: string; done: boolean }[] = [
    { glyph: '\u25bc', element: 'WATER', label: 'Ships projects to the showcase', done: p.visited.length >= 1 },
    { glyph: '\u25b2', element: 'FIRE', label: 'Wins bounties and competitions', done: p.bounties.length >= 1 },
    { glyph: '\u2731', element: 'VOLT', label: 'Keeps a live contribution streak', done: p.streak > 1 },
    { glyph: '\u2248', element: 'WIND', label: 'Earns badges across the platform', done: p.followed.length >= 1 },
  ];
  for (const e of ELEMENT_UNLOCKS) {
    ctx.out(line(`   ${e.glyph} ${e.element.padEnd(6)} ${e.done ? e.label : '— locked'}`, e.done ? 'line--ok' : 'line--faint'));
  }
  ctx.out(blank());

  if (!isPersistent()) {
    ctx.out(line('  note: storage is blocked here, so this run will not survive a reload.', 'line--warn'));
  }
  if (p.scanned.length === 0) {
    ctx.out(line('  you have not explored anything yet. every new project you open pays xp.', 'line--warn'));
  }
  ctx.out(cmdRow('  next:', [
    ['showcase', 'showcase'],
    ['scan <project>', 'scan'],
    ['bounties', 'bounties'],
    ['save', 'save'],
  ]));
  ctx.out(blank());
};

/* ------------------------------------------------------------ the loop --- */

/** Shared line for a repeat visit: no xp, and say why. */
function alreadySeen(ctx: Ctx, what: string): void {
  ctx.out(line(`  ${what} — already counted. xp only comes from the first look.`, 'line--faint'));
}

/** Report the XP a command just earned, and celebrate a level-up. */
function reportAward(a: Award, ctx: Ctx): void {
  if (!a.first) return;
  ctx.out(line(`  +${a.gained} xp`, 'line--ok'));
  if (a.levelAfter > a.levelBefore) {
    ctx.out(blank());
    ctx.out(line(`  ▲ level ${a.levelBefore} → level ${a.levelAfter}`, 'line--info'));
    ctx.out(line('  type `player` to see the new card.', 'line--faint'));
  }
}

/** Resolve a project argument or explain why it failed. */
function needProject(args: string[], ctx: Ctx, verb: string): ShowcaseProject | null {
  const raw = args.join(' ');
  if (!raw) {
    ctx.out(line(`${verb}: which project?  try \`showcase\``, 'line--warn'));
    return null;
  }
  const p = resolveProjects(raw)[0];
  if (!p) {
    ctx.out(line(`${verb}: nothing matching "${raw}"`, 'line--err'));
    ctx.out(line('  try `showcase` for the list.', 'line--faint'));
    return null;
  }
  return p;
}

/** Inspect a project and pay for the first look. Same card the site shows. */
const scan: Command['run'] = (args, ctx) => {
  const p = args.length ? needProject(args, ctx, 'scan') : pickRandom(ctx);
  if (!p) return;
  projectCard(p, ctx);
  reportAward(award('scan', p.id), ctx);
};

/** Pick an unexamined project, or a random one once the set is exhausted. */
function pickRandom(ctx: Ctx): ShowcaseProject {
  const seen: Record<string, true> = {};
  for (const id of snapshot().scanned) seen[id] = true;
  const fresh = SHOWCASE.filter((p) => !seen[p.id]);
  if (!fresh.length) {
    ctx.out(line(`  every project scanned. ${SHOWCASE.length} of ${SHOWCASE.length} — nothing new to find.`, 'line--ok'));
    return SHOWCASE[Math.floor(Math.random() * SHOWCASE.length)];
  }
  const p = fresh[Math.floor(Math.random() * fresh.length)];
  ctx.out(line(`  scanning at random · ${fresh.length} of ${SHOWCASE.length} still unseen`, 'line--faint'));
  return p;
}

/** Open the repo of a project. */
const repo: Command['run'] = (args, ctx) => {
  const p = args.length ? needProject(args, ctx, 'repo') : pickRandom(ctx);
  if (!p) return;
  if (!p.git) {
    ctx.out(line(`repo: "${p.title}" has no source on record.`, 'line--warn'));
    return;
  }
  ctx.out(line(`  opening ${p.title} → ${p.git}`, 'line--ok'));
  window.open(p.git, '_blank', 'noopener,noreferrer');
  reportAward(award('repo', p.id), ctx);
};

/** Follow a builder. */
const follow: Command['run'] = (args, ctx) => {
  const handle = (args[0] ?? '').replace(/^@/, '').toLowerCase();
  const m = MEMBERS.find((x) => x.handle.toLowerCase() === handle);
  if (!m) {
    ctx.out(line(`follow: unknown builder "${args[0] ?? ''}"`, 'line--err'));
    ctx.out(line('  try `members` for handles.', 'line--faint'));
    return;
  }
  const a = award('follow', m.handle);
  ctx.out(line(a.first ? `  following @${m.handle}` : `  already following @${m.handle}`, 'line--ok'));
  reportAward(a, ctx);
};

/** The raw numbers, for anyone who wants them without the card. */
const progress: Command['run'] = (_a, ctx) => {
  const p = snapshot();
  ctx.out(blank());
  ctx.out(kv([
    ['xp', `${p.xp} xp`],
    ['level', `${levelOf(p.xp)} / 100`],
    ['scanned projects', `${p.scanned.length} / ${SHOWCASE.length}`],
    ['visited sites', String(p.visited.length)],
    ['repos opened', String(p.repoed.length)],
    ['bounty briefs read', `${p.bounties.length} / ${BOUNTIES.length}`],
    ['builders followed', p.followed.length ? p.followed.map((h) => `@${h}`).join(', ') : '—'],
    ['streak', p.streak ? `${p.streak} day${p.streak > 1 ? 's' : ''} (last ${p.lastDay})` : '—'],
  ]));
  ctx.out(blank());
  ctx.out(line('  xp is paid once per subject. `save` to move this run to another machine.', 'line--faint'));
  ctx.out(blank());
};

/** Print a transferable code for the current run. */
const save: Command['run'] = (_a, ctx) => {
  const code = exportSave();
  ctx.out(blank());
  ctx.out(line('  save code — paste into `load` on any machine:', 'line--info'));
  ctx.out(blank());
  const box = document.createElement('div');
  box.className = 'line';
  box.style.wordBreak = 'break-all';
  box.append(raw(`<span style="color:var(--amber)">${code}</span>`));
  ctx.out(box);
  ctx.out(blank());
  if (!isPersistent()) {
    ctx.out(line('  storage is blocked here, so this code is the only copy — keep it.', 'line--warn'));
  }
  ctx.out(blank());
};

/** Load a run from a code produced by `save`. */
const load: Command['run'] = (args, ctx) => {
  const code = args.join(' ').trim();
  if (!code) {
    ctx.out(line('load: paste a save code.  `save` prints one.', 'line--warn'));
    return;
  }
  const res = importSave(code);
  if (!res.ok) {
    ctx.out(line(`load: ${res.reason}`, 'line--err'));
    if (res.reason.includes('project list')) {
      ctx.out(line('  the run itself is fine — the showcase it was earned against is not.', 'line--faint'));
    } else {
      ctx.out(line('  codes are `${payload}.${checksum}` — copy the whole thing.', 'line--faint'));
    }
    return;
  }
  ctx.out(line(`  loaded — ${res.xp} xp restored.`, 'line--ok'));
  ctx.out(line('  `player` to see it.', 'line--faint'));
};

/** Wipe the run. */
const resetCmd: Command['run'] = (_a, ctx) => {
  resetProgress();
  ctx.out(line('  progress cleared. level 1, nothing scanned.', 'line--ok'));
  ctx.out(line('  `scan` pays again from here.', 'line--faint'));
};

export const REGISTRY: Command[] = [
  { name: 'start',   args: '',  group: 'system',    summary: 'new here? the guided path', run: start },
  { name: 'player',  args: '[handle]', group: 'community', summary: 'your run: xp, level, elements', run: player },
  { name: 'scan',    args: '[project]', group: 'community', summary: 'inspect a project (+15 xp, first time)', run: scan },
  { name: 'repo',    args: '[project]', group: 'navigate', summary: 'open a project source (+10 xp)', run: repo },
  { name: 'follow',  args: '<handle>', group: 'community', summary: 'follow a builder (+10 xp)', usage: 'follow <handle>', run: follow },
  { name: 'progress', args: '', group: 'system', summary: 'your raw numbers', run: progress },
  { name: 'save',    args: '', group: 'system',    summary: 'print a transferable save code', run: save },
  { name: 'load',    args: '<code>', group: 'system', summary: 'restore a run from a save code', usage: 'load <code>', run: load },
  { name: 'reset',   args: '', group: 'system',    summary: 'wipe the run and start over', run: resetCmd },
  { name: 'help',    args: '',  group: 'system',    summary: 'list every command', run: help },
  { name: 'whoami',  args: '',  group: 'community', summary: 'the operator behind this terminal', run: whoami },
  { name: 'members', args: '[stack|role]', group: 'community', summary: 'list builders, optionally filtered', run: members },
  { name: 'whois',   args: '<handle>', group: 'community', summary: 'full profile for one builder', usage: 'whois <handle>', run: whois },
  { name: 'bounties', args: '', group: 'community', summary: 'open bounties and deadlines', run: bounties },
  { name: 'showcase', args: '[filter]', group: 'community', summary: 'browse shipped projects', run: showcase },
  { name: 'open',    args: '<project>', group: 'navigate', summary: 'open one project', usage: 'open <project>', run: open },
  { name: 'visit',   args: '<project>', group: 'navigate', summary: 'open a project live site in a new tab', usage: 'visit <project>', run: visit },
  { name: 'cat',     args: '<bounties|about|manifesto>', group: 'navigate', summary: 'read a document', usage: 'cat <file>', run: cat },
  { name: 'about',   args: '', group: 'navigate', summary: 'what Kracked Devs is', run: (a, ctx) => cat(['about'], ctx) },
  { name: 'manifesto', args: '', group: 'navigate', summary: 'the six rules builders ship by', run: (a, ctx) => cat(['manifesto'], ctx) },
  { name: 'attach',  args: '', group: 'navigate', summary: 'enter the community topology layer', run: attach },
  { name: 'explore', args: '[project]', group: 'navigate', summary: 'walk the city; each building is a project', run: explore },
  { name: 'sky',     args: '[project]', group: 'navigate', summary: 'the projects as stars; rarity is brightness', run: sky },
  { name: 'join',    args: '', group: 'navigate', summary: 'how to become a builder', run: join },
  { name: 'stats',   args: '', group: 'system', summary: 'community numbers', run: stats },
  { name: 'clear',   args: '', group: 'system', summary: 'clear the screen', run: clear },
  { name: 'motd',    args: '', group: 'system', summary: 'message of the day', run: motd },
  { name: 'exit',    args: '', group: 'system', summary: 'attempt to leave', run: exit },
  { name: 'sudo',    args: '', group: 'fun', hidden: true, summary: 'elevate privileges', run: sudo },
  { name: 'rm',      args: '', group: 'fun', hidden: true, summary: 'remove files', run: rm },
  { name: 'vim',     args: '', group: 'fun', hidden: true, summary: 'open the editor', run: vim },
  { name: 'matrix',  args: '', group: 'fun', hidden: true, summary: 'follow the white rabbit', run: matrix },
  { name: '.join',   args: '', group: 'fun', hidden: true, summary: 'internal join helper', run: dotjoin },
];

export const COMMAND_NAMES = REGISTRY.map((c) => c.name);

export { banner, boot };