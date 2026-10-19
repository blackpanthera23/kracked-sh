/**
 * The visual browser: Projects, Builders and About, inside the same frame the
 * terminal lives in.
 *
 * Everything shown comes from the generated snapshot: SHOWCASE for the projects,
 * the authors of those projects for the builders, SHOWCASE_IMAGES for the
 * screenshots. Nothing is fetched at runtime and every string from the snapshot
 * goes in as text, never markup; every URL is checked to be http(s) first.
 *
 * Search, pagination and scroll stay in this instance while the terminal is
 * visible. Navigation reports the active section to the frame header.
 */

import { SHOWCASE, type ShowcaseProject } from './showcase';
import { SHOWCASE_IMAGES } from './showcase-images';
import { COMMUNITY } from './data';
import { award } from './term/progress';

export type Tab = 'projects' | 'builders' | 'about';
export const TABS: readonly Tab[] = ['projects', 'builders', 'about'];

export interface BrowseState {
  tab: Tab;
  /** Free-text project search. */
  q: string;
  /** Exact author handle the project list is narrowed to, or ''. */
  by: string;
}

export interface Builder {
  handle: string;
  projects: number;
  /** Highest level the site reports for this author across their rows. */
  level: number;
}

export interface BrowseOptions {
  root: HTMLElement;
  /** Report browser navigation to the frame header. */
  onChange: (state: BrowseState, push: boolean) => void;
}

const PROJECT_PAGE = 24;
const BUILDER_PAGE = 48;

/** Canonical page for a project on the real site. */
export const projectUrl = (id: string): string => `${COMMUNITY.showcase}/project/${id}`;

/** An absolute http(s) URL, or '' — snapshot data never reaches an href unchecked. */
export function safeUrl(v: string | undefined): string {
  if (!v) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Every author in the snapshot, most projects first. */
export const BUILDERS: readonly Builder[] = (() => {
  const by = new Map<string, Builder>();
  for (const p of SHOWCASE) {
    const b = by.get(p.author);
    if (b) {
      b.projects++;
      b.level = Math.max(b.level, p.level);
    } else {
      by.set(p.author, { handle: p.author, projects: 1, level: p.level });
    }
  }
  return [...by.values()].sort((a, b) => b.projects - a.projects || a.handle.localeCompare(b.handle));
})();

/** Lowercased haystack per project, built once. */
const HAY = new Map<string, string>(
  SHOWCASE.map((p) => [p.id, [p.title, p.author, p.oneLiner, ...p.stack].join(' ').toLowerCase()]),
);

function tokens(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map((t) => t.replace(/^@/, '')).filter(Boolean);
}

/** Projects matching a query and builder filter, in snapshot order. */
export function filterProjects(q: string, by: string): ShowcaseProject[] {
  const words = tokens(q);
  return SHOWCASE.filter((p) => {
    if (by && p.author !== by) return false;
    if (!words.length) return true;
    const hay = HAY.get(p.id) ?? '';
    return words.every((w) => hay.includes(w));
  });
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function outLink(label: string, href: string, cls: string, aria: string): HTMLAnchorElement {
  const a = el('a', cls, label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', aria);
  return a;
}

export class Browser {
  private o: BrowseOptions;
  private st: BrowseState = { tab: 'projects', q: '', by: '' };
  private tabs: HTMLButtonElement[];
  private panels: Record<Tab, HTMLElement>;
  private scroller: HTMLElement;
  private scrollTops: Record<Tab, number> = { projects: 0, builders: 0, about: 0 };

  private q: HTMLInputElement;
  private qClear: HTMLButtonElement;
  private count: HTMLElement;
  private chip: HTMLElement;
  private chipText: HTMLElement;
  private cards: HTMLElement;
  private more: HTMLButtonElement;
  private empty: HTMLElement;
  private list: ShowcaseProject[] = [];
  private shown = 0;

  private bq: HTMLInputElement;
  private bcount: HTMLElement;
  private blist: HTMLElement;
  private bmore: HTMLButtonElement;
  private bfiltered: readonly Builder[] = BUILDERS;
  private bshown = 0;

  private typingTimer = 0;

  constructor(o: BrowseOptions) {
    this.o = o;
    const q = <T extends HTMLElement>(sel: string): T => {
      const n = o.root.querySelector<T>(sel);
      if (!n) throw new Error(`browse: missing ${sel}`);
      return n;
    };
    this.tabs = [...o.root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    this.panels = {
      projects: q('[data-panel="projects"]'),
      builders: q('[data-panel="builders"]'),
      about: q('[data-panel="about"]'),
    };
    this.scroller = q('[data-browse="scroll"]');
    this.q = q<HTMLInputElement>('#projectSearch');
    this.qClear = q<HTMLButtonElement>('[data-browse="clear"]');
    this.count = q('[data-browse="count"]');
    this.chip = q('[data-browse="chip"]');
    this.chipText = q('[data-browse="chipText"]');
    this.cards = q('[data-browse="cards"]');
    this.more = q<HTMLButtonElement>('[data-browse="more"]');
    this.empty = q('[data-browse="empty"]');
    this.bq = q<HTMLInputElement>('#builderSearch');
    this.bcount = q('[data-browse="bcount"]');
    this.blist = q('[data-browse="builders"]');
    this.bmore = q<HTMLButtonElement>('[data-browse="bmore"]');

    for (const t of this.tabs) {
      t.addEventListener('click', () => this.go({ tab: t.dataset.tab as Tab }, true, true));
    }

    // search is ordinary: it filters as you type and Enter never navigates away
    q<HTMLFormElement>('[data-browse="searchForm"]').addEventListener('submit', (e) => {
      e.preventDefault();
      this.commitQuery();
    });
    this.q.addEventListener('input', () => {
      this.st.q = this.q.value;
      this.renderProjects();
      clearTimeout(this.typingTimer);
      this.typingTimer = window.setTimeout(() => this.o.onChange(this.state, false), 300);
    });
    this.qClear.addEventListener('click', () => {
      this.q.value = '';
      this.go({ q: '' }, false);
      this.q.focus();
    });
    q<HTMLButtonElement>('[data-browse="chipClear"]').addEventListener('click', () => {
      this.go({ by: '' }, true);
      this.q.focus({ preventScroll: true });
    });
    q<HTMLButtonElement>('[data-browse="emptyClear"]').addEventListener('click', () => {
      this.q.value = '';
      this.go({ q: '', by: '' }, true);
      this.q.focus();
    });
    this.more.addEventListener('click', () => this.moreProjects());

    q<HTMLFormElement>('[data-browse="builderForm"]').addEventListener('submit', (e) => e.preventDefault());
    this.bq.addEventListener('input', () => this.renderBuilders());
    this.bmore.addEventListener('click', () => this.moreBuilders());

    // a builder's name, on a card or in the list, narrows the projects to them
    o.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-builder]');
      if (!b) return;
      e.preventDefault();
      this.showBuilder(b.dataset.builder ?? '');
    });
    // following a project out to its site or source counts toward the run, like `visit` and `repo`
    this.cards.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-award]');
      if (!a?.dataset.id) return;
      award(a.dataset.award === 'repo' ? 'repo' : 'visit', a.dataset.id);
    });

    this.fillStats();
    this.render();
  }

  /* ------------------------------------------------------------ public API */

  get state(): BrowseState {
    return { ...this.st };
  }


  /** Keyboard entry point: the current tab, never a text field. */
  focusEntry(): void {
    const t = this.tabs.find((x) => x.dataset.tab === this.st.tab);
    t?.focus({ preventScroll: true });
  }

  /** The list scroll is lost while the view is display:none; keep it per tab. */
  saveScroll(): void {
    this.scrollTops[this.st.tab] = this.scroller.scrollTop;
  }

  restoreScroll(): void {
    this.scroller.scrollTop = this.scrollTops[this.st.tab];
  }

  /** Narrow the projects to one builder and show them. */
  showBuilder(handle: string): void {
    if (!BUILDERS.some((b) => b.handle === handle)) return;
    this.q.value = '';
    this.go({ tab: 'projects', by: handle, q: '' }, true, true);
    this.scroller.scrollTop = 0;
  }

  /* ---------------------------------------------------------------- state */

  private go(patch: Partial<BrowseState>, push: boolean, focusTab = false): void {
    clearTimeout(this.typingTimer);
    const prevTab = this.st.tab;
    if (patch.tab && patch.tab !== prevTab) this.saveScroll();
    this.st = { ...this.st, ...patch };
    this.render();
    if (patch.tab && patch.tab !== prevTab) this.restoreScroll();
    if (focusTab) this.focusEntry();
    this.o.onChange(this.state, push);
  }

  /** Enter commits the current query immediately. */
  private commitQuery(): void {
    clearTimeout(this.typingTimer);
    this.st.q = this.q.value;
    this.o.onChange(this.state, true);
  }

  /* --------------------------------------------------------------- render */

  private render(): void {
    for (const t of this.tabs) {
      const on = t.dataset.tab === this.st.tab;
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    }
    for (const tab of TABS) this.panels[tab].hidden = tab !== this.st.tab;
    this.renderProjects();
    if (this.st.tab === 'builders' && !this.bshown) this.renderBuilders();
  }

  private renderProjects(): void {
    this.list = filterProjects(this.st.q, this.st.by);
    this.shown = 0;
    this.cards.replaceChildren();
    this.qClear.hidden = !this.st.q;

    const by = this.st.by;
    this.chip.hidden = !by;
    if (by) {
      const b = BUILDERS.find((x) => x.handle === by);
      this.chipText.textContent = `Projects by @${by} · ${plural(b?.projects ?? 0, 'project')}`;
    }

    this.empty.hidden = this.list.length > 0;
    this.appendProjects(PROJECT_PAGE);
  }

  private moreProjects(): void {
    const first = this.appendProjects(PROJECT_PAGE);
    // keep a keyboard user where the new cards start, not back at the button
    first?.focus({ preventScroll: false });
  }

  /** Add the next page of cards. Returns the first new card's title, for focus. */
  private appendProjects(n: number): HTMLElement | null {
    const next = this.list.slice(this.shown, this.shown + n);
    let first: HTMLElement | null = null;
    const frag = document.createDocumentFragment();
    for (const p of next) {
      const card = this.card(p);
      first ??= card.querySelector<HTMLElement>('.pcard__title');
      frag.append(card);
    }
    this.cards.append(frag);
    this.shown += next.length;
    this.syncCount();
    return first;
  }

  private syncCount(): void {
    const total = this.list.length;
    const left = total - this.shown;
    this.more.hidden = left <= 0;
    this.more.textContent = `Load ${Math.min(PROJECT_PAGE, left)} more`;
    this.more.setAttribute('aria-label', `Load more projects, ${plural(left, 'project')} not shown yet`);
    if (!total) {
      this.count.textContent = this.st.q
        ? `No projects match “${this.st.q.trim()}”${this.st.by ? ` by @${this.st.by}` : ''}.`
        : 'No projects.';
      return;
    }
    const scope = this.st.q.trim() ? ` matching “${this.st.q.trim()}”` : '';
    this.count.textContent = `Showing ${this.shown.toLocaleString()} of ${plural(total, 'project')}${scope}`;
  }

  private card(p: ShowcaseProject): HTMLElement {
    const li = el('li', 'pcard');
    const page = projectUrl(p.id);
    const site = safeUrl(p.site);
    const git = safeUrl(p.git);
    const shot = safeUrl(SHOWCASE_IMAGES[p.id]);

    const figure = el('div', 'pcard__shot');
    if (shot) {
      const img = el('img');
      img.src = shot;
      img.alt = `Screenshot of ${p.title}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = 640;
      img.height = 400;
      img.referrerPolicy = 'no-referrer';
      // a URL that no longer loads is no screenshot, and says so
      img.addEventListener('error', () => figure.replaceChildren(noShot('Screenshot unavailable')), { once: true });
      figure.append(img);
    } else {
      figure.append(noShot('No screenshot'));
    }

    const body = el('div', 'pcard__body');
    const title = el('h3', 'pcard__title', p.title);
    title.tabIndex = -1;
    const byline = el('p', 'pcard__by');
    const who = el('button', 'pcard__author', `@${p.author}`);
    who.type = 'button';
    who.dataset.builder = p.author;
    who.setAttribute('aria-label', `Show every project by @${p.author}`);
    byline.append(document.createTextNode('by '), who);
    body.append(title, byline);
    if (p.oneLiner) body.append(el('p', 'pcard__line', p.oneLiner));
    if (p.stack.length) {
      const stack = el('ul', 'pcard__stack');
      stack.setAttribute('aria-label', 'Stack');
      for (const s of p.stack) stack.append(el('li', '', s));
      body.append(stack);
    }

    const links = el('div', 'pcard__links');
    if (site) {
      const a = outLink('Visit ↗', site, 'btn btn--primary btn--sm', `Visit ${p.title} (opens in a new tab)`);
      a.dataset.award = 'visit';
      a.dataset.id = p.id;
      links.append(a);
    }
    if (git) {
      const a = outLink('Source ↗', git, 'btn btn--sm', `Source code for ${p.title} (opens in a new tab)`);
      a.dataset.award = 'repo';
      a.dataset.id = p.id;
      links.append(a);
    }
    links.append(outLink('Showcase page ↗', page, 'btn btn--ghost btn--sm', `${p.title} on the Kracked Devs showcase (opens in a new tab)`));
    if (!site) links.append(el('span', 'pcard__nolive', 'no live site listed'));
    body.append(links);

    li.append(figure, body);
    return li;
  }

  private renderBuilders(): void {
    const words = tokens(this.bq.value);
    this.bfiltered = words.length
      ? BUILDERS.filter((b) => words.every((w) => b.handle.toLowerCase().includes(w)))
      : BUILDERS;
    this.bshown = 0;
    this.blist.replaceChildren();
    this.appendBuilders(BUILDER_PAGE);
  }

  private moreBuilders(): void {
    const first = this.appendBuilders(BUILDER_PAGE);
    first?.focus();
  }

  private appendBuilders(n: number): HTMLElement | null {
    const next = this.bfiltered.slice(this.bshown, this.bshown + n);
    let first: HTMLElement | null = null;
    const frag = document.createDocumentFragment();
    for (const b of next) {
      const li = el('li');
      const btn = el('button', 'builder');
      btn.type = 'button';
      btn.dataset.builder = b.handle;
      btn.setAttribute('aria-label', `@${b.handle}, ${plural(b.projects, 'project')}, level ${b.level}. Show their projects`);
      btn.append(
        el('span', 'builder__handle', `@${b.handle}`),
        el('span', 'builder__meta', `${plural(b.projects, 'project')} · level ${b.level}`),
      );
      first ??= btn;
      li.append(btn);
      frag.append(li);
    }
    this.blist.append(frag);
    this.bshown += next.length;
    const total = this.bfiltered.length;
    const left = total - this.bshown;
    this.bmore.hidden = left <= 0;
    this.bmore.textContent = `Load ${Math.min(BUILDER_PAGE, left)} more`;
    this.bmore.setAttribute('aria-label', `Load more builders, ${plural(left, 'builder')} not shown yet`);
    this.bcount.textContent = total
      ? `Showing ${this.bshown.toLocaleString()} of ${plural(total, 'builder')}${this.bq.value.trim() ? ` matching “${this.bq.value.trim()}”` : ''}`
      : `No builders match “${this.bq.value.trim()}”.`;
    return first;
  }

  /** Numbers on the welcome and About panels, counted from the snapshot itself. */
  private fillStats(): void {
    const stats: Record<string, number> = {
      projects: SHOWCASE.length,
      builders: BUILDERS.length,
      live: SHOWCASE.filter((p) => p.site).length,
      repos: SHOWCASE.filter((p) => p.git).length,
    };
    for (const n of document.querySelectorAll<HTMLElement>('[data-stat]')) {
      const v = stats[n.dataset.stat ?? ''];
      if (v != null) n.textContent = v.toLocaleString();
    }
    for (const n of document.querySelectorAll<HTMLElement>('[data-copy="tagline"]')) {
      n.textContent = COMMUNITY.tagline;
    }
  }
}

function noShot(text: string): HTMLElement {
  const n = el('div', 'pcard__noshot');
  n.append(el('span', '', text));
  return n;
}
