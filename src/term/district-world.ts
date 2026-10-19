import '../district-world.css';
import type { Audio } from './audio';

export interface Destination {
  id: string;
  district: 'community' | 'school' | 'labs';
  title: string;
  description: string;
  href?: string;
  soon?: boolean;
  action?: 'showcase';
}

type DistrictId = Destination['district'];
type Point = { x: number; y: number };
type Cell = Point & { collected: boolean; index: number; district: DistrictId };
type District = {
  id: DistrictId; title: string; color: string; x: number;
  cells: Cell[]; fire: Point; progress: number; resolved: boolean;
};
type Building = Point & {
  destination: Destination; width: number; depth: number; height: number;
  dark: HTMLCanvasElement; lit: HTMLCanvasElement; left: number; top: number;
};
type Drawable = { depth: number; kind: 'building' | 'cell' | 'fire'; index: number; district: number };
type Options = {
  root: HTMLElement;
  destinations: readonly Destination[];
  onExit: () => void;
  onShowcase: () => void;
  /** Optional chiptune; absent means the city runs silent. */
  audio?: Audio;
};

const TILE_X = 28;
const TILE_Y = 14;
const COLS = 41;
const ROWS = 27;
const STORAGE = 'kracked-district-world-v1';
const MOVE_SPEED = 4.3;
const FIRE_REACH = 2.6;
const CELL_REACH = 0.85;
const HOLD_SECONDS = 2.4;
const FONT = '"JetBrains Mono", ui-monospace, monospace';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const projectX = (x: number, y: number) => (x - y) * TILE_X;
const projectY = (x: number, y: number) => (x + y) * TILE_Y;

function polygon(c: CanvasRenderingContext2D, points: readonly number[], fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]);
  c.closePath();
  c.fill();
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

/** A local, optional walking game. The directory never depends on mission progress. */
export class DistrictWorld {
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ground = document.createElement('canvas');
  private readonly districts: District[];
  private readonly buildings: Building[] = [];
  private readonly drawables: Drawable[] = [];
  private readonly blocked = new Uint8Array(COLS * ROWS);
  private readonly keys = new Set<string>();
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly options: Options;
  private readonly mission: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly guidance: HTMLElement;
  private readonly announcement: HTMLElement;
  private readonly water: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly pausePanel: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly dialogTitle: HTMLElement;
  private readonly dialogBody: HTMLElement;
  private readonly travelButtons: HTMLButtonElement[] = [];
  private readonly resizeObserver: ResizeObserver;
  private player: Point = { x: 7, y: 14 };
  private route: Point[] = [];
  private routeIndex = 0;
  private camera: Point = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private zoom = 1;
  private dpr = 1;
  private running = false;
  private paused = false;
  private suspended = false;
  private sprayHeld = false;
  private spraying = false;
  private moving = false;
  private face = 1;
  private phase = 0;
  private frame = 0;
  private lastTime = 0;
  private panelWasPaused = false;
  private lastHud = '';
  private returnFocus: HTMLElement | null = null;

  constructor(options: Options) {
    this.options = options;
    this.root = options.root;
    this.root.classList.add('district-world');
    this.root.innerHTML = `
      <canvas class="district-canvas" tabindex="-1" aria-hidden="true" aria-label="Isometric city exploration. Move with WASD or arrow keys, or tap the ground. Collect three water cells per district, then hold Space near its fire. Enter opens a nearby destination. P pauses. Escape returns." role="application"></canvas>
      <div class="district-interface">
        <header class="district-hud">
          <div class="district-hud-copy"><span class="district-eyebrow">KRACKED CITY / LOCAL MISSION</span><h1 class="district-mission">Community</h1><p class="district-counter"></p></div>
          <button class="district-button district-exit" type="button" aria-label="Exit city and return to browsing">Back to browse <span aria-hidden="true">↗</span></button>
        </header>
        <nav class="district-travel" aria-label="Walk to a district"></nav>
        <p class="district-guidance"></p>
        <div class="district-bottom">
          <div class="district-actions"><button class="district-button district-directory" type="button">Destinations</button><button class="district-button district-pause" type="button">Pause</button><button class="district-button district-replay" type="button" hidden>Replay city</button></div>
          <button class="district-water" type="button" aria-label="Hold to spray water" aria-disabled="true"><span aria-hidden="true">◈</span><span class="district-water-label">Collect water</span><small>HOLD / SPACE</small></button>
        </div>
        <p class="district-instructions">WASD / arrows to walk · tap ground to move · Enter to visit · Space to spray</p>
        <section class="district-pause-panel" aria-label="City paused" hidden><span class="district-eyebrow">TAKE YOUR TIME</span><h2>City paused</h2><p>Your supplies are safe. Destinations are always open.</p><button class="district-button district-resume" type="button">Resume exploring</button></section>
        <div class="district-announcement" role="status" aria-live="polite" aria-atomic="true"></div>
      </div>
      <dialog class="district-dialog" aria-labelledby="district-dialog-title"><header><div><span class="district-eyebrow">NO MISSION REQUIRED</span><h2 id="district-dialog-title">Destinations</h2></div><button class="district-button district-close" type="button" aria-label="Close destinations">Close</button></header><div class="district-dialog-body"></div></dialog>`;
    this.canvas = this.element<HTMLCanvasElement>('.district-canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.mission = this.element('.district-mission');
    this.counter = this.element('.district-counter');
    this.guidance = this.element('.district-guidance');
    this.announcement = this.element('.district-announcement');
    this.water = this.element('.district-water');
    this.pauseButton = this.element('.district-pause');
    this.pausePanel = this.element('.district-pause-panel');
    this.resumeButton = this.element('.district-resume');
    this.replayButton = this.element('.district-replay');
    this.dialog = this.element('.district-dialog');
    this.dialogTitle = this.element('#district-dialog-title');
    this.dialogBody = this.element('.district-dialog-body');
    this.districts = [
      { id: 'community' as const, title: 'Community', color: '#67e6b2', x: 7 },
      { id: 'school' as const, title: 'School', color: '#ffcf7d', x: 20 },
      { id: 'labs' as const, title: 'Labs', color: '#bca4ff', x: 33 },
    ].map(d => ({ ...d, progress: 0, resolved: false, fire: { x: d.x, y: 9 }, cells: [
      { x: d.x - 3, y: 10, collected: false, index: 0, district: d.id },
      { x: d.x + 2, y: 13, collected: false, index: 1, district: d.id },
      { x: d.x - 1, y: 17, collected: false, index: 2, district: d.id },
    ] }));
    this.restore();
    this.buildCity();
    this.bakeGround();
    this.makeTravelButtons();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
    this.resize();
  }

  get active(): boolean { return this.running; }

  enter(): void {
    if (this.running) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.running = true;
    this.paused = false;
    this.pausePanel.hidden = true;
    this.pauseButton.textContent = 'Pause';
    this.root.classList.add('district-world--active');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-hidden', 'false');
    this.resize();
    this.canvas.focus({ preventScroll: true });
    this.updateHud();
    this.announce('Welcome to the city. Walk over cyan water cells. Three in each district unlock its hose. Destinations are always open.');
    this.wake();
  }

  exit(): void {
    if (!this.running) return;
    this.running = false;
    this.clearInput();
    this.paused = false;
    if (this.dialog.open) this.dialog.close();
    this.pausePanel.hidden = true;
    this.root.classList.remove('district-world--active');
    this.canvas.tabIndex = -1;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.save();
    this.stop();
    this.resize();
    this.options.onExit();
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  suspend(on: boolean): void {
    this.suspended = on;
    if (on) {
      this.clearInput();
      this.options.audio?.suspend();
      if (this.running) this.setPaused(true, false);
      this.stop();
    } else {
      this.draw();
      this.wake();
    }
  }

  state() {
    const rect = this.canvas.getBoundingClientRect();
    const screen = (p: Point) => ({
      x: rect.left + this.width / 2 + (projectX(p.x, p.y) - this.camera.x) * this.zoom,
      y: rect.top + this.height * 0.53 + (projectY(p.x, p.y) - this.camera.y) * this.zoom,
    });
    return {
      active: this.running, paused: this.paused || this.suspended || document.hidden || this.dialog.open,
      position: { ...this.player }, district: this.currentDistrict().id,
      moving: this.moving, spraying: this.spraying, points: this.points(), localOnly: true,
      districts: this.districts.map(d => ({
        id: d.id, collected: d.cells.filter(c => c.collected).length, resolved: d.resolved,
        hoseReady: d.cells.every(c => c.collected),
        cells: d.cells.map(c => ({ ...c, screen: screen(c) })),
        fire: { ...d.fire, progress: d.progress, reach: FIRE_REACH, screen: screen(d.fire) },
      })),
      buildings: this.buildings.map(b => ({
        id: b.destination.id, district: b.destination.district,
        position: { x: b.x, y: b.y },
        screen: screen({ x: b.x + b.width / 2 - b.height / (4 * TILE_Y), y: b.y + b.depth / 2 - b.height / (4 * TILE_Y) }),
      })),
      geometry: { width: this.width, height: this.height, zoom: this.zoom, camera: { ...this.camera }, playerScreen: screen(this.player), tileX: TILE_X, tileY: TILE_Y },
    };
  }

  private element<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  private restore(): void {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (!value || value.version !== 1) return;
      for (const district of this.districts) {
        const saved = value.districts?.[district.id];
        if (!saved) continue;
        for (const cell of district.cells) cell.collected = saved.cells?.[cell.index] === true;
        district.resolved = saved.resolved === true && district.cells.every(c => c.collected);
        district.progress = district.resolved ? 1 : 0;
      }
    } catch { /* Storage may be disabled. The same mission still works in memory. */ }
  }

  private save(): void {
    try {
      const districts: Record<string, { cells: boolean[]; resolved: boolean }> = {};
      for (const d of this.districts) districts[d.id] = { cells: d.cells.map(c => c.collected), resolved: d.resolved };
      localStorage.setItem(STORAGE, JSON.stringify({ version: 1, districts }));
    } catch { /* Local persistence is optional, never a condition of play. */ }
  }

  private buildCity(): void {
    for (let districtIndex = 0; districtIndex < this.districts.length; districtIndex++) {
      const district = this.districts[districtIndex];
      const destinations = this.options.destinations.filter(d => d.district === district.id);
      destinations.forEach((destination, i) => {
        const column = i % 3;
        const row = Math.floor(i / 3);
        const x = district.x - 5 + column * 3.5;
        const y = row === 0 ? 3.4 : 20 + (row - 1) * 3;
        const b: Building = { x, y, width: 2.7, depth: 2.7, height: 52 + (i % 3) * 18,
          destination, dark: document.createElement('canvas'), lit: document.createElement('canvas'), left: 0, top: 0 };
        this.bakeBuilding(b, district, false);
        this.bakeBuilding(b, district, true);
        const index = this.buildings.push(b) - 1;
        this.drawables.push({ depth: b.x + b.y + b.width + b.depth, kind: 'building', index, district: districtIndex });
        for (let gy = 1; gy < ROWS - 1; gy++) for (let gx = 1; gx < COLS - 1; gx++) {
          if (this.insideBuilding(gx, gy, b, 0.38)) this.blocked[gy * COLS + gx] = 1;
        }
      });
      district.cells.forEach((cell, index) => this.drawables.push({ depth: cell.x + cell.y, kind: 'cell', index, district: districtIndex }));
      this.drawables.push({ depth: district.fire.x + district.fire.y, kind: 'fire', index: 0, district: districtIndex });
    }
    this.drawables.sort((a, b) => a.depth - b.depth);
  }

  private bakeGround(): void {
    this.ground.width = 2040;
    this.ground.height = 1150;
    const c = this.ground.getContext('2d')!;
    c.translate(790, 80);
    polygon(c, [projectX(0, 0), 0, projectX(41, 0), projectY(41, 0), projectX(41, 27), projectY(41, 27), projectX(0, 27), projectY(0, 27)], '#172b2b');
    polygon(c, [projectX(0, 27), projectY(0, 27), projectX(41, 27), projectY(41, 27), projectX(41, 27), projectY(41, 27) + 32, projectX(0, 27), projectY(0, 27) + 32], '#0d1c23');
    polygon(c, [projectX(41, 0), projectY(41, 0), projectX(41, 27), projectY(41, 27), projectX(41, 27), projectY(41, 27) + 32, projectX(41, 0), projectY(41, 0) + 32], '#14232b');
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const district = this.districts.reduce((best, d) => Math.abs(x - d.x) < Math.abs(x - best.x) ? d : best);
      const plaza = Math.abs(x - district.x) < 5 && y > 6 && y < 19;
      const road = y >= 11 && y <= 14;
      const color = road ? ((x + y) % 2 ? '#31434b' : '#30414a') : plaza ? ((x + y) % 2 ? '#293c3e' : '#2b3e40') : ((x * 7 + y * 3) % 5 ? '#1b3430' : '#203b34');
      const px = projectX(x, y), py = projectY(x, y);
      polygon(c, [px, py, px + TILE_X, py + TILE_Y, px, py + TILE_Y * 2, px - TILE_X, py + TILE_Y], color);
      if (road && y === 12 && x % 3 === 0) polygon(c, [px - 4, py + 7, px + 15, py + 16.5, px + 11, py + 18.5, px - 8, py + 9], '#6a756a');
      if ((y === 10 || y === 15) && !plaza) polygon(c, [px, py, px + TILE_X, py + TILE_Y, px + TILE_X, py + TILE_Y + 3, px, py + 3], '#60716a');
    }
    for (const d of this.districts) {
      const x = projectX(d.x, 15.7), y = projectY(d.x, 15.7);
      c.save();
      c.translate(x, y);
      c.transform(1, 0.5, -1, 0.5, 0, 0);
      c.font = `bold 15px ${FONT}`;
      c.textAlign = 'center';
      c.fillStyle = d.color;
      c.globalAlpha = 0.7;
      c.fillText(d.title.toUpperCase(), 0, 0);
      c.restore();
      // Small planted medians frame the promenade without blocking its route.
      for (const offset of [-5.6, 5.6]) for (const ty of [8, 18]) {
        const tx = projectX(d.x + offset, ty), py = projectY(d.x + offset, ty);
        ellipse(c, tx + 8, py + 5, 20, 9, '#102425');
        polygon(c, [tx - 14, py, tx, py - 7, tx + 15, py, tx, py + 8], '#6a7970');
        c.fillStyle = '#79614b'; c.fillRect(tx - 2, py - 28, 4, 26);
        polygon(c, [tx, py - 59, tx + 18, py - 28, tx, py - 17, tx - 18, py - 28], '#337b59');
        polygon(c, [tx, py - 59, tx, py - 17, tx - 18, py - 28], '#285e48');
      }
    }
    for (const b of this.buildings) {
      const x = projectX(b.x, b.y), y = projectY(b.x, b.y);
      polygon(c, [x - b.depth * TILE_X, y + b.depth * TILE_Y, x, y + (b.width + b.depth) * TILE_Y, x + b.width * TILE_X + 45, y + b.width * TILE_Y + 22, x + 45, y + 22], '#102226');
    }
  }

  private bakeBuilding(b: Building, district: District, lit: boolean): void {
    const canvas = lit ? b.lit : b.dark;
    const w = b.width * TILE_X, d = b.depth * TILE_X;
    const wy = b.width * TILE_Y, dy = b.depth * TILE_Y, h = b.height;
    b.left = -d - 24;
    b.top = -h - 44;
    canvas.width = Math.ceil(w + d + 48);
    canvas.height = Math.ceil(h + wy + dy + 70);
    const c = canvas.getContext('2d')!;
    c.translate(-b.left, -b.top);
    const palette = district.id === 'community' ? ['#466d65', '#294b48', '#7fa88c'] : district.id === 'school' ? ['#80634b', '#544e42', '#c0a078'] : ['#5d577d', '#393c5b', '#9491b4'];
    polygon(c, [-d, dy, 0, wy + dy, 0, wy + dy - h, -d, dy - h], palette[0]);
    polygon(c, [0, wy + dy, w, wy, w, wy - h, 0, wy + dy - h], palette[1]);
    polygon(c, [0, -h, w, wy - h, 0, wy + dy - h, -d, dy - h], palette[2]);
    polygon(c, [-d, dy - h, 0, wy + dy - h, w, wy - h, w, wy - h + 5, 0, wy + dy - h + 5, -d, dy - h + 5], '#b5c4b5');
    // Roof equipment and inset skylight, with a different silhouette in each district.
    polygon(c, [-27, 20 - h, 10, 38 - h, 34, 26 - h, -3, 8 - h], '#243b49');
    polygon(c, [-23, 20 - h, 10, 35 - h, 28, 26 - h, -3, 11 - h], lit ? '#8ae2da' : '#466d7a');
    c.strokeStyle = '#a3c5c1'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(2, 12 - h); c.lineTo(2, 31 - h); c.stroke();
    if (district.id === 'labs') {
      c.strokeStyle = '#bec8de'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(38, 30 - h); c.lineTo(38, -14 - h); c.stroke();
      ellipse(c, 38, -14 - h, 5, 3, district.color);
      polygon(c, [38, -8 - h, 52, -1 - h, 38, 4 - h], district.color);
    } else if (district.id === 'school') {
      polygon(c, [-51, 31 - h, -36, 37 - h, -36, 18 - h, -51, 12 - h], '#d7b786');
      polygon(c, [-51, 12 - h, -36, 18 - h, -26, 13 - h, -41, 6 - h], '#edcf9c');
    } else {
      c.fillStyle = '#304c44'; c.fillRect(-44, 18 - h, 5, 14);
      ellipse(c, -41, 15 - h, 14, 9, '#66ba83');
    }
    for (let floor = 0; floor < Math.floor(h / 22); floor++) for (let i = 0; i < 3; i++) {
      const t = 0.2 + i * 0.27;
      const x = -d + d * t, y = dy + wy * t - 14 - floor * 22;
      polygon(c, [x, y, x + 12, y + 6, x + 12, y - 5, x, y - 11], lit ? '#ffe6a0' : '#1b3439');
      const rx = w * t, ry = wy + dy - dy * t - 14 - floor * 22;
      polygon(c, [rx, ry, rx + 12, ry - 6, rx + 12, ry - 17, rx, ry - 11], lit ? '#b8eed1' : '#192b34');
    }
    polygon(c, [-15, wy + dy - 7, -3, wy + dy - 1, -3, wy + dy - 24, -15, wy + dy - 30], '#112e34');
    c.strokeStyle = district.color; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-16, wy + dy - 31); c.lineTo(-2, wy + dy - 24); c.stroke();
    // Every supplied destination has its own visible landmark label.
    c.font = `600 10px ${FONT}`;
    const title = b.destination.title;
    const max = canvas.width - 12;
    const words = title.split(' ');
    let first = '', second = '';
    for (const word of words) {
      if (!second && c.measureText(`${first} ${word}`.trim()).width <= max) first = `${first} ${word}`.trim();
      else second = `${second} ${word}`.trim();
    }
    const labelWidth = Math.min(max, Math.max(c.measureText(first).width, c.measureText(second).width) + 18);
    const labelY = -h - (second ? 34 : 23);
    c.fillStyle = '#0c1b22'; c.fillRect(-labelWidth / 2, labelY, labelWidth, second ? 29 : 18);
    c.fillStyle = district.color; c.fillRect(-labelWidth / 2, labelY, 2, second ? 29 : 18);
    c.fillStyle = '#e8f1ee'; c.textAlign = 'center';
    c.fillText(first, 0, labelY + 12, max - 10);
    if (second) c.fillText(second, 0, labelY + 24, max - 10);
  }

  private makeTravelButtons(): void {
    const nav = this.element('.district-travel');
    for (const d of this.districts) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'district-travel-button';
      button.style.setProperty('--district-color', d.color);
      button.textContent = d.title;
      button.setAttribute('aria-label', `Walk to ${d.title} along the city roads`);
      button.addEventListener('click', () => {
        if (this.paused) this.setPaused(false, false);
        this.canvas.focus({ preventScroll: true });
        this.navigate(d.x, 12);
        this.announce(`Walking to ${d.title}. Tap the ground or use movement keys to change course.`);
      });
      nav.append(button);
      this.travelButtons.push(button);
    }
  }

  private bindEvents(): void {
    this.element('.district-exit').addEventListener('click', () => this.exit());
    this.element('.district-directory').addEventListener('click', () => this.openDirectory());
    this.element('.district-close').addEventListener('click', () => this.closeDirectory());
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused));
    this.resumeButton.addEventListener('click', () => this.setPaused(false));
    this.replayButton.addEventListener('click', () => this.replay());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.closeDirectory(); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.closeDirectory(); });
    this.canvas.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => {
      this.keys.delete(event.code);
      if (event.code === 'Space') this.sprayHeld = false;
    });
    this.root.addEventListener('keydown', event => {
      if (event.code === 'Escape' && this.running && !this.dialog.open) { event.preventDefault(); this.exit(); }
      if (event.code === 'KeyP' && this.running && !this.dialog.open && event.target !== this.canvas) {
        event.preventDefault(); if (!event.repeat) this.setPaused(!this.paused);
      }
    });
    this.canvas.addEventListener('blur', () => { this.keys.clear(); this.sprayHeld = false; this.spraying = false; });
    this.canvas.addEventListener('pointerdown', event => this.tap(event));
    this.canvas.addEventListener('pointercancel', () => this.setPaused(true, false));
    this.water.addEventListener('pointerdown', event => {
      if (!this.running || this.paused || this.dialog.open) return;
      event.preventDefault();
      this.clearInput();
      this.canvas.focus({ preventScroll: true });
      this.water.setPointerCapture(event.pointerId);
      this.sprayHeld = true;
      this.wake();
    });
    this.water.addEventListener('pointerup', () => { this.sprayHeld = false; this.spraying = false; this.draw(); });
    this.water.addEventListener('lostpointercapture', () => { this.sprayHeld = false; this.spraying = false; });
    this.water.addEventListener('pointercancel', () => this.setPaused(true, false));
    this.water.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!this.paused) { this.sprayHeld = true; this.wake(); }
      }
    });
    this.water.addEventListener('keyup', () => { this.sprayHeld = false; });
    this.water.addEventListener('blur', () => { this.sprayHeld = false; });
    window.addEventListener('blur', () => { if (this.running) this.setPaused(true, false); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.running) this.setPaused(true, false); this.stop(); }
      else { this.draw(); this.wake(); }
    });
    document.addEventListener('focusin', event => {
      if (this.running && event.target instanceof Node && !this.root.contains(event.target)) this.setPaused(true, false);
    });
    this.reduced.addEventListener('change', () => { this.draw(); this.wake(); });
  }

  private keyDown(event: KeyboardEvent): void {
    if (!this.running || document.activeElement !== this.canvas || this.dialog.open) return;
    if (event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) this.setPaused(!this.paused); return; }
    if (event.code === 'Escape') return; // Handled once by the root.
    if (this.paused) return;
    if (event.code === 'Enter') {
      event.preventDefault();
      let nearest: Building | undefined;
      let nearestDistance = 4.5;
      for (const building of this.buildings) {
        const dx = this.player.x - clamp(this.player.x, building.x, building.x + building.width);
        const dy = this.player.y - clamp(this.player.y, building.y, building.y + building.depth);
        const length = Math.hypot(dx, dy);
        if (length < nearestDistance) { nearest = building; nearestDistance = length; }
      }
      if (nearest) this.openDirectory(nearest.destination);
      else this.openDirectory();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
      event.preventDefault();
      if (event.code === 'Space') { this.route.length = 0; this.sprayHeld = true; }
      else { this.route.length = 0; this.keys.add(event.code); }
      this.wake();
    }
  }

  private tap(event: PointerEvent): void {
    if (!this.running || this.paused || this.dialog.open || event.button !== 0) return;
    this.canvas.focus({ preventScroll: true });
    const rect = this.canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left - this.width / 2) / this.zoom + this.camera.x;
    const py = (event.clientY - rect.top - this.height * 0.53) / this.zoom + this.camera.y;
    // Supplies and fire use generous screen-space tap targets, not their tiny ground footprint.
    for (const district of this.districts) {
      for (const cell of district.cells) {
        if (!cell.collected && Math.hypot((px - projectX(cell.x, cell.y)) * this.zoom, (py - projectY(cell.x, cell.y) + 17) * this.zoom) < 25) {
          this.clearInput(); this.navigate(cell.x, cell.y); return;
        }
      }
      if (!district.resolved && Math.hypot((px - projectX(district.fire.x, district.fire.y)) * this.zoom, (py - projectY(district.fire.x, district.fire.y) + 23) * this.zoom) < 30) {
        this.clearInput(); this.navigate(district.fire.x, district.fire.y); return;
      }
    }
    // Reverse painter order makes the visible, frontmost landmark the click target.
    for (let i = this.drawables.length - 1; i >= 0; i--) {
      const drawable = this.drawables[i];
      if (drawable.kind !== 'building') continue;
      const b = this.buildings[drawable.index];
      const bx = px - projectX(b.x, b.y), by = py - projectY(b.x, b.y);
      const w = b.width * TILE_X, d = b.depth * TILE_X;
      const roofBottom = (b.width + b.depth) * TILE_Y;
      const leftY = b.depth * TILE_Y;
      const rightY = b.width * TILE_Y;
      if (bx >= -d && bx <= w) {
        const upper = bx < 0 ? -bx * 0.5 - b.height : bx * 0.5 - b.height;
        const lower = bx < 0 ? leftY + (bx + d) * 0.5 : roofBottom - bx * 0.5;
        if (by >= upper && by <= lower && by <= Math.max(roofBottom, rightY)) { this.openDirectory(b.destination); return; }
      }
    }
    this.clearInput();
    this.navigate((py / TILE_Y + px / TILE_X) / 2, (py / TILE_Y - px / TILE_X) / 2);
  }

  private insideBuilding(x: number, y: number, b: Building, margin: number): boolean {
    return x > b.x - margin && x < b.x + b.width + margin && y > b.y - margin && y < b.y + b.depth + margin;
  }

  private walkable(x: number, y: number): boolean {
    if (x < 1 || y < 1 || x > COLS - 2 || y > ROWS - 2) return false;
    for (const building of this.buildings) if (this.insideBuilding(x, y, building, 0.3)) return false;
    return true;
  }

  private segmentClear(ax: number, ay: number, bx: number, by: number): boolean {
    const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 6));
    for (let i = 1; i <= count; i++) if (!this.walkable(ax + (bx - ax) * i / count, ay + (by - ay) * i / count)) return false;
    return true;
  }

  /** Cardinal-grid BFS with visible start/end connectors: taps cannot cut through buildings. */
  private navigate(x: number, y: number): void {
    x = clamp(x, 1, COLS - 2); y = clamp(y, 1, ROWS - 2);
    let start = -1, startDistance = Infinity, target = -1, targetDistance = Infinity;
    for (let gy = 1; gy < ROWS - 1; gy++) for (let gx = 1; gx < COLS - 1; gx++) {
      const id = gy * COLS + gx;
      if (this.blocked[id]) continue;
      const sd = Math.hypot(gx - this.player.x, gy - this.player.y);
      if (sd < startDistance && this.segmentClear(this.player.x, this.player.y, gx, gy)) { start = id; startDistance = sd; }
      const td = Math.hypot(gx - x, gy - y);
      if (td < targetDistance) { target = id; targetDistance = td; }
    }
    if (start < 0 || target < 0) return;
    const previous = new Int32Array(COLS * ROWS).fill(-1);
    const queue = new Int32Array(COLS * ROWS);
    let head = 0, end = 1;
    queue[0] = start; previous[start] = start;
    const offsets = [-1, 1, -COLS, COLS];
    while (head < end && previous[target] < 0) {
      const current = queue[head++];
      for (const offset of offsets) {
        const next = current + offset;
        const nx = next % COLS, ny = Math.floor(next / COLS);
        if (nx < 1 || nx > COLS - 2 || ny < 1 || ny > ROWS - 2 || previous[next] >= 0 || this.blocked[next]) continue;
        previous[next] = current; queue[end++] = next;
      }
    }
    if (previous[target] < 0) { this.options.audio?.cue('blocked'); this.announce('That route is blocked. Try the central promenade.'); return; }
    const path: Point[] = [];
    for (let node = target; node !== start; node = previous[node]) path.push({ x: node % COLS, y: Math.floor(node / COLS) });
    path.push({ x: start % COLS, y: Math.floor(start / COLS) });
    path.reverse();
    const last = path[path.length - 1];
    if (this.segmentClear(last.x, last.y, x, y)) path.push({ x, y });
    this.route = path;
    this.routeIndex = 0;
    this.wake();
  }

  private clearInput(): void {
    this.keys.clear(); this.route.length = 0; this.routeIndex = 0;
    this.sprayHeld = false; this.spraying = false; this.moving = false;
  }

  private setPaused(on: boolean, focus = true): void {
    if (!this.running) return;
    this.paused = on;
    this.clearInput();
    this.pausePanel.hidden = !on || this.dialog.open;
    this.pauseButton.textContent = on ? 'Resume' : 'Pause';
    if (on) { this.stop(); if (focus && !this.dialog.open) this.resumeButton.focus({ preventScroll: true }); }
    else { if (focus) this.canvas.focus({ preventScroll: true }); this.wake(); }
    this.draw();
  }

  private openDirectory(destination?: Destination): void {
    if (!this.running) return;
    if (this.dialog.open) { this.closeDirectory(); return; }
    this.panelWasPaused = this.paused;
    this.clearInput();
    this.stop();
    this.pausePanel.hidden = true;
    this.dialogTitle.textContent = destination ? destination.title : 'Where do you want to go?';
    this.dialogBody.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'district-directory-note';
    intro.textContent = 'Explore the real community at your own pace. No supplies, points or firefighting required.';
    this.dialogBody.append(intro);
    if (destination) {
      this.appendDestination(destination, this.dialogBody);
      const all = document.createElement('button'); all.type = 'button'; all.className = 'district-button district-all'; all.textContent = 'All destinations';
      all.addEventListener('click', () => { this.dialog.close(); this.openDirectory(); });
      this.dialogBody.append(all);
    } else {
      for (const d of this.districts) {
        const section = document.createElement('section');
        section.className = 'district-directory-section';
        const heading = document.createElement('h3'); heading.textContent = d.title; heading.style.color = d.color;
        section.append(heading);
        for (const item of this.options.destinations) if (item.district === d.id) this.appendDestination(item, section);
        this.dialogBody.append(section);
      }
    }
    this.dialog.showModal();
    this.element<HTMLButtonElement>('.district-close').focus({ preventScroll: true });
    this.draw();
  }

  private appendDestination(destination: Destination, parent: HTMLElement): void {
    const card = document.createElement('article'); card.className = 'district-destination';
    const title = document.createElement('h4'); title.textContent = destination.title;
    const description = document.createElement('p'); description.textContent = destination.description;
    card.append(title, description);
    if (destination.soon) {
      const status = document.createElement('span'); status.className = 'district-coming-soon'; status.textContent = 'Coming soon'; card.append(status);
    } else if (destination.action === 'showcase') {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'district-button'; button.textContent = 'Explore Showcase';
      button.addEventListener('click', () => { this.exit(); this.options.onShowcase(); }); card.append(button);
    } else if (destination.href) {
      const link = document.createElement('a'); link.className = 'district-button'; link.href = destination.href;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = `Visit ${destination.title} ↗`;
      link.setAttribute('aria-label', `Visit ${destination.title} (opens in a new tab)`); card.append(link);
    } else {
      const status = document.createElement('span'); status.className = 'district-coming-soon'; status.textContent = 'Coming soon'; card.append(status);
    }
    parent.append(card);
  }

  private closeDirectory(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    if (!this.running) return;
    this.paused = this.paused || this.panelWasPaused;
    this.pausePanel.hidden = !this.paused;
    if (this.paused) this.resumeButton.focus({ preventScroll: true });
    else this.canvas.focus({ preventScroll: true });
    this.wake(); this.draw();
  }

  private replay(): void {
    for (const d of this.districts) { d.resolved = false; d.progress = 0; for (const c of d.cells) c.collected = false; }
    this.clearInput(); this.player.x = 7; this.player.y = 14;
    this.save(); this.lastHud = ''; this.updateHud(); this.setPaused(false); this.resize();
    this.announce('A fresh local mission. Collect three water cells in each district.');
  }

  private currentDistrict(): District {
    let result = this.districts[0];
    for (const d of this.districts) if (Math.abs(this.player.x - d.x) < Math.abs(this.player.x - result.x)) result = d;
    return result;
  }

  private points(): number {
    let points = 0;
    for (const d of this.districts) { if (d.resolved) points += 50; for (const c of d.cells) if (c.collected) points += 10; }
    return points;
  }

  private update(dt: number): void {
    let vx = 0, vy = 0;
    const k = this.keys;
    // Arrow directions are screen-relative, not the diagonally rotated world axes.
    if (k.has('ArrowRight') || k.has('KeyD')) { vx += 1; vy -= 1; }
    if (k.has('ArrowLeft') || k.has('KeyA')) { vx -= 1; vy += 1; }
    if (k.has('ArrowDown') || k.has('KeyS')) { vx += 1; vy += 1; }
    if (k.has('ArrowUp') || k.has('KeyW')) { vx -= 1; vy -= 1; }
    const oldX = this.player.x, oldY = this.player.y;
    const speed = MOVE_SPEED * dt;
    if (vx || vy) {
      const length = Math.hypot(vx, vy); vx = vx / length * speed; vy = vy / length * speed;
      if (this.walkable(this.player.x + vx, this.player.y + vy)) { this.player.x += vx; this.player.y += vy; }
      else {
        if (this.walkable(this.player.x + vx, this.player.y)) this.player.x += vx;
        if (this.walkable(this.player.x, this.player.y + vy)) this.player.y += vy;
      }
    } else if (this.routeIndex < this.route.length) {
      const target = this.route[this.routeIndex];
      const dx = target.x - this.player.x, dy = target.y - this.player.y;
      const length = Math.hypot(dx, dy);
      if (length <= speed) { this.player.x = target.x; this.player.y = target.y; this.routeIndex++; }
      else { this.player.x += dx / length * speed; this.player.y += dy / length * speed; }
    }
    this.moving = oldX !== this.player.x || oldY !== this.player.y;
    if (this.moving) { if ((this.player.x - oldX) - (this.player.y - oldY) !== 0) this.face = (this.player.x - oldX) - (this.player.y - oldY) > 0 ? 1 : -1; this.phase += dt * 11; }
    for (const district of this.districts) for (const cell of district.cells) {
      if (!cell.collected && distance(this.player, cell) < CELL_REACH) {
        cell.collected = true;
        const count = district.cells.filter(c => c.collected).length;
        this.options.audio?.cue('collect');
        this.announce(count === 3 ? `${district.title}: hose ready. Walk near the fire and hold Space or the water button.` : `${district.title}: water cell ${count} of 3 collected. Ten local city points.`);
        this.save();
      }
    }
    const district = this.currentDistrict();
    this.spraying = this.sprayHeld && !district.resolved && district.cells.every(c => c.collected) && distance(this.player, district.fire) <= FIRE_REACH;
    if (this.spraying) {
      if (district.progress === 0) this.options.audio?.cue('hose');
      district.progress = Math.min(1, district.progress + dt / HOLD_SECONDS);
      if (district.progress >= 1) {
        district.resolved = true; this.spraying = false;
        this.options.audio?.cue('restored');
        this.save();
        this.announce(this.districts.every(d => d.resolved) ? 'All three districts restored! 240 local city points. Explore any destination, or replay the city.' : `${district.title} restored. Lights on! Fifty local city points. Choose the next district to keep exploring.`);
      }
    }
    this.followCamera(dt);
    if (this.moving || this.sprayHeld || !this.lastHud) this.updateHud();
  }

  private updateHud(): void {
    const d = this.currentDistrict();
    let count = 0;
    for (const cell of d.cells) if (cell.collected) count++;
    let resolved = 0;
    for (const item of this.districts) if (item.resolved) resolved++;
    let closest: Cell | undefined, length = Infinity;
    for (const cell of d.cells) if (!cell.collected) { const l = distance(this.player, cell); if (l < length) { closest = cell; length = l; } }
    const fireDistance = distance(this.player, d.fire);
    let guidance = '';
    if (resolved === 3) guidance = 'City restored. All destinations are open — explore or play again.';
    else if (d.resolved) guidance = `${d.title} is glowing again. Choose another district above to walk there.`;
    else if (closest) guidance = `Next: cyan water cell ${count + 1}/3 · ${Math.ceil(length * 4)} m away · tap its marker to walk.`;
    else if (fireDistance > FIRE_REACH) guidance = `Hose ready · walk to the orange fire · ${Math.ceil(fireDistance * 4)} m away.`;
    else guidance = `In range · hold Space or WATER to restore ${d.title} · ${Math.round(d.progress * 100)}%.`;
    const text = `${d.id}/${count}/${resolved}/${guidance}/${this.points()}`;
    if (text === this.lastHud) return;
    this.lastHud = text;
    this.mission.textContent = d.title;
    this.mission.style.color = d.color;
    this.counter.textContent = `${count}/3 water cells · ${resolved}/3 restored · ${this.points()} city pts`;
    this.guidance.textContent = guidance;
    this.water.setAttribute('aria-disabled', String(count < 3 || d.resolved || fireDistance > FIRE_REACH));
    this.element('.district-water-label').textContent = d.resolved ? 'Restored' : count === 3 ? 'Water' : `${count}/3 water`;
    this.water.classList.toggle('district-water--ready', count === 3 && !d.resolved && fireDistance <= FIRE_REACH);
    this.replayButton.hidden = resolved !== 3;
    this.districts.forEach((item, i) => {
      this.travelButtons[i].textContent = `${item.resolved ? '✓ ' : ''}${item.title}`;
      this.travelButtons[i].setAttribute('aria-current', item.id === d.id ? 'location' : 'false');
    });
  }

  private announce(text: string): void { this.announcement.textContent = text; }

  private resize(): void {
    const rect = this.root.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.zoom = this.running ? (this.width < 600 ? 0.88 : this.width < 1000 ? 1 : 1.16) : Math.min(this.width / 1800, this.height / 850) * 1.1;
    this.camera.x = this.running ? projectX(this.player.x, this.player.y) : projectX(20.5, 13.5);
    this.camera.y = this.running ? projectY(this.player.x, this.player.y) - 14 : projectY(20.5, 13.5) - 55;
    this.followCamera(1);
    this.draw();
  }

  private followCamera(dt: number): void {
    if (!this.running) return;
    const targetX = clamp(projectX(this.player.x, this.player.y), -590, 1000);
    const targetY = clamp(projectY(this.player.x, this.player.y) - 14, 150, 820);
    const blend = this.reduced.matches ? 1 : Math.min(1, dt * 7);
    this.camera.x += (targetX - this.camera.x) * blend;
    this.camera.y += (targetY - this.camera.y) * blend;
  }

  private wake(): void {
    if (!this.frame && this.running && !this.paused && !this.suspended && !document.hidden && !this.dialog.open) {
      // RAF timestamps mark frame start, which can precede performance.now() in a
      // pointer handler. Establish the clock from RAF itself after every wake.
      this.lastTime = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly tick = (time: number): void => {
    this.frame = 0;
    if (!this.running || this.paused || this.suspended || document.hidden || this.dialog.open) return;
    const dt = this.lastTime === 0 ? 0 : Math.max(0, Math.min(0.04, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.update(dt);
    this.draw(time / 1000);
    if (!this.reduced.matches || this.keys.size || this.sprayHeld || this.routeIndex < this.route.length) this.frame = requestAnimationFrame(this.tick);
  };

  private draw(time = 0): void {
    if (this.suspended || document.hidden) return;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = '#071218'; c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(this.width / 2, this.height * 0.53);
    c.scale(this.zoom, this.zoom);
    c.translate(-this.camera.x, -this.camera.y);
    c.drawImage(this.ground, -790, -80);
    if (this.running && this.routeIndex < this.route.length) this.drawRoute(c);
    const playerDepth = this.player.x + this.player.y;
    let playerDrawn = false;
    for (const drawable of this.drawables) {
      if (!playerDrawn && drawable.depth > playerDepth) { this.drawDino(c); playerDrawn = true; }
      const district = this.districts[drawable.district];
      if (drawable.kind === 'building') {
        const b = this.buildings[drawable.index];
        c.drawImage(district.resolved ? b.lit : b.dark, projectX(b.x, b.y) + b.left, projectY(b.x, b.y) + b.top);
      } else if (drawable.kind === 'cell') {
        const cell = district.cells[drawable.index];
        if (!cell.collected) this.drawCell(c, cell, time);
      } else this.drawFire(c, district, time);
    }
    if (!playerDrawn) this.drawDino(c);
    if (this.spraying) this.drawWater(c, this.currentDistrict(), time);
    this.drawDistrictLabels(c);
    c.restore();
    if (this.running) this.drawTargetArrow(c);
  }

  private drawRoute(c: CanvasRenderingContext2D): void {
    c.strokeStyle = '#8fe5d17a'; c.lineWidth = 3; c.setLineDash([4, 8]);
    c.beginPath(); c.moveTo(projectX(this.player.x, this.player.y), projectY(this.player.x, this.player.y));
    for (let i = this.routeIndex; i < this.route.length; i++) c.lineTo(projectX(this.route[i].x, this.route[i].y), projectY(this.route[i].x, this.route[i].y));
    c.stroke(); c.setLineDash([]);
    const end = this.route[this.route.length - 1];
    c.strokeStyle = '#a9f2d8'; c.beginPath(); c.ellipse(projectX(end.x, end.y), projectY(end.x, end.y), 13, 6, 0, 0, Math.PI * 2); c.stroke();
  }

  private drawCell(c: CanvasRenderingContext2D, cell: Cell, time: number): void {
    const x = projectX(cell.x, cell.y), y = projectY(cell.x, cell.y);
    const bob = this.reduced.matches || !this.running || this.paused ? 0 : Math.sin(time * 2.8 + cell.index) * 2;
    ellipse(c, x, y, 15, 7, '#63e1ef22');
    c.strokeStyle = '#64ddeb'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
    c.save(); c.translate(x, y - 8 + bob);
    polygon(c, [-9, -18, 4, -23, 11, -18, -2, -13], '#c1f7ff');
    polygon(c, [-9, -18, -2, -13, -2, 4, -9, -1], '#36a8c6');
    polygon(c, [-2, -13, 11, -18, 11, -1, -2, 4], '#65d9f0');
    polygon(c, [2, -14, 7, -16, 7, -11, 2, -9], '#e5ffff');
    c.fillStyle = '#0b4159'; c.font = `bold 10px ${FONT}`; c.textAlign = 'center'; c.fillText(String(cell.index + 1), 4, -2);
    c.restore();
  }

  private drawFire(c: CanvasRenderingContext2D, district: District, time: number): void {
    const x = projectX(district.fire.x, district.fire.y), y = projectY(district.fire.x, district.fire.y);
    ellipse(c, x, y, 28, 13, district.resolved ? '#6af0ba22' : '#fa874326');
    polygon(c, [x, y - 14, x + 23, y - 3, x, y + 9, x - 23, y - 3], '#758177');
    polygon(c, [x - 23, y - 3, x, y + 9, x + 23, y - 3, x + 23, y + 3, x, y + 15, x - 23, y + 3], '#414d48');
    if (district.resolved) {
      c.strokeStyle = district.color; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - 8, y - 9); c.lineTo(x - 1, y - 3); c.lineTo(x + 11, y - 18); c.stroke();
      c.font = `600 10px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#c6f8dc'; c.fillText('RESTORED', x, y - 28);
      return;
    }
    const animate = !this.reduced.matches && this.running && !this.paused;
    const wobble = animate ? Math.sin(time * 5 + district.x) * 3 : 0;
    const remaining = 1 - district.progress * 0.6;
    c.save(); c.translate(x, y - 4); c.scale(remaining, remaining);
    for (let i = 0; i < 3; i++) {
      const drift = animate ? Math.sin(time + i) * 4 : 0;
      ellipse(c, drift + (i - 1) * 7, -55 - i * 17, 15 + i * 5, 18 + i * 3, '#26333b9c');
    }
    polygon(c, [-21, -1, -24, -22, -14, -14, -9, -42 + wobble, 1, -29, 9, -57 - wobble, 17, -24, 23, -35, 25, -8, 11, 3, -7, 6], '#f57a40');
    polygon(c, [-11, 0, -14, -17, -5, -10, 1, -34, 9, -17, 15, -22, 14, -4, 4, 4], '#ffcd67');
    polygon(c, [-4, 0, 0, -16, 7, -5, 5, 3], '#fff0b6');
    c.restore();
    c.fillStyle = '#10252c'; c.fillRect(x - 30, y + 20, 60, 5);
    c.fillStyle = '#78dedc'; c.fillRect(x - 30, y + 20, 60 * district.progress, 5);
    c.font = `600 10px ${FONT}`; c.textAlign = 'center'; c.fillStyle = '#ffe1b2';
    c.fillText(district.cells.every(cell => cell.collected) ? 'HOSE READY' : 'NEEDS 3 CELLS', x, y + 39);
  }

  private drawDino(c: CanvasRenderingContext2D): void {
    const x = projectX(this.player.x, this.player.y), y = projectY(this.player.x, this.player.y);
    const bob = this.moving && !this.reduced.matches ? -Math.abs(Math.sin(this.phase)) * 2 : 0;
    ellipse(c, x, y + 1, 22, 9, '#07151888');
    c.strokeStyle = '#b6fbd7'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y + 1, 24, 11, 0, 0, Math.PI * 2); c.stroke();
    c.save(); c.translate(x, y); c.scale(this.face * 1.2, 1.2);
    polygon(c, [-8, -20 + bob, -29, -9 + bob, -21, -7 + bob, -4, -10 + bob], '#49b77b');
    polygon(c, [-13, -21 + bob, -12, -30 + bob, -5, -25 + bob, -3, -33 + bob, 4, -25 + bob], '#2d785c');
    const swing = this.moving && !this.reduced.matches ? Math.sin(this.phase) * 3 : 0;
    ellipse(c, -5 - swing, -4, 5, 7, '#287859');
    ellipse(c, 7 + swing, -4, 5, 7, '#50c98a');
    ellipse(c, 0, -18 + bob, 13, 12, '#50c98a');
    ellipse(c, 5, -17 + bob, 7, 9, '#afe6a4');
    c.fillStyle = '#ffd171'; c.fillRect(-11, -13 + bob, 24, 3);
    ellipse(c, 10, -32 + bob, 9, 10, '#5bd592');
    ellipse(c, 18, -29 + bob, 8, 6, '#5bd592');
    ellipse(c, 14, -34 + bob, 3, 3.4, '#f0fff1');
    ellipse(c, 15, -34 + bob, 1.5, 2, '#102e2c');
    ellipse(c, 23, -31 + bob, 1, 1, '#173c31');
    c.strokeStyle = '#226649'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(17, -25 + bob); c.lineTo(23, -26 + bob); c.stroke();
    ellipse(c, 8, -40 + bob, 14, 3, '#983e42');
    c.fillStyle = '#ee625a'; c.beginPath(); c.ellipse(9, -42 + bob, 10, 8, 0, Math.PI, Math.PI * 2); c.fill();
    c.fillStyle = '#ff8c70'; c.fillRect(5, -51 + bob, 4, 9);
    polygon(c, [14, -48 + bob, 20, -47 + bob, 20, -41 + bob, 17, -39 + bob, 14, -42 + bob], '#ffd581');
    ellipse(c, 10, -18 + bob, 5, 4, '#3cad79');
    c.fillStyle = '#becdd1'; c.fillRect(14, -21 + bob, 14, 5);
    c.fillStyle = '#ffc878'; c.fillRect(25, -22 + bob, 4, 7);
    c.restore();
  }

  private drawWater(c: CanvasRenderingContext2D, district: District, time: number): void {
    const x = projectX(this.player.x, this.player.y) + this.face * 29, y = projectY(this.player.x, this.player.y) - 23;
    const tx = projectX(district.fire.x, district.fire.y), ty = projectY(district.fire.x, district.fire.y) - 23;
    c.lineCap = 'round'; c.strokeStyle = '#8de9f4b8'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + tx) / 2, Math.min(y, ty) - 26, tx, ty); c.stroke();
    c.strokeStyle = '#e7ffff'; c.lineWidth = 2; c.stroke();
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + (this.reduced.matches ? 0 : time * 3);
      ellipse(c, tx + Math.cos(angle) * 13, ty + Math.sin(angle) * 10, 2, 2, '#b0f4ff');
    }
  }

  private drawDistrictLabels(c: CanvasRenderingContext2D): void {
    for (const d of this.districts) {
      const x = projectX(d.x, 1), y = projectY(d.x, 1) - 75;
      c.font = `600 12px ${FONT}`; c.textAlign = 'center';
      c.fillStyle = '#0c1b22'; c.fillRect(x - 64, y - 18, 128, 39);
      c.fillStyle = d.color; c.fillRect(x - 64, y - 18, 128, 2);
      c.fillText(d.title.toUpperCase(), x, y - 1);
      c.font = `9px ${FONT}`; c.fillStyle = '#b6c9c8';
      let count = 0;
      for (const cell of d.cells) if (cell.collected) count++;
      c.fillText(d.resolved ? 'LIGHTS ON' : `${count}/3 WATER CELLS`, x, y + 13);
    }
  }

  private drawTargetArrow(c: CanvasRenderingContext2D): void {
    const d = this.currentDistrict();
    if (d.resolved) return;
    let target: Point = d.fire, length = Infinity, isCell = false;
    for (const cell of d.cells) if (!cell.collected) {
      const l = distance(this.player, cell);
      if (l < length) { target = cell; length = l; isCell = true; }
    }
    const sx = this.width / 2 + (projectX(target.x, target.y) - this.camera.x) * this.zoom;
    const sy = this.height * 0.53 + (projectY(target.x, target.y) - this.camera.y) * this.zoom;
    const x = clamp(sx, 32, this.width - 32), y = clamp(sy - 49, 212, this.height - 163);
    c.fillStyle = isCell ? '#8ae9f6' : '#ffd18d';
    c.font = `600 10px ${FONT}`; c.textAlign = 'center';
    c.fillText(isCell ? 'WATER' : 'FIRE', x, y - 9);
    polygon(c, [x - 5, y - 4, x + 5, y - 4, x, y + 2], isCell ? '#8ae9f6' : '#ffd18d');
  }
}
