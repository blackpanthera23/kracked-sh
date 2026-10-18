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
import { line, blank, echo, raw } from './term/output';
import { MEMBERS } from './data';

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
const history = new History();
let graph: Graph | null = null;
function setBusy(on: boolean): void {
  statusL.classList.toggle('busy', on);
}

/* ---------------------------------------------------------------- output --- */

function atBottom(): boolean {
  return screen.scrollHeight - screen.scrollTop - screen.clientHeight < 60;
}

function append(node: HTMLElement): void {
  const stick = atBottom();
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
      input.focus();
    }
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
  await execute(src);
  setBusy(false);
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

input.addEventListener('keydown', (e) => {
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
    if (graph?.isRunning) {
      e.preventDefault();
      ctx.attach(false);
      append(line('  detached from topology.', 'line--dim'));
      ctx.status('ready');
    }
    return;
  }
});

// clicking anywhere in the scrollback refocuses the prompt
screen.addEventListener('click', () => {
  if (!graph?.isRunning) input.focus();
});

screen.addEventListener('scroll', () => {
  if (document.activeElement === input) return;
  if (screen.scrollTop + screen.clientHeight < screen.scrollHeight - 4) return;
  input.focus({ preventScroll: true });
});

/* ------------------------------------------------------------- idle demo --- */

let idleTimer = 0;
const DEMO: string[] = ['help', 'stats', 'showcase', 'attach'];

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(runDemo, 9000);
}

async function runDemo() {
  if (input.value.trim()) return;
  ctx.status('demo', false);
  append(blank());
  append(line('  ── idle demo ──', 'line--faint'));

  for (const cmd of DEMO) {
    await sleep(650);
    // type it out
    for (let i = 1; i <= cmd.length; i++) {
      input.value = cmd.slice(0, i);
      syncCaret();
      await sleep(55);
    }
    await sleep(220);
    input.value = '';
    syncCaret();
    await execute(cmd);
    if (cmd === 'attach') break;
  }
  ctx.status('ready');
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
    `<span style="color:var(--green)">attach</span>` +
    `<span style="color:var(--fg-faint)"> to see the community map.</span>`,
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