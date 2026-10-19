/**
 * kracked.sh — entry point.
 *
 * Wires the DOM to the shell: boot sequence, input handling, completion,
 * history, the attach layer toggle and an idle demo loop so a visitor who
 * types nothing still sees the page work.
 */

import './style.css';
import { REGISTRY, COMMAND_NAMES, banner, boot } from './term/commands';
import { tokenize, History, type Ctx } from './term/shell';
import { Graph } from './term/graph';
import { City, type Building } from './term/city';
import { line, blank, echo, raw, cmdRow } from './term/output';
import { MEMBERS } from './data';
import { countCmd, setProjectTable, setDemoMode } from './term/progress';
import { SHOWCASE } from './showcase';

// the persisted run stores indices into this table, so install it before any
// command runs — progress.ts hydrates itself from localStorage at this point
setProjectTable(SHOWCASE.map((p) => p.id));

const screen  = document.getElementById('screen')!;
const form    = document.getElementById('promptForm') as HTMLFormElement;
const input   = document.getElementById('cmd') as HTMLInputElement;
const caret   = document.getElementById('caret')!;
const statusEl = document.getElementById('status')!;
const statusL  = document.getElementById('statusL')!;
const clockEl  = document.getElementById('clock')!;
const cwdEl    = document.getElementById('cwd')!;
const termEl   = document.getElementById('term')!;
const graphEl  = document.getElementById('graph')!;
const tipEl    = document.getElementById('graphTip')!;
const cityEl   = document.getElementById('city')!;
const cityMap  = document.getElementById('cityMap')!;
const cityWhere = document.getElementById('cityWhere')!;
const history = new History();
let graph: Graph | null = null;
let city: City | null = null;
/** Set while the city is entering a project, so the shell does not double-report. */
let cityEntering = false;
function setBusy(on: boolean): void {
  statusL.classList.toggle('busy', on);
}

/** Titles come from the live site, so never interpolate them as markup. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

/* ---------------------------------------------------------------- output --- */

function atBottom(): boolean {
  return screen.scrollHeight - screen.scrollTop - screen.clientHeight < 60;
}

/**
 * Set when the visitor acts on purpose — typing a command, clicking a chip.
 * That intent outranks "were we already at the bottom?": the reply to an action
 * is what they asked for, so the view follows it down. A visitor who has
 * scrolled up to read is never yanked mid-read, because only an action sets it.
 */
let anchor = false;

/** Follow the output to the bottom on the next frames, until the layout settles. */
function anchorToBottom(): void {
  anchor = true;
  const settle = (frames: number) => {
    if (frames <= 0) return;
    screen.scrollTop = screen.scrollHeight;
    requestAnimationFrame(() => settle(frames - 1));
  };
  settle(4);
}

function append(node: HTMLElement): void {
  const stick = anchor || atBottom();
  screen.append(node);
  if (stick) screen.scrollTop = screen.scrollHeight;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ctx: Ctx = {
  out: append,
  async write(node) {
    append(node);
    await sleep(40);
  },
  sleep,
  status(text, busy = false) {
    statusEl.textContent = text;
    statusL.classList.toggle('busy', busy);
  },
  cwd(path) {
    cwdEl.textContent = path;
  },
  attach(on) {
    graphEl.classList.toggle('graph--on', on);
    termEl.classList.toggle('term--detached', on);
    if (on) {
      graph ??= new Graph(
        document.getElementById('graphCanvas') as HTMLCanvasElement,
        (m) => {
          if (!m) {
            tipEl.innerHTML = '';
            return;
          }
          tipEl.innerHTML =
            `<b>@${m.handle}</b> · ${m.role}<br>` +
            `${m.stack.join(' · ')} · ${m.pwr} pwr<br>` +
            `<span style="color:var(--fg-dim)">${m.bio}</span>`;
        },
      );
      graph.start();
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__graph = graph;
    } else {
      graph?.stop();
      // term still carries .term--detached at this point, and focusing a
      // visibility:hidden input is a silent no-op — wait for the style flush
      requestAnimationFrame(() => input.focus());
    }
  },
  explore(id) {
    cityEl.classList.add('city--on');
    termEl.classList.add('term--detached');
    city ??= new City(
      cityMap,
      (b) => {
        if (!b) {
          cityWhere.innerHTML = '<span class="city__cta">walk up to a building and press Enter, or tap a spot to walk there</span>';
          return;
        }
        cityWhere.innerHTML =
          `<b>${escapeHtml(b.title)}</b> <span class="city__meta">by @${escapeHtml(b.author)}</span><br>` +
          `<span class="city__cta">press Enter to go inside</span>`;
      },
      (b) => {
        // leave the city and run the normal card, so there is one source of truth
        cityExit();
        void submit(`open ${b.id}`);
      },
    );
    city.start();
    if (id) city.walkTo(id);
    // exposed so the world can be inspected from the console / tests, like __graph
    (window as unknown as Record<string, unknown>).__city = city;
  },
  clear() {
    screen.replaceChildren();
  },
  async run(command) {
    input.value = command;
    syncCaret();
    await submit(command);
  },
  width() {
    const ch = 8.4; // approx advance of JetBrains Mono at 15px
    return Math.max(40, Math.floor(screen.clientWidth / ch));
  },
};

/* --------------------------------------------------------------- execute --- */

/** Levenshtein distance, capped — used only for "did you mean". */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...new Array<number>(n)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Command names within a sensible edit distance, closest first, at most three. */
function nearest(name: string): string[] {
  const max = name.length <= 3 ? 1 : name.length <= 5 ? 2 : 3;
  return COMMAND_NAMES
    .filter((n) => n.startsWith('.') === name.startsWith('.'))
    .map((n) => [n, editDistance(name, n)] as const)
    .filter(([, d]) => d <= max)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([n]) => n);
}

async function execute(rawInput: string): Promise<void> {
  const src = rawInput.trim();
  if (!src) return;

  append(echo(src));
  history.push(src);
  countCmd();

  const [name, ...args] = tokenize(src);
  const cmd = REGISTRY.find((c) => c.name === name);

  if (!cmd) {
    append(line(`kracked.sh: command not found: ${name}`, 'line--err'));
    const near = nearest(name);
    if (near.length) append(line(`  did you mean: ${near.join(', ')}?`, 'line--faint'));
    else append(line('  type `help` for the list.', 'line--faint'));
    return;
  }

  ctx.status(`${cmd.name}…`, true);
  try {
    await cmd.run(args, ctx);
  } catch (err) {
    append(line(`  ✗ ${(err as Error).message}`, 'line--err'));
  } finally {
    if (!graph?.isRunning) ctx.status('ready');
  }
}

async function submit(rawInput: string) {
  const src = rawInput.trim();
  input.value = '';
  syncCaret();
  resetIdle();
  if (!src) {
    append(echo(''));
    return;
  }
  setBusy(true);
  // the visitor asked for this, so keep the answer in view
  anchorToBottom();
  await execute(src);
  setBusy(false);
  scheduleNudge();
}

/* ----------------------------------------------------------------- input --- */

function syncCaret() {
  // measure rendered width of the current value in the input's own font
  const cs = getComputedStyle(input);
  const probe = document.createElement('span');
  probe.style.font = cs.font;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'pre';
  probe.textContent = input.value;
  document.body.append(probe);
  caret.style.transform = `translateX(${probe.getBoundingClientRect().width}px)`;
  probe.remove();
}

function complete(): void {
  const value = input.value;
  const parts = value.split(/\s+/);
  if (parts.length <= 1) {
    const prefix = parts[0] ?? '';
    const matches = COMMAND_NAMES.filter((n) => n.startsWith(prefix));
    if (matches.length === 1) {
      input.value = matches[0] + ' ';
      syncCaret();
    } else if (matches.length > 1) {
      append(echo(value));
      append(raw(`<span style="color:var(--fg-dim)">${matches.join('   ')}</span>`));
    }
    return;
  }
  const previous = parts[parts.length - 2];
  const stem = parts[parts.length - 1];
  const pools: Record<string, string[]> = {
    whois: MEMBERS.map((m) => m.handle),
    open: MEMBERS.map((m) => m.handle),
    cat: ['bounties', 'about', 'manifesto'],
  };
  const pool = pools[previous];
  if (!pool) return;
  const hits = pool.filter((p) => p.startsWith(stem));
  if (hits.length === 1) {
    parts[parts.length - 1] = hits[0];
    input.value = parts.join(' ');
    syncCaret();
  } else if (hits.length > 1) {
    append(raw(`<span style="color:var(--fg-dim)">${hits.join('   ')}</span>`));
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void submit(input.value);
});

input.addEventListener('input', syncCaret);

/* While attached the prompt is visibility:hidden, so it cannot receive keys.
   Listen on the document instead, or Ctrl+C / Escape become a dead zone. */
function detachFromTopology(why: string): void {
  if (!graph?.isRunning) return;
  ctx.attach(false);
  append(line(`  detached from topology (${why}).`, 'line--dim'));
  ctx.status('ready');
}

document.addEventListener('keydown', (e) => {
  if (!graph?.isRunning) return;
  if (e.key === 'Escape' || (e.ctrlKey && (e.key === 'c' || e.key === 'C'))) {
    e.preventDefault();
    detachFromTopology(e.key === 'Escape' ? 'Esc' : 'Ctrl+C');
  }
});

/* The city owns the keyboard while it is up. Movement keys must not reach the
   hidden prompt, and Escape leaves. Everything else falls through. */
function cityExit(why?: string): void {
  if (!city?.isRunning) return;
  city.stop();
  cityEl.classList.remove('city--on');
  termEl.classList.remove('term--detached');
  if (why) append(line(`  left the city (${why}).`, 'line--dim'));
  ctx.status('ready');
  requestAnimationFrame(() => input.focus());
}

document.addEventListener('keydown', (e) => {
  if (!city?.isRunning) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    cityExit('Esc');
    return;
  }
  if (city.handleKey(e)) {
    e.preventDefault();
    if (e.key === 'Enter' || e.key === ' ') ctx.status('walking');
    const p = city.position;
    ctx.cwd(`city ${p.x},${p.y}`);
    return;
  }
});

document.addEventListener('keyup', (e) => {
  city?.handleKeyUp(e);
});

/* The city is a <pre>, so a click lands on a character, not a tile. Convert the
   pixel offset into a grid cell and walk there — the only way to move on a
   touchscreen, and the easiest way with a mouse. */
cityMap.addEventListener('click', (e) => {
  if (!city?.isRunning) return;
  const map = cityMap;
  const probe = document.createElement('span');
  probe.textContent = '0';
  map.appendChild(probe);
  const charW = probe.getBoundingClientRect().width;
  probe.remove();
  const lineH = map.getBoundingClientRect().height / (city.height + 0.5);
  if (!charW || !lineH) return;

  const rect = map.getBoundingClientRect();
  const cs = getComputedStyle(map);
  const padX = parseFloat(cs.paddingLeft) || 0;
  const padY = parseFloat(cs.paddingTop) || 0;
  const cellX = Math.floor((e.clientX - rect.left - padX) / charW);
  const cellY = Math.floor((e.clientY - rect.top - padY) / lineH);
  // the first `pad` columns are the row number, plus one space
  const gutter = String(city.width).length + 1;
  city.tapTo(cellX - gutter, cellY);
  e.preventDefault();
});

// clicking the canvas also detaches — the obvious thing to try
document.getElementById('graph')?.addEventListener('click', () => detachFromTopology('click'));

/* Clickable commands in the scrollback: any element carrying data-cmd runs
   that command in the prompt. Keeps the terminal the single source of truth. */
screen.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-cmd]');
  if (!btn || graph?.isRunning) return;
  e.preventDefault();
  cancelDemo();
  const cmd = btn.dataset.cmd ?? '';
  if (!cmd) return;
  // the chip is what they clicked, so the answer belongs on screen
  anchorToBottom();
  input.focus();
  void ctx.run(cmd);
});

input.addEventListener('keydown', (e) => {
  // any real keypress hands control back to the visitor
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) cancelDemo();
  resetIdle();

  if (e.key === 'Tab') {
    e.preventDefault();
    complete();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const v = history.step(-1);
    if (v !== null) { input.value = v; syncCaret(); }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const v = history.step(1);
    if (v !== null) { input.value = v; syncCaret(); }
    return;
  }
  if (e.ctrlKey && e.key === 'l') {
    e.preventDefault();
    ctx.clear();
    return;
  }
  if (e.ctrlKey && e.key === 'c') {
    detachFromTopology('Ctrl+C');
    return;
  }
});

// clicking anywhere in the scrollback refocuses the prompt
screen.addEventListener('click', () => {
  if (!graph?.isRunning) input.focus();
});

screen.addEventListener('scroll', () => {
  // scrolling up to read is the visitor saying "stop following"
  if (!atBottom()) anchor = false;
  if (document.activeElement === input) return;
  if (screen.scrollTop + screen.clientHeight < screen.scrollHeight - 4) return;
  input.focus({ preventScroll: true });
});

/* ------------------------------------------------------------- idle demo --- */

let idleTimer = 0;
const DEMO: string[] = ['start', 'scan', 'player'];
let demoRunning = false;

function resetIdle() {
  clearTimeout(idleTimer);
  if (demoRunning) return;
  idleTimer = window.setTimeout(runDemo, 14000);
}

/** Abort an in-flight demo the moment the visitor touches the keyboard. */
function cancelDemo(): void {
  clearTimeout(nudgeTimer);
  if (!demoRunning) return;
  demoRunning = false;
  clearTimeout(idleTimer);
  input.value = '';
  syncCaret();
  ctx.status('ready');
}

async function runDemo() {
  if (demoRunning || input.value.trim() || graph?.isRunning) return;
  demoRunning = true;
  // the walkthrough is a preview: it must never credit the visitor's run
  setDemoMode(true);
  ctx.status('demo', false);
  try {
    append(blank());
    append(line('  ── idle demo (type anything to take over) ──', 'line--faint'));

    for (const cmd of DEMO) {
      await sleep(650);
      if (!demoRunning) return;
      // type it out
      for (let i = 1; i <= cmd.length; i++) {
        if (!demoRunning) { input.value = ''; syncCaret(); return; }
        input.value = cmd.slice(0, i);
        syncCaret();
        await sleep(55);
      }
      await sleep(220);
      if (!demoRunning) { input.value = ''; syncCaret(); return; }
      input.value = '';
      syncCaret();
      await execute(cmd);
      if (cmd === 'start') {
        // continuity: leave a way into the topology right where the eye lands
        append(blank());
        append(suggestRow());
      }
    }
  } finally {
    // never leave the run suppressed, however the demo exits
    setDemoMode(false);
    demoRunning = false;
    ctx.status('ready');
  }
}

/* --------------------------------------------------------- suggestions --- */

/** One-click nudge into the topology. Replaced, never duplicated. */
let suggestEl: HTMLElement | null = null;

function suggestRow(): HTMLElement {
  suggestEl?.remove();
  const row = cmdRow('  try this:', [
    ['scan a random project', 'scan'],
    ['your player card', 'player'],
  ]);
  suggestEl = row;
  return row;
}

/** After the visitor has sat with the output for a while, offer the next click. */
let nudgeTimer = 0;
function scheduleNudge(): void {
  clearTimeout(nudgeTimer);
  nudgeTimer = window.setTimeout(() => {
    if (demoRunning || graph?.isRunning || input.value.trim()) return;
    if (document.querySelector('.suggest')) return;
    append(blank());
    const row = cmdRow('  where to?', [
      ['attach', 'attach'],
      ['showcase', 'showcase'],
      ['bounties', 'bounties'],
    ]);
    row.classList.add('suggest');
    append(row);
  }, 6000);
}

/* --------------------------------------------------------------- start-up --- */

function tick() {
  const d = new Date();
  clockEl.textContent = d.toLocaleTimeString('en-GB');
}

async function start() {
  tick();
  setInterval(tick, 1000);

  append(banner());
  append(raw(
    `<span style="color:var(--fg-dim)">  ${'kracked.sh'.padEnd(12)}</span>` +
    `<span style="color:var(--fg-faint)">community shell · v0.1.0 · English build</span>`,
  ));
  append(raw(
    `<span style="color:var(--fg-faint)">  type </span>` +
    `<span style="color:var(--green)">help</span>` +
    `<span style="color:var(--fg-faint)"> to start, or </span>` +
    `<span style="color:var(--green)">player</span>` +
    `<span style="color:var(--fg-faint)"> for your run, or </span>` +
    `<span style="color:var(--green)">attach</span>` +
    `<span style="color:var(--fg-faint)"> to see the map.</span>`,
  ));
  append(blank());

  await boot(ctx);
  append(blank());
  await ctx.run('motd');

  input.focus();
  resetIdle();

  // keep the terminal focused when the tab regains visibility
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !graph?.isRunning) input.focus();
  });
}

void start();