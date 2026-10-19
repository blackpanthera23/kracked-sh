/**
 * The city: a top-down ASCII world you walk around in.
 *
 * Every project in the showcase is a building on the grid, grouped into blocks
 * by its first letter, so 535 projects become a place with districts rather
 * than a list. You move with WASD / arrows, walk up to a building and press
 * Enter to read it.
 *
 * Rendering is plain text: one <pre> repainted every frame from a char grid.
 * At 60x30 that is 1,800 cells, which is nothing, and it keeps the whole world
 * inside the terminal aesthetic the rest of the page already speaks.
 *
 * Movement is grid-locked on a fixed tick rather than free-running, so a held
 * key walks smoothly and a tap moves exactly one tile — the same feel as the
 * rest of the shell, which never animates faster than it can read.
 */

import { SHOWCASE } from '../showcase';

/** Buildings are grouped into blocks so names stay short and findable. */
const BLOCKS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const GROUND = '\u00b7';   // open plaza
const PLAZA = '\u2591';    // lighter paving
const ROAD_X = '\u2500';   // street running east-west
const ROAD_Y = '\u2502';   // street running north-south
const CROSS = '\u253c';    // intersection
const WALL = '\u2588';     // building mass
const DOOR = '\u25a1';     // building entrance
const YOU = '@';

/** How many tiles the player covers per second while a key is held. */
const STEPS_PER_SEC = 14;

export interface Building {
  x: number;
  y: number;
  id: string;
  title: string;
  author: string;
  w: number;
  h: number;
}

interface Tile {
  ch: string;
  /** index into buildings, or -1 for terrain */
  b: number;
}

export class City {
  private el: HTMLElement;
  private w = 0;
  private h = 0;
  private grid: Tile[] = [];
  private buildings: Building[] = [];
  private x = 0;
  private y = 0;
  private face = 0;         // 0 up 1 right 2 down 3 left, for the status line
  private held = new Set<string>();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private onApproach: (b: Building | null) => void;
  private onEnter: (b: Building) => void;
  private running = false;
  /** the building whose door you are standing on, if any */
  private standing: Building | null = null;

  constructor(
    el: HTMLElement,
    onApproach: (b: Building | null) => void,
    onEnter: (b: Building) => void,
  ) {
    this.el = el;
    this.onApproach = onApproach;
    this.onEnter = onEnter;
  }

  /* ------------------------------------------------------------- worldgen */

  /**
   * Lay out the city: streets on an 14x6 grid, buildings packed into the blocks
   * between them, one per row so every door faces a walkable row. Only the first
   * ~200 projects are placed — the rest stay reachable through `showcase`, and a
   * grid any bigger stops being walkable.
   */
  private build(): void {
    this.w = 78;
    this.h = 42;
    this.grid = new Array(this.w * this.h);
    for (let i = 0; i < this.grid.length; i++) {
      const x = i % this.w;
      const y = (i / this.w) | 0;
      const onX = x % 14 === 0;
      const onY = y % 6 === 0;
      const ch = onX && onY ? CROSS : onX ? ROAD_Y : onY ? ROAD_X : (x + y) % 2 ? GROUND : PLAZA;
      this.grid[i] = { ch, b: -1 };
    }

    this.buildings = [];

    // Every block gets an equal share, so the city fills out instead of packing
    // the first few blocks and leaving the rest as empty lots.
    const blocks: [number, number][] = [];
    for (let by = 0; by + 6 <= this.h; by += 6) {
      for (let bx = 0; bx + 14 <= this.w; bx += 14) blocks.push([bx, by]);
    }
    const slotsPerBlock = 4 * 3;      // 4 rows x 3 columns of buildings
    const cap = Math.min(SHOWCASE.length, blocks.length * slotsPerBlock);
    const projects = SHOWCASE.slice(0, cap);

    let next = 0;
    outer: for (let round = 0; round < 4; round++) {
      for (let col = 0; col < 3; col++) {
        for (const [bx, by] of blocks) {
          if (next >= projects.length) break outer;
          const x = bx + 1 + col * 4;
          const y = by + 1 + round;
          const p = projects[next];
          const bw = Math.min(bx + 13 - x + 1, 3 + (p.title.length % 2));
          if (bw < 3 || y > by + 4) continue;
          this.place(p.id, p.title, p.author, x, y, bw, 1);
          next++;
        }
      }
    }

    // start on a street intersection near the first block
    this.x = 7;
    this.y = 6;
    this.face = 2;
    this.ensureOpen();
  }

  private place(id: string, title: string, author: string, x: number, y: number, w: number, h: number): void {
    const index = this.buildings.length;
    const b: Building = { x, y, id, title, author, w, h };
    this.buildings.push(b);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const gx = x + dx;
        const gy = y + dy;
        if (gx >= this.w || gy >= this.h) continue;
        const isDoor = dy === h - 1 && dx === Math.floor(w / 2);
        this.grid[gy * this.w + gx] = { ch: isDoor ? DOOR : WALL, b: index };
      }
    }
  }

  /** Nudge the spawn onto a walkable tile if worldgen put something there. */
  private ensureOpen(): void {
    for (let r = 0; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = this.x + dx;
          const ny = this.y + dy;
          if (this.walkable(nx, ny)) { this.x = nx; this.y = ny; return; }
        }
      }
    }
  }

  /* --------------------------------------------------------------- state */

  private at(x: number, y: number): Tile | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.grid[y * this.w + x];
  }

  private walkable(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t) return false;
    if (t.b < 0) return true;                       // streets and plaza
    const b = this.buildings[t.b];
    return b ? this.inDoorway(b, x, y) : false;      // doors are walkable
  }

  private inDoorway(b: Building, x: number, y: number): boolean {
    return y === b.y + b.h - 1 && x === b.x + Math.floor(b.w / 2);
  }

  /** The building whose door the player is on, if any. */
  private doorHere(): Building | null {
    const t = this.at(this.x, this.y);
    if (!t || t.b < 0) return null;
    const b = this.buildings[t.b];
    return b && this.inDoorway(b, this.x, this.y) ? b : null;
  }

  /* --------------------------------------------------------------- input */

  handleKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const map: Record<string, string> = {
      ArrowUp: 'up', w: 'up', W: 'up', k: 'up',
      ArrowDown: 'down', s: 'down', S: 'down', j: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left', h: 'left',
      ArrowRight: 'right', d: 'right', D: 'right', l: 'right',
    };
    if (k === 'Enter' || k === ' ') {
      if (this.standing) { this.onEnter(this.standing); return true; }
      return false;
    }
    const dir = map[k];
    if (!dir) return false;
    e.preventDefault();
    this.held.add(dir);
    this.face = dir === 'up' ? 0 : dir === 'right' ? 1 : dir === 'down' ? 2 : 3;
    // a single tap should always move one tile, even between ticks
    this.step(dir);
    this.acc = 0;
    this.draw();
    return true;
  }

  handleKeyUp(e: KeyboardEvent): void {
    const k = e.key;
    const map: Record<string, string> = {
      ArrowUp: 'up', w: 'up', W: 'up', k: 'up',
      ArrowDown: 'down', s: 'down', S: 'down', j: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left', h: 'left',
      ArrowRight: 'right', d: 'right', D: 'right', l: 'right',
    };
    const dir = map[k];
    if (dir) this.held.delete(dir);
  }

  /** Held keys keep walking on a fixed tick, so movement is even, not per-event. */
  private tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.held.size > 0) {
      this.acc += dt * STEPS_PER_SEC;
      let moved = false;
      while (this.acc >= 1) {
        this.acc -= 1;
        for (const dir of this.held) {
          if (this.step(dir)) { moved = true; break; }
        }
      }
      if (moved) this.draw();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private step(dir: string): boolean {
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (!this.walkable(nx, ny)) return false;
    this.x = nx;
    this.y = ny;
    const b = this.doorHere();
    if (b !== this.standing) {
      this.standing = b;
      this.onApproach(b);
    }
    return true;
  }

  /* -------------------------------------------------------------- render */

  draw(): void {
    const px = Math.max(0, Math.min(this.w - 1, this.x));
    const py = Math.max(0, Math.min(this.h - 1, this.y));

    let out = '';
    const pad = String(this.w).length;
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) {
        if (x === px && y === py) { row += YOU; continue; }
        row += this.grid[y * this.w + x].ch;
      }
      out += String(y).padStart(pad, ' ') + ' ' + row + '\n';
    }
    this.el.textContent = out;
  }

  /* -------------------------------------------------------------- lifecycle */

  start(): void {
    if (this.running) return;
    this.build();
    this.draw();
    this.standing = this.doorHere();
    this.onApproach(this.standing);
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    this.held.clear();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Where the player is, for the status line. */
  get position(): { x: number; y: number; facing: string } {
    return { x: this.x, y: this.y, facing: ['north', 'east', 'south', 'west'][this.face] };
  }

  /** Walk to the door of a named building, so `explore <project>` works from the shell. */
  walkTo(id: string): Building | null {
    const b = this.buildings.find((x) => x.id === id);
    if (!b) return null;
    const doorX = b.x + Math.floor(b.w / 2);
    const doorY = b.y + b.h - 1;
    // stand on the door itself if possible, else on the row below it
    if (this.walkable(doorX, doorY)) {
      this.x = doorX;
      this.y = doorY;
    } else {
      this.x = doorX;
      this.y = Math.min(this.h - 1, doorY + 1);
    }
    this.face = 0;
    this.standing = this.doorHere();
    this.onApproach(this.standing);
    this.draw();
    return b;
  }

  /** The nearest building to walk toward, for a nudge. */
  nearest(): Building | null {
    if (this.standing) return this.standing;
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings) {
      const dx = b.x + Math.floor(b.w / 2);
      const dy = b.y + b.h - 1;
      const d = Math.abs(dx - this.x) + Math.abs(dy - this.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Compass direction from the player to a building, for the hint line. */
  bearing(b: Building): string {
    const dx = b.x + Math.floor(b.w / 2) - this.x;
    const dy = b.y + b.h - 1 - this.y;
    const ns = dy < -1 ? 'north' : dy > 1 ? 'south' : '';
    const ew = dx < -1 ? 'west' : dx > 1 ? 'east' : '';
    const dir = [ns, ew].filter(Boolean).join('-');
    return dir || 'here';
  }
}