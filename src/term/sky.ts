/**
 * Project sky.
 *
 * The showcase is 534 shipped projects with one number nobody else has: rarity,
 * 0 to 17, which is how many other people have built on top of that project. So
 * instead of a list, or a city where every building is the same, the projects
 * are stars and rarity is magnitude. The brightest thing in the sky is strdst7's
 * `'observe'`, whose rarity is 17, and you can see that from across the map
 * without reading a single word.
 *
 * Clusters are emergent, not authored: each project is placed from a hash of its
 * author's handle, so one person's projects land together as a constellation.
 * Colour comes from the project's first stack tag, so a run of TypeScript
 * projects reads as one blue field.
 *
 * Canvas, not DOM: 534 glowing points with additive blending and a nebula pass
 * is a shader-shaped problem, and the whole thing is one draw call per frame.
 */

import { SHOWCASE, type ShowcaseProject } from '../showcase';

interface Star {
  p: ShowcaseProject;
  /** Sky position in world space, before pan and zoom. */
  x: number;
  y: number;
  /** Rarity drives size and brightness. */
  mag: number;
  r: number;
  hue: number;
  /** Twinkle phase, stable per star so the sky is not uniform. */
  phase: number;
}

/** Stack tag → hue. First match wins, so the order encodes precedence. */
const STACK_HUE: [RegExp, number][] = [
  [/typescript/i, 190],
  [/react|next/i, 210],
  [/tailwind|css|scss/i, 170],
  [/supabase|postgres|sql|prisma/i, 145],
  [/python|django|flask|fastapi/i, 55],
  [/rust|c\+\+|go\b/i, 25],
  [/solidity|web3|chain/i, 275],
  [/three|webgl|shader|unity|godot/i, 320],
  [/swift|kotlin|flutter|dart|android|ios/i, 350],
  [/html|javascript|js\b/i, 45],
  [/ai|llm|ml|agent|gpt/i, 295],
];

/** Deterministic 32-bit hash, so a handle always lands in the same place. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MAX_RARITY = 17;

export class Sky {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private raf = 0;
  private t = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;

  /** Camera: world point under the centre of the viewport, and a zoom factor. */
  private cam = { x: 0, y: 0, z: 1.35 };
  private target = { x: 0, y: 0, z: 1.35 };
  private dragging = false;
  private dragFrom = { x: 0, y: 0 };
  private dragStart = { x: 0, y: 0 };
  private pointer = { x: -1, y: -1 };
  private hover: Star | null = null;
  private selected: Star | null = null;
  private running = false;

  private onHover: (p: ShowcaseProject | null) => void;
  private onPick: (p: ShowcaseProject) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onHover: (p: ShowcaseProject | null) => void,
    onPick: (p: ShowcaseProject) => void,
  ) {
    this.canvas = canvas;
    this.onHover = onHover;
    this.onPick = onPick;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2d context unavailable');
    this.ctx = c;
    this.seed();

    canvas.addEventListener('pointerdown', this.handleDown);
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerup', this.handleUp);
    canvas.addEventListener('pointercancel', this.handleUp);
    canvas.addEventListener('pointerleave', this.handleLeave);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('resize', this.resize);
  }

  /* --------------------------------------------------------------- world */

  private seed(): void {
    // One cluster per author, laid out on a golden-angle spiral so no two
    // authors overlap and the whole sky fills evenly. Projects of one author
    // then scatter inside their own cluster, which is what makes a
    // constellation read as a person rather than a random clump.
    //
    // Priority is by project count: the 34-project author sits in the middle,
    // the one-project authors ring the edge. That puts the densest part of the
    // sky where the eye lands first.
    const counts = new Map<string, number>();
    for (const p of SHOWCASE) counts.set(p.author, (counts.get(p.author) ?? 0) + 1);
    const handles = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const GOLDEN = 2.399963229728653;
    const spots = new Map<string, { x: number; y: number }>();
    handles.forEach((h, i) => {
      const a = i * GOLDEN;
      const rad = 0.94 * Math.sqrt((i + 0.5) / handles.length);
      spots.set(h, { x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    });

    // an author with many projects gets a wider constellation, so the cluster
    // reads at its true weight instead of being crammed into the same disc
    const SPREAD = 0.09;
    for (const p of SHOWCASE) {
      const spot = spots.get(p.author)!;
      const n = counts.get(p.author) ?? 1;
      const own = SPREAD * (0.55 + 0.45 * Math.sqrt(n / 34));
      // scatter by hash, not by index: two projects of the same author that
      // happen to sit next to each other in the list must not stack
      const h1 = hash(p.id);
      const h2 = hash(p.id + 'y');
      const a = (h1 % 3600) / 3600 * Math.PI * 2;
      const rad = Math.sqrt((h2 % 1000) / 1000) * own;
      const mag = Math.max(0, Math.min(MAX_RARITY, p.rarity));
      this.stars.push({
        p,
        x: spot.x + Math.cos(a) * rad,
        y: spot.y + Math.sin(a) * rad,
        mag,
        r: 1.1 + Math.pow(mag / MAX_RARITY, 0.72) * 5.2,
        hue: this.hueOf(p),
        phase: (h1 % 628) / 100,
      });
    }
  }

  private hueOf(p: ShowcaseProject): number {
    for (const [re, h] of STACK_HUE) {
      if (p.stack.some((s) => re.test(s))) return h;
    }
    if (!p.stack.length) return 215;          // no stack declared: a dark blue
    return 215 + (hash(p.stack[0]) % 40) - 20; // otherwise just off-white-blue
  }

  /* --------------------------------------------------------------- input */

  /** Screen point → world point, honouring the camera. */
  private toWorld(sx: number, sy: number): [number, number] {
    return [
      this.cam.x + (sx - this.w / 2) / this.scale(),
      this.cam.y + (sy - this.h / 2) / this.scale(),
    ];
  }

  private scale(): number {
    return Math.max(60, Math.min(this.w, this.h) * 0.62) * this.cam.z;
  }

  /** Nearest star within a generous hit radius, or null. */
  private pick(sx: number, sy: number): Star | null {
    const [wx, wy] = this.toWorld(sx, sy);
    let best: Star | null = null;
    let bestD = Infinity;
    for (const s of this.stars) {
      const d = (s.x - wx) ** 2 + (s.y - wy) ** 2;
      // a star is easier to hit the brighter it is, which matches how it looks
      const tol = (7 + s.r * 2.2) / this.scale();
      if (d < tol * tol && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private handleDown = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging = true;
    this.dragFrom = { x: e.clientX, y: e.clientY };
    this.dragStart = { x: this.target.x, y: this.target.y };
    // capture is best-effort: it throws if the pointer is already gone, and a
    // throw here would abort the drag before it starts
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released; the drag still works without capture */
    }
    // a press that lands on a star is a candidate pick; a drag cancels it
    const hit = this.pick(e.clientX - r.left, e.clientY - r.top);
    this.pressedStar = hit;
    this.dragMoved = false;
  };

  private pressedStar: Star | null = null;
  private dragMoved = false;

  /** Live pointers, so two of them can be read as a pinch. */
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; z: number; cx: number; cy: number } | null = null;

  private handleMove = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;

    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // two fingers down: pinch, and ignore the pan/pick logic entirely
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!this.pinch) {
        this.pinch = { dist, z: this.target.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      } else {
        const k = dist / this.pinch.dist;
        this.target.z = Math.max(0.45, Math.min(9, this.pinch.z * k));
      }
      this.dragMoved = true;
      this.pressedStar = null;
      return;
    }

    if (this.dragging) {
      const dx = e.clientX - this.dragFrom.x;
      const dy = e.clientY - this.dragFrom.y;
      if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
      this.target.x = this.dragStart.x - dx / this.scale();
      this.target.y = this.dragStart.y - dy / this.scale();
      this.cam.x = this.target.x;
      this.cam.y = this.target.y;
      return;
    }
    const hit = this.pick(this.pointer.x, this.pointer.y);
    if (hit !== this.hover) {
      this.hover = hit;
      this.onHover(hit ? hit.p : null);
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
    }
  };

  private handleUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    this.dragging = this.pointers.size > 0;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    // a click, not a drag, on a star opens it
    if (!this.dragMoved && this.pressedStar && this.pointers.size === 0) {
      this.selected = this.pressedStar;
      this.onPick(this.pressedStar.p);
    }
    this.pressedStar = null;
  };

  private handleLeave = (): void => {
    this.pointer.x = -1;
    this.pointer.y = -1;
    if (this.hover) {
      this.hover = null;
      this.onHover(null);
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const before = this.pickAtFocus(e);
    this.target.z = Math.max(0.45, Math.min(9, this.target.z * Math.exp(-e.deltaY * 0.0012)));
    // keep the point under the cursor still while zooming
    if (before) {
      this.cam.z = this.target.z;
      const [wx, wy] = this.toWorld(e.clientX - this.canvas.getBoundingClientRect().left, e.clientY - this.canvas.getBoundingClientRect().top);
      this.target.x += before[0] - wx;
      this.target.y += before[1] - wy;
    }
  };

  /** World point under the cursor before a zoom, for anchoring. */
  private pickAtFocus(e: WheelEvent): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right) return null;
    return this.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  /** Fly the camera to a project and mark it, for `sky <project>`. */
  focus(id: string): ShowcaseProject | null {
    const s = this.stars.find((x) => x.p.id === id);
    if (!s) return null;
    this.selected = s;
    this.target.x = s.x;
    this.target.y = s.y;
    this.target.z = Math.max(this.target.z, 4.5);
    return s.p;
  }

  reset(): void {
    this.target = { x: 0, y: 0, z: 1.35 };
    this.selected = null;
    this.hover = null;
    this.onHover(null);
  }

  /** Step the zoom, for keyboard control. */
  zoomBy(k: number): void {
    this.target.z = Math.max(0.45, Math.min(9, this.target.z * k));
  }

  /** Open the star under the keyboard's focus, if there is one. */
  openSelected(): ShowcaseProject | null {
    const p = this.selected?.p ?? this.hover?.p ?? null;
    if (p) this.onPick(p);
    return p;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Settled zoom: where the camera is heading, not the in-flight eased value. */
  get zoom(): number {
    return this.target.z;
  }

  /* -------------------------------------------------------------- render */

  private resize = (): void => {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.floor(r.width * this.dpr);
    this.canvas.height = Math.floor(r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  private frame = (): void => {
    if (!this.running) return;
    this.t += 0.016;
    // ease the camera, so a drag feels like moving a telescope not a scrollbar
    this.cam.x += (this.target.x - this.cam.x) * 0.12;
    this.cam.y += (this.target.y - this.cam.y) * 0.12;
    this.cam.z += (this.target.z - this.cam.z) * 0.12;

    const { ctx, w, h } = this;
    // deep space: not pure black, so the glow has something to sit on
    ctx.fillStyle = '#04060b';
    ctx.fillRect(0, 0, w, h);

    this.drawNebula();
    ctx.globalCompositeOperation = 'lighter';
    this.drawStars();
    ctx.globalCompositeOperation = 'source-over';
    this.drawChrome();

    this.raf = requestAnimationFrame(this.frame);
  };

  /** Screen position of a star. */
  private project(s: Star): [number, number] {
    const k = this.scale();
    return [this.w / 2 + (s.x - this.cam.x) * k, this.h / 2 + (s.y - this.cam.y) * k];
  }

  /** Soft colour fields so the sky has structure behind the stars. */
  private drawNebula(): void {
    const { ctx } = this;
    const k = this.scale();
    // group by rounded colour band, then one radial blob per band
    const bands = new Map<number, { x: number; y: number; n: number }>();
    for (const s of this.stars) {
      const key = Math.round(s.hue / 24);
      const b = bands.get(key) ?? { x: 0, y: 0, n: 0 };
      b.x += s.x; b.y += s.y; b.n++;
      bands.set(key, b);
    }
    ctx.save();
    for (const [key, b] of bands) {
      const [sx, sy] = this.projectPoint(b.x / b.n, b.y / b.n);
      if (sx < -300 || sy < -300 || sx > this.w + 300 || sy > this.h + 300) continue;
      const rad = Math.max(120, b.n * k * 0.075);
      const hue = key * 24;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
      g.addColorStop(0, `hsla(${hue}, 72%, 46%, 0.16)`);
      g.addColorStop(0.45, `hsla(${hue}, 72%, 36%, 0.075)`);
      g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private projectPoint(x: number, y: number): [number, number] {
    const k = this.scale();
    return [this.w / 2 + (x - this.cam.x) * k, this.h / 2 + (y - this.cam.y) * k];
  }

  private drawStars(): void {
    const { ctx } = this;
    const k = this.scale();
    for (const s of this.stars) {
      const [sx, sy] = this.project(s);
      if (sx < -40 || sy < -40 || sx > this.w + 40 || sy > this.h + 40) continue;
      // brighter stars are bigger, and the very rare ones pulse
      const tw = 0.86 + 0.14 * Math.sin(this.t * 1.6 + s.phase);
      const rr = Math.max(0.7, s.r * (k / 620) * tw);
      const lit = 0.42 + 0.58 * Math.pow(s.mag / MAX_RARITY, 0.7);

      // a soft halo, then a tight core — the two-pass glow reads as "bright"
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 5.5);
      halo.addColorStop(0, `hsla(${s.hue}, 90%, 68%, ${0.30 * lit * tw})`);
      halo.addColorStop(0.35, `hsla(${s.hue}, 90%, 60%, ${0.10 * lit})`);
      halo.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, rr * 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${s.hue}, ${70 + lit * 25}%, ${70 + lit * 26}%, ${0.55 + lit * 0.45})`;
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Math.PI * 2);
      ctx.fill();

      // the crown jewel: rarity 17 gets a four-point flare, one per rim of light
      if (s.mag >= MAX_RARITY - 1) {
        const len = rr * 11;
        ctx.strokeStyle = `hsla(${s.hue}, 95%, 78%, ${0.22 * lit})`;
        ctx.lineWidth = Math.max(0.6, rr * 0.30);
        ctx.beginPath();
        ctx.moveTo(sx - len, sy); ctx.lineTo(sx + len, sy);
        ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy + len);
        ctx.stroke();
      }
    }
  }

  /** Selection ring and the label for the star being inspected. */
  private drawChrome(): void {
    const { ctx } = this;
    const mark = this.selected ?? this.hover;
    if (!mark) return;
    const [sx, sy] = this.project(mark);
    const rr = Math.max(3, mark.r * (this.scale() / 620)) + 7;
    const ring = (radius: number, alpha: number) => {
      ctx.strokeStyle = `hsla(${mark.hue}, 90%, 70%, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(rr, 0.5);
    ring(rr + 4, 0.22);

    // crosshair ticks, so the marker reads as an instrument not a blob
    ctx.strokeStyle = `hsla(${mark.hue}, 90%, 72%, 0.6)`;
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(sx + dx * (rr + 3), sy + dy * (rr + 3));
      ctx.lineTo(sx + dx * (rr + 9), sy + dy * (rr + 9));
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  start(): void {
    if (this.running) return;
    this.resize();
    this.running = true;
    this.canvas.style.cursor = 'grab';
    // fill the HUD before the visitor touches anything, so the sky explains itself
    this.onHover(null);
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Counts for the HUD, so the copy is not hardcoded. */
  stats(): { stars: number; authors: number; brightest: ShowcaseProject | null } {
    const authors = new Set(this.stars.map((s) => s.p.author)).size;
    let best: Star | null = null;
    for (const s of this.stars) if (!best || s.mag > best.mag) best = s;
    return { stars: this.stars.length, authors, brightest: best ? best.p : null };
  }
}