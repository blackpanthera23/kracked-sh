/**
 * Output primitives. Everything the shell prints goes through here so the
 * DOM stays uniform and the CSS primitives stay the single source of styling.
 */

export type Node = HTMLElement;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** A plain line. */
export function line(text = '', mod: string = ''): Node {
  return el('div', `line${mod ? ' ' + mod : ''}`, text);
}

/** Blank spacer line. */
export function blank(): Node {
  return el('div', 'line line--spaced');
}

/** Echo of a submitted command, rendered with the prompt prefix. */
export function echo(cmd: string): Node {
  const wrap = el('div', 'ln');
  wrap.append(
    el('span', 'echo-ps1', 'visit@kracked.sh:~$'),
    el('span', 'echo-cmd', cmd),
  );
  return wrap;
}

/** Raw HTML — only ever used with strings we author ourselves. */
export function raw(html: string): Node {
  const n = el('div', 'line');
  n.innerHTML = html;
  return n;
}

/** Key/value block. */
export function kv(pairs: [string, string][]): Node {
  const wrap = el('div', 'kv');
  for (const [k, v] of pairs) {
    wrap.append(el('span', 'kv__k', k), el('span', 'kv__v', v));
  }
  return wrap;
}

export interface Column<T> {
  head: string;
  num?: boolean;
  muted?: boolean;
  /** Return a string, or a prebuilt node for richer cells. */
  cell: (row: T) => string | Node;
}

/** Table with optional rich cells. */
export function table<T>(rows: T[], cols: Column<T>[]): Node {
  const t = el('table', 'tbl');
  const thead = el('thead');
  const htr = el('tr');
  for (const c of cols) htr.append(el('th', c.num ? 'num' : '', c.head));
  thead.append(htr);

  const tbody = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    for (const c of cols) {
      const td = el('td', [c.num ? 'num' : '', c.muted ? 'muted' : ''].filter(Boolean).join(' '));
      const v = c.cell(r);
      if (typeof v === 'string') td.textContent = v;
      else td.append(v);
      tr.append(td);
    }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

/** Horizontal power meter, 20 blocks at 10 pwr each. */
export function pwrBar(pwr: number, blocks = 20): Node {
  const wrap = el('span', 'bar');
  const filled = Math.max(1, Math.round((pwr / 200) * blocks));
  for (let i = 0; i < blocks; i++) {
    const b = el('i', i < filled ? (i >= blocks * 0.75 ? 'hot' : 'on') : '');
    wrap.append(b);
  }
  return wrap;
}

export function tag(text: string, kind: '' | 'ok' | 'hot' = ''): Node {
  return el('span', `tag${kind ? ' tag--' + kind : ''}`, text);
}

export function card(title: string, meta: string, body: string): Node {
  const c = el('div', 'card');
  c.append(el('p', 'card__title', title), el('p', 'card__meta', meta), el('p', 'card__body', body));
  return c;
}

export function link(label: string, href: string): Node {
  const a = el('a', '', label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * A clickable command. Renders as `label` and, on click, types and runs
 * `command` in the prompt — so the terminal stays the only surface.
 * The command is carried in a data attribute; main.ts delegates the click.
 */
export function cmdLink(label: string, command: string, kind: '' | 'ghost' = ''): Node {
  const b = el('button', `cmd${kind ? ' cmd--' + kind : ''}`, label);
  b.type = 'button';
  b.dataset.cmd = command;
  b.title = `run: ${command}`;
  return b;
}

/** Inline row of clickable commands, with an optional leading label. */
export function cmdRow(label: string, commands: [string, string][]): Node {
  const wrap = el('div', 'cmdrow');
  if (label) wrap.append(el('span', 'cmdrow__label', label));
  for (const [text, command] of commands) wrap.append(cmdLink(text, command));
  return wrap;
}

/** Progress bar used by the boot sequence. Returns the fill element to animate. */
export function progress(): { node: Node; fill: Node } {
  const wrap = el('span', 'prog');
  const fill = el('i');
  wrap.append(fill);
  return { node: wrap, fill };
}