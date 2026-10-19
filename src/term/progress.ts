/**
 * Player progress — a small, persisted game layer over the terminal.
 *
 * The loop is exploration: every command that reads a *new* piece of the
 * community pays XP once. Repeat visits pay nothing, so the only way to level
 * is to actually go look at more of the showcase.
 *
 * XP sources (once per subject):
 *   scan  <project>  +15   inspected a project card for the first time
 *   visit <project>  +10   opened its live site
 *   repo  <project>  +10   opened its source
 *   bounty <id>      +25   read a bounty brief
 *   guild <handle>   +5    read a builder profile
 *   follow <handle>  +10   followed a builder
 *
 * Repeating any of the above on the same subject pays 0 and says so, so the
 * number on the card only moves when the player has genuinely seen something
 * new.
 *
 * Scoring is the site's own formula, unchanged:
 *   pwr   = xp + 100*shipped + 20*posts + 50*badges
 *   level = min(floor(sqrt(pwr/100)) + 1, 100)
 *   tier  = pwr >= 800 ? LEGENDARY : pwr >= 300 ? RARE : COMMON
 */

const KEY = 'kracked.sh/progress/v1';
const SAVE_VERSION = 2;

/**
 * Fingerprint of the project table a save was minted against.
 *
 * Scanned/visited/repoed are stored as indices into SHOWCASE, not ids, because
 * 535 UUIDs would not fit in a pasteable code. That makes the meaning of an index
 * depend on the exact table it was written against - and `npm run sync-showcase`
 * rebuilds that table, so a code from an older snapshot would silently point at
 * the wrong projects and credit the visitor for work they did not do.
 *
 * Stamping the table's length and a cheap hash lets `load` refuse such a code
 * outright. Length alone catches a sync that adds or drops projects; the hash
 * catches a reorder or an in-place edit that keeps the count.
 */
function tableFingerprint(ids: readonly string[]): string {
  let h = 5381;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  }
  return `${ids.length}-${h.toString(36)}`;
}

export interface Progress {
  xp: number;
  /** Project ids whose card has been opened. */
  scanned: string[];
  /** Project ids whose live site has been opened. */
  visited: string[];
  /** Project ids whose repo has been opened. */
  repoed: string[];
  /** Bounty ids whose brief has been read. */
  bounties: string[];
  /** Handles whose profile has been read. */
  guild: string[];
  /** Handles explicitly followed. */
  followed: string[];
  /** ISO date of the last command, for the daily streak. */
  lastDay: string;
  streak: number;
  /** Commands run this session (not persisted). */
  sessionCmds: number;
}

function empty(): Progress {
  return {
    xp: 0,
    scanned: [],
    visited: [],
    repoed: [],
    bounties: [],
    guild: [],
    followed: [],
    lastDay: '',
    streak: 0,
    sessionCmds: 0,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reject anything that is not shaped like a Progress, field by field. */
function coerce(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (typeof r.xp !== 'number' && !Array.isArray(r.scanned) && !Array.isArray(r.visited)) return null;
  return {
    xp: num(r.xp),
    scanned: strs(r.scanned),
    visited: strs(r.visited),
    repoed: strs(r.repoed),
    bounties: strs(r.bounties),
    guild: strs(r.guild),
    followed: strs(r.followed),
    lastDay: typeof r.lastDay === 'string' ? r.lastDay : '',
    streak: num(r.streak),
    sessionCmds: 0,
  };
}

let state: Progress = empty();

/** The compact wire form is the single storage format — same bytes as a save code. */
function packForDisk(): string {
  return JSON.stringify({
    v: SAVE_VERSION,
    x: state.xp,
    s: packRuns(packIds(state.scanned)),
    vi: packRuns(packIds(state.visited)),
    r: packRuns(packIds(state.repoed)),
    b: state.bounties,
    g: state.guild,
    f: state.followed,
    d: state.lastDay,
    k: state.streak,
    t: projectFingerprint,
  });
}

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed: unknown = JSON.parse(raw);
    // A record written against a different project table cannot be trusted any
    // more than a stale save code: its indices now name other projects. Start
    // clean rather than credit the visitor for work they never did.
    if (parsed && typeof parsed === 'object') {
      const r = parsed as Record<string, unknown>;
      if (typeof r.t === 'string' && r.t !== projectFingerprint) return empty();
      // an index-based record with no fingerprint predates this guard
      if (r.t === undefined && typeof r.s === 'string' && r.s) return empty();
    }
    // accept the current compact form, and the earlier unpacked id form
    return decodePacked(parsed) ?? coerce(parsed) ?? empty();
  } catch {
    return empty();
  }
}

function hydrate(): void {
  state = load();
}

function persist(): void {
  try {
    localStorage.setItem(KEY, packForDisk());
  } catch {
    // private mode / quota — the run still works, it just will not be remembered
  }
}

/** Where the seed for the demo starts from, so a fresh visitor sees a real card. */
export function snapshot(): Readonly<Progress> {
  return state;
}

/** True when localStorage accepted a write; false in Safari private mode. */
export function isPersistent(): boolean {
  try {
    localStorage.setItem(`${KEY}/probe`, '1');
    localStorage.removeItem(`${KEY}/probe`);
    return true;
  } catch {
    return false;
  }
}

export function reset(): void {
  state = empty();
  persist();
}

export type XpKind = 'scan' | 'visit' | 'repo' | 'bounty' | 'guild' | 'follow';

const WORTH: Record<XpKind, number> = {
  scan: 15,
  visit: 10,
  repo: 10,
  bounty: 25,
  guild: 5,
  follow: 10,
};

const FIELD: Record<XpKind, keyof Progress> = {
  scan: 'scanned',
  visit: 'visited',
  repo: 'repoed',
  bounty: 'bounties',
  guild: 'guild',
  follow: 'followed',
};

export interface Award {
  /** XP actually added this time (0 when the subject was already seen). */
  gained: number;
  /** True when this subject was new. */
  first: boolean;
  /** Level before and after, so the caller can celebrate a level-up. */
  levelBefore: number;
  levelAfter: number;
  streakContinued: boolean;
}

/**
 * Credit XP for looking at one subject. Idempotent per subject: the second
 * call for the same id or handle returns 0 and does not touch the save.
 *
 * While the idle demo is on screen nothing is credited — that walkthrough is a
 * preview, and a visitor who typed nothing has not explored anything.
 */
let demoMode = false;

/** Enter or leave demo mode. Awards are dropped while it is on. */
export function setDemoMode(on: boolean): void {
  demoMode = on;
}

export function award(kind: XpKind, subject: string): Award {
  const field = FIELD[kind];
  const bucket = state[field];
  const before = levelOf(state.xp);
  if (demoMode) {
    return { gained: 0, first: false, levelBefore: before, levelAfter: before, streakContinued: false };
  }
  if (!Array.isArray(bucket)) {
    return { gained: 0, first: false, levelBefore: before, levelAfter: before, streakContinued: false };
  }
  const seen = (bucket as string[]).includes(subject);
  if (seen) {
    return { gained: 0, first: false, levelBefore: before, levelAfter: before, streakContinued: false };
  }
  (bucket as string[]).push(subject);
  state.xp += WORTH[kind];

  // streak: one command per calendar day extends it, a gap resets to 1
  const day = today();
  let streakContinued = false;
  if (state.lastDay !== day) {
    state.streak = state.lastDay && daysBetween(state.lastDay, day) === 1 ? state.streak + 1 : 1;
    state.lastDay = day;
    streakContinued = true;
  }

  persist();
  return {
    gained: WORTH[kind],
    first: true,
    levelBefore: before,
    levelAfter: levelOf(state.xp),
    streakContinued,
  };
}

export function countCmd(): void {
  state.sessionCmds += 1;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/* ------------------------------------------------------------- scoring --- */

export function levelOf(xp: number): number {
  return Math.min(Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, 100);
}

export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2;
}

export function tierOf(pwr: number): 'LEGENDARY' | 'RARE' | 'COMMON' {
  return pwr >= 800 ? 'LEGENDARY' : pwr >= 300 ? 'RARE' : 'COMMON';
}

/* ------------------------------------------------------- save transfer --- */

/**
 * Project ids are 36-char uuids and the showcase is static, so a run is stored
 * as indices into that fixed table rather than as raw uuids. A fully explored
 * save is a few hundred characters instead of tens of kilobytes.
 *
 * The table is passed in rather than imported so this module keeps no data
 * dependency. Callers install it once at start-up with `setProjectTable`.
 */
let projectIds: string[] = [];
let projectIndex: Record<string, number> = {};
/** Fingerprint of the installed table, computed once rather than per load. */
let projectFingerprint = '0-0';

export function setProjectTable(ids: string[]): void {
  projectIds = ids;
  projectIndex = {};
  ids.forEach((id, i) => { projectIndex[id] = i; });
  projectFingerprint = tableFingerprint(ids);
  // the persisted run stores project indices, so it can only be decoded
  // once the table exists — install the table first, then hydrate
  hydrate();
}

function packIds(ids: readonly string[]): number[] {
  const out: number[] = [];
  for (const id of ids) {
    const i = projectIndex[id];
    if (i !== undefined) out.push(i);
  }
  return out.sort((a, b) => a - b);
}

function unpackIds(idx: readonly number[]): string[] {
  return idx.map((i) => projectIds[i]).filter((id): id is string => typeof id === 'string');
}

/** Run-length encode an ascending index list, so `0..199` is tiny. */
function packRuns(nums: readonly number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < nums.length) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(i === j ? String(nums[i]) : `${nums[i]}-${nums[j]}`);
    i = j + 1;
  }
  return parts.join(',');
}

function unpackRuns(s: string): number[] {
  if (!s) return [];
  const out: number[] = [];
  for (const part of s.split(',')) {
    const dash = part.indexOf('-');
    if (dash < 0) {
      const n = Number(part);
      if (Number.isInteger(n) && n >= 0) out.push(n);
    } else {
      const a = Number(part.slice(0, dash));
      const b = Number(part.slice(dash + 1));
      if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= a && b - a < 10_000) {
        for (let n = a; n <= b; n++) out.push(n);
      }
    }
  }
  return out;
}

/** UTF-8 safe base64 that survives copy-paste through chat apps. */
function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64decode(s: string): string {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)));
}

/** The wire form: compact keys, projects as indices, everything else as-is. */
interface Packed {
  v: number;
  x: number;
  s: string;
  vi: string;
  r: string;
  b: string[];
  g: string[];
  f: string[];
  d: string;
  k: number;
  /** fingerprint of the project table these indices were written against */
  t: string;
}

export function exportSave(): string {
  const packed: Packed = {
    v: SAVE_VERSION,
    x: state.xp,
    s: packRuns(packIds(state.scanned)),
    vi: packRuns(packIds(state.visited)),
    r: packRuns(packIds(state.repoed)),
    b: state.bounties,
    g: state.guild,
    f: state.followed,
    d: state.lastDay,
    k: state.streak,
    t: projectFingerprint,
  };
  const payload = JSON.stringify(packed);
  // a checksum makes a truncated paste fail loudly instead of silently
  let sum = 0;
  for (let i = 0; i < payload.length; i++) sum = (sum * 31 + payload.charCodeAt(i)) >>> 0;
  return `${b64encode(payload)}.${sum.toString(36)}`;
}

export type ImportResult = { ok: true; xp: number } | { ok: false; reason: string };

export function importSave(code: string): ImportResult {
  const trimmed = code.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot < 0) return { ok: false, reason: 'not a save code (expected payload.checksum)' };
  const payload64 = trimmed.slice(0, dot);
  const sum = trimmed.slice(dot + 1);
  let payload: string;
  try {
    payload = b64decode(payload64);
  } catch {
    return { ok: false, reason: 'payload is not valid base64' };
  }
  let check = 0;
  for (let i = 0; i < payload.length; i++) check = (check * 31 + payload.charCodeAt(i)) >>> 0;
  if (check.toString(36) !== sum) return { ok: false, reason: 'checksum mismatch — the code was altered or truncated' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, reason: 'payload is not valid json' };
  }

  // Scanned/visited/repoed are indices into the project table. If the table has
  // been rebuilt since this code was minted, those indices point somewhere else,
  // so the run would silently claim the wrong projects. Refuse instead.
  const fp = projectFingerprint;
  if (parsed && typeof parsed === 'object' && 't' in parsed) {
    const stamped = (parsed as { t?: unknown }).t;
    if (typeof stamped !== 'string' || stamped !== fp) {
      return {
        ok: false,
        reason:
          'this code was written against a different project list — the showcase has changed since. Re-earn it with `save`.',
      };
    }
  } else {
    return {
      ok: false,
      reason:
        'this code predates the current project list and its projects can no longer be identified. Re-earn it with `save`.',
    };
  }

  const next = decodePacked(parsed);
  if (!next) return { ok: false, reason: 'payload is not a progress record' };
  state = next;
  persist();
  return { ok: true, xp: state.xp };
}

/** Turn the wire form back into a Progress. Returns null if it is not one. */
function decodePacked(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.v !== 'number' || typeof r.s !== 'string' || typeof r.x !== 'number') return null;
  // a code from a newer build may carry fields this one cannot interpret
  if (r.v > SAVE_VERSION) return null;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    xp: Number.isFinite(r.x) && r.x >= 0 ? r.x : 0,
    scanned: unpackIds(unpackRuns(typeof r.s === 'string' ? r.s : '')),
    visited: unpackIds(unpackRuns(typeof r.vi === 'string' ? r.vi : '')),
    repoed: unpackIds(unpackRuns(typeof r.r === 'string' ? r.r : '')),
    bounties: strArr(r.b),
    guild: strArr(r.g),
    followed: strArr(r.f),
    lastDay: typeof r.d === 'string' ? r.d : '',
    streak: typeof r.k === 'number' && r.k >= 0 ? r.k : 0,
    sessionCmds: 0,
  };
}