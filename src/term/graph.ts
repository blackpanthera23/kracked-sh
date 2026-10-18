/**
 * Community topology layer.
 *
 * Force-ish layout computed once from data.ts, then drawn on a canvas with a
 * slow drift and hover inspection. Deliberately no library: the point is that a
 * landing page can do this in ~150 lines.
 */

import { MEMBERS, EDGES } from '../data';

interface Node {
  m: typeof MEMBERS[number];
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number;
}

const STATUS_HUE: Record<string, number> = { online: 150, building: 40, away: 265 };

export class Graph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: Node[] = [];
  private raf = 0;
  private t = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private hover: Node | null = null;
  private pointer = { x: -1, y: -1 };
  private onHover: (m: typeof MEMBERS[number] | null) => void;
  private running = false;

  constructor(canvas: HTMLCanvasElement, onHover: (m: typeof MEMBERS[number] | null) => void) {
    this.canvas = canvas;
    this.onHover = onHover;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2d context unavailable');
    this.ctx = c;
    this.seed();
    canvas.addEventListener('pointermove', this.handleMove);
    canvas.addEventListener('pointerleave', this.handleLeave);
    window.addEventListener('resize', this.resize);
  }

  private seed(): void {
    // deterministic golden-angle seed — avoids the arcs that a plain spiral produces
    const GOLDEN = 2.399963229728653;
    MEMBERS.forEach((m, i) => {
      const a = i * GOLDEN;
      const rad = 0.30 + 0.26 * Math.sqrt((i + 0.5) / MEMBERS.length);
      this.nodes.push({
        m,
        x: Math.cos(a) * rad,
        y: Math.sin(a) * rad,
        vx: 0,
        vy: 0,
        r: 4.5 + m.pwr / 30,
        pulse: i * 0.7,
      });
    });
    this.relax(140);
  }

  private index(handle: string): Node | undefined {
    return this.nodes.find((n) => n.m.handle === handle);
  }

  /** Hue for a node: status colour if known, else derived from its index. */
  private hueOf(n: Node): number {
    return STATUS_HUE[n.m.status] ?? (n.pulse * 47) % 360;
  }

  /** Simple spring/repulsion relaxation in normalised space. */
  private relax(iterations: number): void {
    const peers = EDGES.map(([a, b]) => [this.index(a)!, this.index(b)!] as const).filter(([a, b]) => a && b);
    for (let k = 0; k < iterations; k++) {
      // repulsion between all pairs
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1e-6) { dx = 0.01; dy = 0.01; d2 = 2e-4; }
          const f = 0.0024 / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
          b.vx += (dx / d) * f; b.vy += (dy / d) * f;
        }
      }
      // springs along edges — target length shrinks as the sim cools
      const target = 0.30;
      for (const [a, b] of peers) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const f = (d - target) * 0.05;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      // apply, pull to centre, clamp into the unit disc
      for (const n of this.nodes) {
        n.x += n.vx; n.y += n.vy;
        n.x -= n.x * 0.0018; n.y -= n.y * 0.0018;
        const r = Math.hypot(n.x, n.y);
        if (r > 0.78) { n.x = (n.x / r) * 0.78; n.y = (n.y / r) * 0.78; }
        n.vx *= 0.82; n.vy *= 0.82;
      }
    }
    for (const n of this.nodes) { n.vx = 0; n.vy = 0; }

    // recentre on the centroid, then normalise so the cloud fills the target disc
    // instead of sprawling to one side
    const cx = this.nodes.reduce((s, n) => s + n.x, 0) / this.nodes.length;
    const cy = this.nodes.reduce((s, n) => s + n.y, 0) / this.nodes.length;
    let maxR = 0;
    for (const n of this.nodes) {
      n.x -= cx; n.y -= cy;
      maxR = Math.max(maxR, Math.hypot(n.x, n.y));
    }
    if (maxR > 1e-3) {
      // scale so the outermost node sits on the clamp radius; also bump the
      // minimum spread so a tightly-packed relaxation still fills the canvas
      const k = Math.max(0.9, Math.min(2.2, 0.78 / maxR));
      for (const n of this.nodes) { n.x *= k; n.y *= k; }
    }
  }

  private resize = (): void => {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.floor(r.width * this.dpr);
    this.canvas.height = Math.floor(r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  private handleMove = (e: PointerEvent): void => {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = e.clientX - r.left;
    this.pointer.y = e.clientY - r.top;
  };

  private handleLeave = (): void => {
    this.pointer.x = -1;
    this.pointer.y = -1;
  };

  /** Normalised → screen, with a slow orbital rotation for the whole cloud. */
  private project(n: Node): [number, number] {
    const margin = 150;
    const scale = Math.max(120, Math.min(this.w / 2 - margin, this.h / 2 - margin) / 0.78);
    const a = this.t * 0.035;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = n.x * ca - n.y * sa;
    const ry = n.x * sa + n.y * ca;
    return [this.w / 2 + rx * scale, this.h / 2 + ry * scale];
  }

  private frame = (): void => {
    this.t += 0.006;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // faint measurement grid — gives the topology a sense of depth
    ctx.strokeStyle = 'rgba(90, 130, 155, 0.055)';
    ctx.lineWidth = 1;
    const cx = w / 2;
    const cy = h / 2;
    for (const rad of [0.26, 0.52, 0.78]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad * Math.min(w / 2 - 110, h / 2 - 110) / 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }

    // edges
    ctx.lineWidth = 1;
    for (const [ah, bh] of EDGES) {
      const a = this.index(ah);
      const b = this.index(bh);
      if (!a || !b) continue;
      const [ax, ay] = this.project(a);
      const [bx, by] = this.project(b);
      const lit = this.hover && (this.hover === a || this.hover === b);
      if (lit) {
        const hue = this.hueOf(this.hover === a ? a : b);
        ctx.strokeStyle = `hsla(${hue}, 90%, 68%, 0.6)`;
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = 'rgba(120, 160, 190, 0.13)';
        ctx.lineWidth = 1;
      }
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // nodes
    let found: Node | null = null;
    for (const n of this.nodes) {
      const driftX = Math.cos(this.t + n.pulse) * 3.2;
      const driftY = Math.sin(this.t * 0.9 + n.pulse) * 3.2;
      const [px, py] = this.project(n);
      const x = px + driftX;
      const y = py + driftY;
      const hue = this.hueOf(n);

      const d = this.pointer.x < 0 ? Infinity : Math.hypot(this.pointer.x - x, this.pointer.y - y);
      const hot = d < n.r + 9;
      if (hot) found = n;

      const alpha = hot ? 1 : this.hover ? 0.3 : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 85%, ${hot ? 72 : 58}%, ${alpha})`;
      ctx.fill();

      if (hot) {
        ctx.beginPath();
        ctx.arc(x, y, n.r + 7, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 90%, 68%, 0.5)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // labels: the hovered node always, plus the top few by power
      const showLabel = hot || n.m.pwr >= 130;
      if (showLabel) {
        const fade = this.hover && !hot ? 0.16 : hot ? 0.95 : 0.5;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = `rgba(215, 227, 236, ${fade})`;
        ctx.fillText(`@${n.m.handle}`, x + n.r + 7, y + 3);
      }
    }

    if (found !== this.hover) {
      this.hover = found;
      this.onHover(found ? found.m : null);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.hover = null;
    this.onHover(null);
  }

  get isRunning(): boolean {
    return this.running;
  }
}