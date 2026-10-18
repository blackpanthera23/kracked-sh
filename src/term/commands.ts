/**
 * Command registry. Each command is a small pure-ish function over Ctx.
 */

import { COMMUNITY, MEMBERS, BOUNTIES, PROJECTS, Member, Project } from '../data';
import type { Command, Ctx } from './shell';
import { line, blank, kv, table, pwrBar, tag, card, link, raw } from './output';

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
  ctx.out(line('  Tip: press Tab to complete, ↑/↓ to recall. Try `attach`.', 'line--faint'));
};

const whoami: Command['run'] = (_a, ctx) => {
  const me = MEMBERS[0];
  ctx.out(blank());
  ctx.out(card(
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
  ctx.out(card(`${m.name}  ·  @${m.handle}`, `${m.role}  ·  ${m.status}`, m.bio));
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
  ctx.out(card(b.title, `${b.id}  ·  ${b.reward}  ·  ${b.slots} winner${b.slots > 1 ? 's' : ''}  ·  closes ${b.deadline}`, b.brief));
  const tags = document.createElement('div');
  tags.className = 'line';
  b.tags.forEach((t) => tags.append(tag(t)));
  ctx.out(tags);
}

async function about(ctx: Ctx): Promise<void> {
  ctx.out(blank());
  ctx.out(card(
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

const showcase: Command['run'] = (args, ctx) => {
  const filter = args[0]?.toLowerCase();
  const rows = filter
    ? PROJECTS.filter((p) =>
        p.title.toLowerCase().includes(filter) ||
        p.author.toLowerCase().includes(filter) ||
        p.stack.some((s) => s.toLowerCase().includes(filter)),
      )
    : PROJECTS;
  if (!rows.length) {
    ctx.out(line(`showcase: nothing matching "${args[0]}"`, 'line--warn'));
    return;
  }
  ctx.out(blank());
  ctx.out(line(`  ${rows.length} of ${COMMUNITY.projects} projects`, 'line--faint'));
  ctx.out(blank());
  ctx.out(table<Project>(rows, [
    { head: 'project', cell: (p) => p.title },
    { head: 'by', cell: (p) => `@${p.author}`, muted: true },
    { head: 'pwr', num: true, cell: (p) => String(p.pwr) },
    { head: 'votes', num: true, cell: (p) => String(p.votes) },
    { head: 'stack', cell: (p) => p.stack.slice(0, 3).join(' · '), muted: true },
    { head: 'tags', cell: (p) => p.tags.join(' · '), muted: true },
  ]));
  ctx.out(line('  `open <title|author>` to jump to one.', 'line--faint'));
};

const open: Command['run'] = (args, ctx) => {
  const q = args.join(' ').toLowerCase();
  if (!q) {
    ctx.out(line('open: which project?  try `showcase`', 'line--warn'));
    return;
  }
  const p = PROJECTS.find(
    (x) => x.slug === q || x.title.toLowerCase() === q || x.author.toLowerCase() === q || x.title.toLowerCase().includes(q),
  );
  if (!p) {
    ctx.out(line(`open: no project matching "${args.join(' ')}"`, 'line--err'));
    ctx.out(line('  try `showcase` for the list.', 'line--faint'));
    return;
  }
  ctx.out(blank());
  ctx.out(card(p.title, `by @${p.author}  ·  ${p.pwr} pwr  ·  ${p.votes} vote${p.votes === 1 ? '' : 's'}  ·  shipped ${p.shipped}`, p.oneLiner));
  ctx.out(kv([['stack', p.stack.join(', ')]]));
  const tags = document.createElement('div');
  tags.className = 'line';
  p.tags.forEach((t) => tags.append(tag(t)));
  ctx.out(tags);
  const lk = document.createElement('div');
  lk.className = 'line';
  lk.append(link('open on krackeddevs.com', `${COMMUNITY.showcase}`));
  ctx.out(lk);
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

const join: Command['run'] = async (_a, ctx) => {
  ctx.out(blank());
  ctx.out(line('  kracked.sh — joining the community', 'line--info'));
  ctx.out(blank());
  ctx.out(line('  You need an account to ship. Two ways in:', 'line--dim'));
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

export const REGISTRY: Command[] = [
  { name: 'help',    args: '',  group: 'system',    summary: 'list every command', run: help },
  { name: 'whoami',  args: '',  group: 'community', summary: 'the operator behind this terminal', run: whoami },
  { name: 'members', args: '[stack|role]', group: 'community', summary: 'list builders, optionally filtered', run: members },
  { name: 'whois',   args: '<handle>', group: 'community', summary: 'full profile for one builder', usage: 'whois <handle>', run: whois },
  { name: 'bounties', args: '', group: 'community', summary: 'open bounties and deadlines', run: bounties },
  { name: 'showcase', args: '[filter]', group: 'community', summary: 'browse shipped projects', run: showcase },
  { name: 'open',    args: '<project>', group: 'navigate', summary: 'open one project', usage: 'open <project>', run: open },
  { name: 'cat',     args: '<bounties|about|manifesto>', group: 'navigate', summary: 'read a document', usage: 'cat <file>', run: cat },
  { name: 'about',   args: '', group: 'navigate', summary: 'what Kracked Devs is', run: (a, ctx) => cat(['about'], ctx) },
  { name: 'manifesto', args: '', group: 'navigate', summary: 'the six rules builders ship by', run: (a, ctx) => cat(['manifesto'], ctx) },
  { name: 'attach',  args: '', group: 'navigate', summary: 'enter the community topology layer', run: attach },
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