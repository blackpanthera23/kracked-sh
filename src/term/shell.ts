/**
 * Tiny tokenizer + command registry.
 *
 * Grammar is deliberately minimal: whitespace-separated words, with double-quoted
 * segments kept intact so `open "two words"` works. No pipes, no redirection —
 * this is a landing page, not a real shell.
 */

export interface Ctx {
  /** Print a node into the scrollback. */
  out: (node: HTMLElement) => void;
  /** Print and scroll, returning after the paint. */
  write: (node: HTMLElement) => Promise<void>;
  /** Sleep helper for scripted sequences. */
  sleep: (ms: number) => Promise<void>;
  /** Set the status-bar text and busy lamp. */
  status: (text: string, busy?: boolean) => void;
  /** Change the visible cwd in the title bar. */
  cwd: (path: string) => void;
  /** Enter or leave the community graph layer. */
  attach: (on: boolean) => void;
  /** Clear the scrollback. */
  clear: () => void;
  /** Submit a command as if typed. */
  run: (input: string) => Promise<void>;
  /** Terminal column budget, for hr() and wrapping. */
  width: () => number;
}

export interface Command {
  name: string;
  args: string;
  summary: string;
  usage?: string;
  group: 'community' | 'navigate' | 'system' | 'fun';
  hidden?: boolean;
  run: (args: string[], ctx: Ctx) => Promise<void> | void;
}

const QUOTED = /"([^"]*)"|'([^']*)'|(\S+)/g;

export function tokenize(input: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  QUOTED.lastIndex = 0;
  while ((m = QUOTED.exec(input)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/** Scrollback of submitted inputs, newest last. */
export class History {
  private items: string[] = [];
  private cursor = 0;

  push(cmd: string): void {
    if (!cmd.trim()) return;
    if (this.items[this.items.length - 1] !== cmd) this.items.push(cmd);
    this.cursor = this.items.length;
  }

  /** delta -1 = older, +1 = newer. Returns null at the ends. */
  step(delta: number): string | null {
    const next = this.cursor + delta;
    if (next < 0 || next >= this.items.length) {
      if (delta > 0 && next >= this.items.length) {
        this.cursor = this.items.length;
        return '';
      }
      return null;
    }
    this.cursor = next;
    return this.items[this.cursor];
  }

  reset(): void {
    this.cursor = this.items.length;
  }

  get all(): readonly string[] {
    return this.items;
  }
}