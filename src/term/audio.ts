/**
 * kracked.sh — procedural chiptune.
 *
 * No audio files: every note is synthesised from oscillators so the whole
 * soundtrack costs bytes, not a download. The score is a slow, minor-key
 * support loop rather than a melody, because it plays under browsing, not
 * over it. Sound only ever starts from a real click, so the page never makes
 * noise at a visitor who did not ask for it, and the choice is remembered.
 */

const STORAGE = 'kracked-music-v1';

/** A minor pentatonic, so any note can follow any other without clashing. */
const SCALE = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

/** Eight bars of (lead, bass) as scale indices; -1 rests. */
const LEAD: number[] = [0, 2, 4, 3, 5, 4, 2, 1, 0, 2, 4, 6, 5, 4, 3, 2];
const BASS: number[] = [0, -1, 3, -1, 5, -1, 3, -1, 0, -1, 3, -1, 4, -1, 2, -1];

const LEAD_STEP = 0.42; // seconds per lead step
const BASS_STEP = LEAD_STEP * 2;

type Voice = { osc: OscillatorNode; gain: GainNode };

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private timer = 0;
  private step = 0;
  private nextLead = 0;
  private nextBass = 0;
  private playing = false;
  private wanted = false;

  constructor() {
    // A remembered "on" still waits for a gesture: browsers refuse audio before one.
    this.wanted = read();
  }

  get enabled(): boolean { return this.wanted; }

  /** Called from a real user gesture. Safe to call repeatedly. */
  enable(): void {
    this.wanted = true;
    write(true);
    this.start();
  }

  disable(): void {
    this.wanted = false;
    write(false);
    this.stop();
  }

  toggle(): boolean {
    if (this.wanted && this.playing) this.disable();
    else this.enable();
    return this.wanted;
  }

  /** Resume only after a gesture the browser already saw; never noisy on load. */
  resume(): void {
    if (!this.wanted) return;
    this.start();
  }

  suspend(): void {
    this.stop();
  }

  /** Short, distinct cues. Quiet enough to sit under the music. */
  cue(kind: 'collect' | 'hose' | 'restored' | 'blocked' | 'click'): void {
    if (!this.playing || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const table: Record<string, { freq: number; ms: number; type: OscillatorType; step?: number }> = {
      collect: { freq: 660, ms: 150, type: 'triangle' },
      hose: { freq: 330, ms: 420, type: 'sine', step: 1.5 },
      restored: { freq: 523.25, ms: 520, type: 'triangle', step: 1.26 },
      blocked: { freq: 180, ms: 220, type: 'square' },
      click: { freq: 880, ms: 60, type: 'square' },
    };
    const spec = table[kind];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, now);
    if (spec.step) osc.frequency.exponentialRampToValueAtTime(spec.freq * (kind === 'blocked' ? 0.6 : 1.5), now + spec.ms / 1000);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === 'restored' ? 0.16 : 0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.ms / 1000);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + spec.ms / 1000 + 0.05);
  }

  private graph(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  private start(): void {
    this.graph();
    if (!this.ctx || !this.musicGain) return;
    void this.ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextLead = this.ctx.currentTime + 0.06;
    this.nextBass = this.nextLead;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stop(): void {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  /** Lookahead scheduler: queue notes slightly ahead of the clock, never in an rAF. */
  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    const horizon = this.ctx.currentTime + 0.25;
    while (this.nextLead < horizon) {
      const index = LEAD[this.step % LEAD.length];
      if (index >= 0) this.note(SCALE[index], this.nextLead, LEAD_STEP * 1.7, 'triangle', 0.9);
      if (Math.abs(this.nextLead - this.nextBass) < 0.001) {
        const bass = BASS[this.step % BASS.length];
        if (bass >= 0) this.note(SCALE[bass] / 4, this.nextBass, BASS_STEP * 1.5, 'sine', 0.7);
        this.nextBass += BASS_STEP;
      }
      this.nextLead += LEAD_STEP;
      this.step++;
    }
  }

  private note(freq: number, at: number, seconds: number, type: OscillatorType, weight: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.5 * weight, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(gain).connect(this.musicGain);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }
}

function read(): boolean {
  try { return localStorage.getItem(STORAGE) === 'on'; } catch { return false; }
}

function write(on: boolean): void {
  try { localStorage.setItem(STORAGE, on ? 'on' : 'off'); } catch { /* private mode */ }
}