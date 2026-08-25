import { SoundKit } from './audio';

export type Phase = 'menu' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'win';

export interface HudData {
  score: number;
  dist: number;
  goal: number;
  lives: number;
  mult: number;
  combo: number;
  tokens: number;
  endless: boolean;
  muted: boolean;
  best: number;
}

export interface RunStats {
  score: number;
  dist: number;
  tokens: number;
  bestCombo: number;
  time: number;
  best: number;
  newBest: boolean;
}

/* ---------------- helpers ---------------- */
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ---------------- world types ---------------- */
interface Building { x: number; w: number; roofY: number; seed: number; }
interface Token { x: number; y: number; gold: boolean; taken: boolean; ph: number; }
interface Drone {
  x: number; y: number; x0: number; x1: number; dir: number; sp: number;
  ph: number; hover: boolean; baseY: number;
}
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; grav: number;
}
interface Popup {
  x: number; y: number; txt: string; color: string;
  life: number; max: number; size: number; center: boolean;
}
interface WebState { ax: number; ay: number; len: number; minLen: number; flash: number; }

/* ---------------- constants ---------------- */
const STREET_Y = 640;
const GRAV = 1500;
const PX_PER_M = 10;
const GOAL_M = 2000;
const START_X = 120;
const GOAL_X = START_X + GOAL_M * PX_PER_M;
const BEST_KEY = 'webslinger-best-v1';
const POP_FONT = 'Bangers, "Comic Sans MS", cursive';

export class WebGame {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private k = 1;                 // device px per logical px
  private W = 1280;              // logical width
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;                 // global clock for animations
  sfx = new SoundKit();

  phase: Phase = 'menu';
  private endless = false;
  private muted = false;
  private best = 0;

  private onHud: (h: HudData) => void;
  private onPhase: (p: Phase, s: RunStats) => void;

  /* player */
  private px = START_X; private py = STREET_Y - 300 - 14;
  private vx = 0; private vy = 0;
  private onGround = true;
  private web: WebState | null = null;
  private invuln = 0;
  private face = 1;
  private runPh = 0;
  private trail: { x: number; y: number }[] = [];
  private deadT = 0; private deadX = 0; private deadY = 0;
  private webCd = 0;
  private releaseLock = false;

  /* world */
  private buildings: Building[] = [];
  private tokens: Token[] = [];
  private drones: Drone[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private genX = 0;
  private prevRoof = STREET_Y - 300;
  private camX = 0; private camY = 0;
  private shake = 0; private flash = 0; private goT = 0;

  /* stats */
  private score = 0;
  private lives = 3;
  private combo = 0;
  private comboT = 0;
  private bestCombo = 0;
  private tokensGot = 0;
  private playT = 0;
  private cdT = 0;
  private cdLast = 9;
  private marker = 250;
  private hudAcc = 0;

  /* input */
  private held = false;
  private steer = 0;
  private keys = new Set<string>();
  private touchId: number | null = null;
  private steerTouch = 0;

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onVis: () => void;
  private onResize: () => void;
  private ptrDown: (e: PointerEvent) => void;
  private ptrUp: (e: PointerEvent) => void;
  private ptrMove: (e: PointerEvent) => void;

  constructor(
    cv: HTMLCanvasElement,
    onHud: (h: HudData) => void,
    onPhase: (p: Phase, s: RunStats) => void,
  ) {
    this.cv = cv;
    this.ctx = cv.getContext('2d')!;
    this.onHud = onHud;
    this.onPhase = onPhase;
    try { this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch { this.best = 0; }

    this.onResize = () => this.resize();
    this.onVis = () => { if (document.hidden && this.phase === 'playing') this.togglePause(); };
    this.onKeyDown = (e) => {
      const c = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
      if (e.repeat) return;
      if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') { this.setHeld(true); return; }
      if (c === 'ArrowLeft' || c === 'KeyA') { this.keys.add('L'); return; }
      if (c === 'ArrowRight' || c === 'KeyD') { this.keys.add('R'); return; }
      if (c === 'KeyP' || c === 'Escape') { this.togglePause(); return; }
      if (c === 'KeyM') { this.toggleMute(); return; }
      if (c === 'KeyR' && this.phase !== 'menu') { this.startRun(); return; }
      if (c === 'Enter' && (this.phase === 'menu' || this.phase === 'gameover' || this.phase === 'win')) {
        this.startRun();
      }
    };
    this.onKeyUp = (e) => {
      const c = e.code;
      if (c === 'Space' || c === 'ArrowUp' || c === 'KeyW') this.setHeld(false);
      if (c === 'ArrowLeft' || c === 'KeyA') this.keys.delete('L');
      if (c === 'ArrowRight' || c === 'KeyD') this.keys.delete('R');
    };
    this.ptrDown = (e) => {
      e.preventDefault();
      this.trackTouch(e, true);
      this.setHeld(true);
    };
    this.ptrUp = (e) => { this.endTouch(e); this.setHeld(false); };
    this.ptrMove = (e) => { if (e.pointerId === this.touchId) this.trackTouch(e, false); };

    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    cv.addEventListener('pointerdown', this.ptrDown);
    window.addEventListener('pointerup', this.ptrUp);
    window.addEventListener('pointercancel', this.ptrUp);
    window.addEventListener('pointermove', this.ptrMove);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    if (document.fonts && document.fonts.load) {
      document.fonts.load(`30px ${POP_FONT.split(',')[0]}`).catch(() => undefined);
    }
    this.resize();
    this.resetWorld();
    this.pushHud();
    this.raf = requestAnimationFrame((ts) => { this.last = ts; this.loop(ts); });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.cv.removeEventListener('pointerdown', this.ptrDown);
    window.removeEventListener('pointerup', this.ptrUp);
    window.removeEventListener('pointercancel', this.ptrUp);
    window.removeEventListener('pointermove', this.ptrMove);
  }

  /* touch steering: left/right half of the screen */
  private trackTouch(e: PointerEvent, down: boolean) {
    if (e.pointerType === 'mouse') return;
    if (down) this.touchId = e.pointerId;
    if (e.pointerId !== this.touchId) return;
    const rect = this.cv.getBoundingClientRect();
    this.steerTouch = (e.clientX - rect.left) < rect.width * 0.5 ? -1 : 1;
  }
  private endTouch(e: PointerEvent) {
    if (e.pointerId === this.touchId) { this.touchId = null; this.steerTouch = 0; }
  }

  /* ---------------- public controls ---------------- */
  startRun() {
    this.sfx.ensure();
    this.sfx.click();
    this.resetWorld();
    this.phase = 'countdown';
    this.cdT = 2.4;
    this.cdLast = 9;
    this.onPhase('countdown', this.stats());
  }

  togglePause() {
    if (this.phase === 'playing' || this.phase === 'countdown') {
      this.phase = 'paused';
      this.sfx.click();
      this.onPhase('paused', this.stats());
    } else if (this.phase === 'paused') {
      this.sfx.ensure();
      this.sfx.click();
      this.phase = this.cdT > 0 ? 'countdown' : 'playing';
      this.onPhase(this.phase, this.stats());
    }
  }

  backToMenu() {
    this.sfx.click();
    this.phase = 'menu';
    this.onPhase('menu', this.stats());
  }

  continueEndless() {
    this.sfx.ensure();
    this.sfx.click();
    this.endless = true;
    this.phase = 'playing';
    this.popup(this.px, this.py - 80, 'ENDLESS MODE!', '#ffd23f', 40, true);
    this.onPhase('playing', this.stats());
    this.pushHud();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.sfx.setMuted(this.muted);
    this.pushHud();
    return this.muted;
  }

  private setHeld(h: boolean) {
    this.sfx.ensure();
    if (h && !this.held) {
      this.releaseLock = false;
      if (this.phase === 'playing' && !this.web && this.webCd <= 0) this.fireWeb();
    }
    if (!h) this.releaseLock = false;
    this.held = h;
  }

  /* ---------------- lifecycle ---------------- */
  private resetWorld() {
    this.buildings = [];
    this.tokens = [];
    this.drones = [];
    this.particles = [];
    this.popups = [];
    this.trail = [];
    const first: Building = { x: -260, w: 1200, roofY: STREET_Y - 300, seed: 7 };
    this.buildings.push(first);
    this.genX = first.x + first.w;
    this.prevRoof = first.roofY;
    this.px = START_X; this.py = first.roofY - 14;
    this.vx = 0; this.vy = 0;
    this.onGround = true; this.web = null; this.invuln = 0; this.face = 1;
    this.touchId = null; this.steerTouch = 0; this.held = false;
    this.deadT = 0;
    this.camX = this.px - this.W * 0.35;
    this.camY = this.py - 720 * 0.46;
    this.score = 0; this.lives = 3; this.combo = 0; this.comboT = 0;
    this.bestCombo = 0; this.tokensGot = 0; this.playT = 0;
    this.marker = 250; this.shake = 0; this.flash = 0; this.goT = 0;
    this.endless = false;
    this.held = false;
    this.webCd = 0;
    this.releaseLock = false;
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth || window.innerWidth;
    const h = this.cv.clientHeight || window.innerHeight;
    this.cv.width = Math.max(320, Math.round(w * dpr));
    this.cv.height = Math.max(240, Math.round(h * dpr));
    this.k = this.cv.height / 720;
    this.W = this.cv.width / this.k;
  }

  private distM() { return Math.max(0, (this.px - START_X) / PX_PER_M); }

  private runSpeed() {
    return 250 + clamp(this.distM() / GOAL_M, 0, 1.4) * 120;
  }

  private mult() { return 1 + Math.min(this.combo, 8) * 0.5; }

  private stats(): RunStats {
    return {
      score: Math.floor(this.score),
      dist: Math.floor(this.distM()),
      tokens: this.tokensGot,
      bestCombo: this.bestCombo,
      time: this.playT,
      best: this.best,
      newBest: false,
    };
  }

  private saveBest() {
    const s = Math.floor(this.score);
    if (s > this.best) {
      this.best = s;
      try { localStorage.setItem(BEST_KEY, String(s)); } catch { /* ignore */ }
      return true;
    }
    return false;
  }

  private pushHud() {
    this.onHud({
      score: Math.floor(this.score),
      dist: Math.floor(this.distM()),
      goal: GOAL_M,
      lives: this.lives,
      mult: this.mult(),
      combo: this.combo,
      tokens: this.tokensGot,
      endless: this.endless,
      muted: this.muted,
      best: this.best,
    });
  }

  private setPhase(p: Phase) {
    this.phase = p;
    const st = this.stats();
    if (p === 'gameover' || p === 'win') st.newBest = this.saveBest(), st.best = this.best;
    this.onPhase(p, st);
    this.pushHud();
  }

  /* ---------------- main loop ---------------- */
  private loop = (ts: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((ts - this.last) / 1000 || 0.016, 0.001, 0.05);
    this.last = ts;
    this.t += dt;

    if (this.phase === 'playing' || this.phase === 'countdown') {
      this.acc += dt;
      const step = 1 / 120;
      let n = 0;
      while (this.acc >= step && n < 8) { this.stepFixed(step); this.acc -= step; n++; }
    } else {
      this.updateFx(dt);
    }
    this.render(dt);
  };

  private stepFixed(dt: number) {
    if (this.phase === 'countdown') {
      this.cdT -= dt;
      const c = Math.ceil(this.cdT);
      if (c !== this.cdLast && c > 0 && this.cdT <= 1.8) { this.cdLast = c; this.sfx.count(); }
      if (this.cdT <= 0) {
        this.phase = 'playing';
        this.goT = 0.85;
        this.sfx.go();
        this.onPhase('playing', this.stats());
      }
    }

    this.playT += dt;
    this.steer = clamp(
      (this.keys.has('R') ? 1 : 0) - (this.keys.has('L') ? 1 : 0) + this.steerTouch, -1, 1,
    );
    if (this.vx < -1) this.face = -1; else if (this.vx > 1) this.face = 1;
    if (this.deadT <= 0) this.updatePlayer(dt);
    else this.deadT -= dt;

    this.updateDrones(dt);
    if (this.deadT <= 0) {
      this.collectTokens(dt);
      this.hitDrones();
    }
    this.generateAhead();
    this.prune();
    this.updateCamera(dt);
    this.updateFx(dt);

    /* distance markers + win */
    const m = this.distM();
    if (m >= this.marker) {
      const mm = this.marker;
      this.popup(this.px, this.py - 90, mm === 1000 ? 'HALFWAY!' : `${mm}m`, '#54e8ff', 30, true);
      this.sfx.ding(3);
      this.marker += 250;
    }
    if (!this.endless && m >= GOAL_M && this.phase === 'playing') {
      this.sfx.fanfare();
      this.burst(this.px, this.py - 30, 30, ['#ffd23f', '#ff9a3d', '#54e8ff', '#ffffff']);
      this.setPhase('win');
    }

    this.hudAcc += dt;
    if (this.hudAcc >= 0.1) { this.hudAcc = 0; this.pushHud(); }
  }

  /* ---------------- player ---------------- */
  private updatePlayer(dt: number) {
    const playing = this.phase === 'playing';
    if (this.invuln > 0) this.invuln -= dt;
    if (this.webCd > 0) this.webCd -= dt;

    if (this.held && !this.web && !this.releaseLock && playing && this.webCd <= 0) this.fireWeb();

    if (this.web) {
      this.vy += GRAV * dt;
      this.vx += this.steer * 300 * dt;
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      const w = this.web;
      w.len = Math.max(w.minLen, w.len - 150 * dt);
      w.flash = Math.max(0, w.flash - dt * 3);
      const dx = this.px - w.ax, dy = this.py - w.ay;
      const d = Math.hypot(dx, dy);
      if (d > w.len) {
        const nx = dx / d, ny = dy / d;
        this.px = w.ax + nx * w.len;
        this.py = w.ay + ny * w.len;
        const vr = this.vx * nx + this.vy * ny;
        if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
      }
      this.onGround = false;
      if (!this.held) {
        const sp = Math.hypot(this.vx, this.vy);
        this.web = null;
        this.releaseLock = true;
        this.sfx.whoosh();
        this.burst(this.px, this.py, 5, ['#ffffff', '#cfd8ff']);
        if (sp > 480 && playing) {
          const word = sp > 780 ? 'SPECTACULAR!' : sp > 620 ? 'GREAT!' : 'NICE!';
          const bonus = (sp > 780 ? 100 : sp > 620 ? 60 : 30) * this.mult();
          this.score += bonus;
          this.combo += 1;
          this.comboT = 2.4;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.popup(this.px, this.py - 60, word, '#ff9a3d', 34, false);
          this.popup(this.px, this.py - 26, `+${Math.floor(bonus)}`, '#ffd23f', 20, false);
        }
      }
    } else if (this.onGround) {
      this.vx += (this.runSpeed() - this.vx) * Math.min(1, 2.6 * dt);
      this.px += this.vx * dt;
      this.runPh += dt * (6 + this.vx * 0.028);
      let supported = false;
      for (const b of this.buildings) {
        if (this.px >= b.x - 2 && this.px <= b.x + b.w + 2) {
          this.py = b.roofY - 14;
          supported = true;
          break;
        }
      }
      if (!supported) { this.onGround = false; this.vy = 40; }
    } else {
      this.vy += GRAV * dt;
      this.vx += this.steer * 420 * dt;
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      /* land on roofs */
      if (this.vy > 0) {
        for (const b of this.buildings) {
          const top = b.roofY - 14;
          if (this.px > b.x - 6 && this.px < b.x + b.w + 6 &&
              this.py >= top - 4 && this.py <= b.roofY + 12) {
            const fall = this.vy;
            this.py = top; this.vy = 0; this.onGround = true;
            this.comboT = Math.max(this.comboT, 1.6);
            if (fall > 420) {
              this.sfx.thud();
              this.shake = Math.min(14, this.shake + 5 + fall * 0.006);
              this.dust(this.px, this.py + 12, 8);
            } else if (fall > 140) {
              this.dust(this.px, this.py + 12, 4);
            }
            break;
          }
        }
      }
      /* bump into building sides */
      if (this.vx > 0) {
        for (const b of this.buildings) {
          if (this.px + 12 > b.x && this.px < b.x && this.py > b.roofY - 6) {
            this.px = b.x - 12.5;
            this.vx = -40;
            this.dust(b.x, this.py, 3);
            break;
          }
        }
      }
    }

    const sp = Math.hypot(this.vx, this.vy);
    this.vx = clamp(this.vx, -700, 1400);
    this.vy = clamp(this.vy, -1400, 1400);

    if (sp > 420) {
      this.trail.push({ x: this.px, y: this.py });
      if (this.trail.length > 10) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();

    /* fell into the street */
    if (playing && this.py > STREET_Y + 230) this.kill();
  }

  private fireWeb() {
    let bestScore = -Infinity;
    let bx = 0, by = 0, found = false;
    for (const b of this.buildings) {
      if (b.x + b.w < this.px - 100 || b.x > this.px + 620) continue;
      const cands: [number, number][] = [
        [b.x, b.roofY], [b.x + b.w, b.roofY], [b.x + b.w * 0.5, b.roofY],
      ];
      for (const [cx, cy] of cands) {
        if (cy > this.py - 30) continue;
        if (cx < this.px - 80 || cx > this.px + 580) continue;
        const d = Math.hypot(cx - this.px, cy - this.py);
        if (d > 640 || d < 40) continue;
        const s = (cx - this.px) * 1.0 + (this.py - cy) * 0.7 - d * 0.25;
        if (s > bestScore) { bestScore = s; bx = cx; by = cy; found = true; }
      }
    }
    if (!found) {
      this.sfx.pfft();
      this.webCd = 0.3;
      this.burst(this.px + this.face * 14, this.py - 12, 3, ['#9aa5c9']);
      return;
    }
    const len = Math.max(90, Math.hypot(bx - this.px, by - this.py));
    this.web = { ax: bx, ay: by, len, minLen: Math.max(90, len * 0.55), flash: 1 };
    this.onGround = false;
    this.sfx.thwip();
    this.burst(bx, by, 6, ['#ffffff', '#cfe0ff']);
  }

  private kill() {
    if (this.phase !== 'playing') return;
    this.lives -= 1;
    this.combo = 0; this.comboT = 0;
    this.web = null;
    this.deadX = this.px; this.deadY = Math.min(this.py, STREET_Y + 160);
    this.deadT = 1.0;
    this.shake = 18;
    this.flash = 1;
    this.sfx.boom();
    this.burst(this.deadX, this.deadY, 30, ['#e62429', '#ff7a3c', '#ffd23f', '#ffffff']);
    this.popup(this.deadX, this.deadY - 70, 'SPLAT!', '#ff4b47', 44, false);
    if (this.lives <= 0) {
      this.sfx.sadTune();
      this.setPhase('gameover');
    } else {
      this.respawn();
    }
  }

  private respawn() {
    let target: Building | null = null;
    for (const b of this.buildings) {
      if (b.x + b.w > this.px + 60) { target = b; break; }
    }
    if (!target) target = this.buildings[this.buildings.length - 1];
    this.px = target.x + 70;
    this.py = target.roofY - 14;
    this.vx = this.runSpeed();
    this.vy = 0;
    this.onGround = true;
    this.web = null;
    this.invuln = 2.2;
    this.camX = this.px - this.W * 0.35;
    this.camY = clamp(this.py - 720 * 0.46, -520, STREET_Y - 720 * 0.82);
    this.popup(this.px, this.py - 80, 'BACK IN ACTION!', '#54e8ff', 30, true);
  }

  /* ---------------- drones / tokens ---------------- */
  private updateDrones(dt: number) {
    for (const d of this.drones) {
      if (d.hover) {
        d.y = d.baseY + Math.sin(this.t * 2 + d.ph) * 34;
      } else {
        d.x += d.dir * d.sp * dt;
        if (d.x < d.x0) { d.x = d.x0; d.dir = 1; }
        if (d.x > d.x1) { d.x = d.x1; d.dir = -1; }
      }
    }
  }

  private hitDrones() {
    if (this.invuln > 0 || this.phase !== 'playing') return;
    for (const d of this.drones) {
      const dx = d.x - this.px, dy = d.y - (this.py - 4);
      if (Math.hypot(dx, dy) < 30) {
        this.web = null;
        this.onGround = false;
        this.vx = -160;
        this.vy = -330;
        this.combo = 0; this.comboT = 0;
        this.invuln = 1.6;
        this.flash = 1;
        this.shake = Math.min(16, this.shake + 12);
        this.sfx.hurt();
        this.burst(this.px, this.py, 14, ['#ff3b4d', '#ffd23f', '#ffffff']);
        this.popup(this.px, this.py - 60, 'ZAPPED!', '#ff3b4d', 32, false);
        break;
      }
    }
  }

  private collectTokens(dt: number) {
    for (const tk of this.tokens) {
      if (tk.taken) continue;
      const dx = this.px - tk.x, dy = (this.py - 6) - tk.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && d > 1) {
        tk.x += (dx / d) * 340 * dt;
        tk.y += (dy / d) * 340 * dt;
      }
      if (d < 26) {
        tk.taken = true;
        this.tokensGot += 1;
        this.combo += 1;
        this.comboT = 2.4;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const val = Math.floor((tk.gold ? 500 : 150) * this.mult());
        this.score += val;
        if (tk.gold) this.sfx.gold(); else this.sfx.ding(this.combo);
        this.burst(tk.x, tk.y, tk.gold ? 16 : 9,
          tk.gold ? ['#ffd23f', '#fff3c4', '#ffffff'] : ['#54e8ff', '#b7f4ff', '#ffffff']);
        this.popup(tk.x, tk.y - 20, `+${val}`, tk.gold ? '#ffd23f' : '#7fe9ff', tk.gold ? 26 : 19, false);
      }
    }
    if (this.comboT > 0) {
      if (this.onGround) this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; this.comboT = 0; }
    }
  }

  /* ---------------- generation ---------------- */
  private generateAhead() {
    while (this.genX < this.camX + this.W + 700) {
      const diff = clamp(this.distM() / GOAL_M, 0, 1);
      const gap = rand(90, 150) + diff * 70;
      const w = rand(180, 380);
      let roof = STREET_Y - rand(190, 460);
      roof = clamp(roof, this.prevRoof - 130, this.prevRoof + 130);
      roof = clamp(roof, STREET_Y - 470, STREET_Y - 170);
      const prev = this.buildings[this.buildings.length - 1];
      const b: Building = { x: this.genX + gap, w, roofY: roof, seed: Math.floor(rand(1, 1e9)) };
      this.buildings.push(b);

      /* tokens across the gap */
      if (gap > 70) {
        const n = 3 + Math.floor(rand(0, 3));
        const x0 = prev.x + prev.w + 24, x1 = b.x - 24;
        const baseY = Math.min(prev.roofY, roof) - 66;
        const arc = 70 + gap * 0.3;
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1);
          const gold = Math.random() < 0.07;
          this.tokens.push({
            x: lerp(x0, x1, f),
            y: baseY - Math.sin(f * Math.PI) * arc,
            gold, taken: false, ph: rand(0, 6.28),
          });
        }
        /* hover drone above wide gaps */
        if (gap > 150 && Math.random() < 0.3 && this.buildings.length > 3) {
          this.drones.push({
            x: (x0 + x1) / 2, y: baseY - arc - 46, x0: 0, x1: 0, dir: 1, sp: 0,
            ph: rand(0, 6.28), hover: true, baseY: baseY - arc - 40,
          });
        }
      }
      /* rooftop tokens */
      if (w > 240 && Math.random() < 0.55) {
        const n = 3;
        for (let i = 0; i < n; i++) {
          this.tokens.push({
            x: b.x + w * 0.3 + i * 44, y: roof - 48,
            gold: Math.random() < 0.06, taken: false, ph: rand(0, 6.28),
          });
        }
      }
      /* patrol drone */
      if (w > 190 && this.buildings.length > 3 && Math.random() < 0.2 + diff * 0.28) {
        this.drones.push({
          x: b.x + w * 0.5, y: roof - 42, x0: b.x + 26, x1: b.x + w - 26,
          dir: Math.random() < 0.5 ? -1 : 1, sp: 62 + diff * 70,
          ph: rand(0, 6.28), hover: false, baseY: roof - 42,
        });
      }

      this.genX = b.x + b.w;
      this.prevRoof = roof;
    }
  }

  private prune() {
    const cut = this.camX - 900;
    if (this.buildings.length && this.buildings[0].x + this.buildings[0].w < cut) {
      this.buildings = this.buildings.filter((b) => b.x + b.w >= cut);
    }
    if (this.tokens.length > 260) {
      this.tokens = this.tokens.filter((tk) => !tk.taken && tk.x > cut);
    }
    this.drones = this.drones.filter((d) => d.x > cut - 200);
    if (this.particles.length > 380) this.particles.splice(0, this.particles.length - 380);
  }

  /* ---------------- camera / fx ---------------- */
  private updateCamera(dt: number) {
    const tx = this.px - this.W * 0.35;
    this.camX += (tx - this.camX) * Math.min(1, 12 * dt);
    const ty = clamp(this.py - 720 * 0.46, -520, STREET_Y - 720 * 0.82);
    this.camY += (ty - this.camY) * Math.min(1, 5 * dt);
  }

  private updateFx(dt: number) {
    this.shake *= Math.exp(-6.5 * dt);
    if (this.shake < 0.15) this.shake = 0;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.goT = Math.max(0, this.goT - dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 44 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  private burst(x: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 420);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.25, 0.7), max: 0.7,
        size: rand(2, 5), color: colors[i % colors.length], grav: 700,
      });
    }
  }

  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + rand(-10, 10), y,
        vx: rand(-90, 90), vy: rand(-140, -30),
        life: rand(0.3, 0.6), max: 0.6,
        size: rand(2.5, 6), color: 'rgba(190,180,230,0.7)', grav: 260,
      });
    }
  }

  private popup(x: number, y: number, txt: string, color: string, size: number, center: boolean) {
    this.popups.push({ x, y, txt, color, life: 0.95, max: 0.95, size, center });
  }

  /* ================= RENDER ================= */
  private render(dt: number) {
    const { ctx } = this;
    const W = this.W;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    if (this.shake > 0) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }

    this.drawSky(W);
    this.drawSkyline(W, 0.12, '#241447', 0.9);
    this.drawSkyline(W, 0.3, '#1b0f38', 1.2);
    this.drawStreet(W);
    this.drawGoalBeam();
    this.drawBuildings(W);
    this.drawTokens();
    this.drawDrones();
    this.drawWeb();
    this.drawPlayer(dt);
    this.drawParticles();
    this.drawPopups(W);
    this.drawScreenFx(W, dt);
  }

  private drawSky(W: number) {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#0d0724');
    g.addColorStop(0.32, '#2a1157');
    g.addColorStop(0.55, '#6b1d6e');
    g.addColorStop(0.72, '#c23a52');
    g.addColorStop(0.86, '#ff7a3c');
    g.addColorStop(1, '#ffb257');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, 760);

    /* sun */
    const sunX = W * 0.64 - (this.camX * 0.012) % (W + 200);
    const sg = ctx.createRadialGradient(sunX, 590, 10, sunX, 590, 320);
    sg.addColorStop(0, 'rgba(255,214,140,0.85)');
    sg.addColorStop(0.25, 'rgba(255,170,90,0.4)');
    sg.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 320, 270, 640, 420);
    ctx.fillStyle = '#ffe3ae';
    ctx.beginPath();
    ctx.arc(sunX, 596, 44, Math.PI, 0);
    ctx.fill();

    /* stars */
    for (let i = 0; i < 70; i++) {
      const sx = ((hash(i) * 2400 - this.camX * 0.04) % (W + 80) + W + 80) % (W + 80) - 40;
      const sy = hash(i + 99) * 300;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 1.6 + i));
      ctx.fillStyle = `rgba(255,240,220,${0.5 * tw * (1 - sy / 380)})`;
      ctx.fillRect(sx, sy, 2, 2);
    }

    /* drifting clouds */
    ctx.fillStyle = 'rgba(38,16,64,0.5)';
    for (let i = 0; i < 5; i++) {
      const cw = 180 + hash(i + 31) * 170;
      const cx = ((hash(i + 7) * 2000 + this.t * (9 + i * 3) - this.camX * 0.07) % (W + cw * 2)) - cw;
      const cy = 70 + hash(i + 55) * 190;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, 22 + hash(i) * 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.24, cy - 14, cw * 0.3, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSkyline(W: number, par: number, color: string, hMul: number) {
    const { ctx } = this;
    const off = this.camX * par;
    const vShift = this.camY * par * 0.5;
    const cell = 150;
    const i0 = Math.floor((off - 300) / cell);
    const count = Math.ceil((W + 600) / cell) + 1;
    ctx.fillStyle = color;
    for (let kk = 0; kk < count; kk++) {
      const i = i0 + kk;
      const bw = cell * (0.6 + hash(i * 3.7) * 0.55);
      const bh = (110 + hash(i * 7.3) * 240) * hMul;
      const bx = i * cell - off + hash(i) * 44;
      const by = STREET_Y + 70 - bh - vShift;
      ctx.fillRect(bx, by, bw, bh + 400);
      /* antenna + beacon on mid layer */
      if (par > 0.2 && hash(i * 13.1) > 0.62) {
        ctx.fillRect(bx + bw * 0.5 - 1.5, by - 34, 3, 34);
        const on = Math.sin(this.t * 2.4 + i) > 0.2;
        ctx.fillStyle = on ? 'rgba(255,70,80,0.95)' : 'rgba(255,70,80,0.25)';
        ctx.fillRect(bx + bw * 0.5 - 3, by - 40, 6, 6);
        ctx.fillStyle = color;
      }
      /* sparse windows */
      if (hash(i * 5.9) > 0.4) {
        ctx.fillStyle = 'rgba(255,209,102,0.32)';
        const rows = Math.min(6, Math.floor(bh / 46));
        for (let r = 0; r < rows; r++) {
          if (hash(i * 17.3 + r * 3.1) > 0.55) {
            ctx.fillRect(bx + 8 + hash(i + r) * (bw - 20), by + 12 + r * 42, 5, 8);
          }
        }
        ctx.fillStyle = color;
      }
    }
  }

  private drawStreet(W: number) {
    const { ctx } = this;
    const sy = STREET_Y - this.camY;
    if (sy > 740) return;
    /* haze above street */
    const hz = ctx.createLinearGradient(0, sy - 110, 0, sy);
    hz.addColorStop(0, 'rgba(255,110,60,0)');
    hz.addColorStop(1, 'rgba(255,120,60,0.14)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, sy - 110, W, 110);

    const g = ctx.createLinearGradient(0, sy, 0, 720);
    g.addColorStop(0, '#221a44');
    g.addColorStop(0.14, '#171233');
    g.addColorStop(1, '#0b0820');
    ctx.fillStyle = g;
    ctx.fillRect(0, sy, W, 720 - sy + 40);
    ctx.fillStyle = '#3d3270';
    ctx.fillRect(0, sy, W, 3);

    /* lane dashes */
    ctx.fillStyle = 'rgba(122,104,196,0.5)';
    const dash = 80;
    const x0 = -((this.camX % dash) + dash) % dash;
    for (let x = x0; x < W; x += dash) ctx.fillRect(x, sy + 42, 38, 4);

    /* street lamps */
    const cell = 300;
    const i0 = Math.floor((this.camX - 100) / cell);
    for (let i = i0; i < i0 + Math.ceil(W / cell) + 2; i++) {
      const lx = i * cell + hash(i * 9.1) * 80 - this.camX;
      if (lx < -40 || lx > W + 40) continue;
      ctx.fillStyle = '#241d4a';
      ctx.fillRect(lx - 2, sy - 52, 4, 52);
      ctx.fillRect(lx - 2, sy - 52, 16, 3);
      const gl = ctx.createRadialGradient(lx + 14, sy - 46, 2, lx + 14, sy - 46, 42);
      gl.addColorStop(0, 'rgba(255,190,110,0.55)');
      gl.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(lx - 30, sy - 90, 90, 90);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(lx + 11, sy - 50, 6, 5);
    }
  }

  private drawGoalBeam() {
    if (this.endless) return;
    const { ctx } = this;
    const gx = GOAL_X - this.camX;
    if (gx < -80 || gx > this.W + 80) return;
    const gy = STREET_Y - this.camY;
    const g = ctx.createLinearGradient(gx - 46, 0, gx + 46, 0);
    g.addColorStop(0, 'rgba(255,210,63,0)');
    g.addColorStop(0.5, 'rgba(255,210,63,0.28)');
    g.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - 46, -20, 92, gy + 20);
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 5);
    ctx.fillStyle = `rgba(255,226,122,${0.85 * pulse})`;
    ctx.fillRect(gx - 3, -20, 6, gy + 20);
    /* banner */
    ctx.save();
    ctx.translate(gx, 150 - this.camY * 0.2);
    ctx.rotate(Math.sin(this.t * 2) * 0.04);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#0b0618';
    ctx.lineWidth = 3;
    const bw = 130, bh = 40;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, -bh / 2); ctx.lineTo(bw / 2, -bh / 2);
    ctx.lineTo(bw / 2, bh / 2); ctx.lineTo(-bw / 2, bh / 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b0618';
    ctx.font = `26px ${POP_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', 0, 3);
    ctx.restore();
  }

  private drawBuildings(W: number) {
    const { ctx } = this;
    for (const b of this.buildings) {
      const bx = b.x - this.camX;
      if (bx + b.w < -60 || bx > W + 60) continue;
      const by = b.roofY - this.camY;
      const bottom = STREET_Y - this.camY;
      const g = ctx.createLinearGradient(bx, 0, bx + b.w, 0);
      g.addColorStop(0, '#2b3260');
      g.addColorStop(0.5, '#20264b');
      g.addColorStop(1, '#161b3a');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, b.w, Math.max(20, bottom - by));
      /* sunset rim on roof + left edge */
      ctx.fillStyle = 'rgba(255,154,90,0.5)';
      ctx.fillRect(bx, by, b.w, 3);
      ctx.fillStyle = 'rgba(255,154,90,0.18)';
      ctx.fillRect(bx, by, 3, Math.min(160, bottom - by));
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(bx + b.w - 4, by, 4, Math.max(20, bottom - by));

      /* windows */
      const cols = Math.floor((b.w - 26) / 24);
      const rows = Math.min(14, Math.floor((STREET_Y - b.roofY - 34) / 28));
      if (cols > 0 && rows > 0 && cols * rows <= 320) {
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const hsh = hash(b.seed * 0.000001 + c * 57.31 + r * 131.7);
            if (hsh < 0.44) continue;
            const cyan = hsh > 0.94;
            const a = 0.25 + 0.6 * hash(b.seed * 0.000002 + c * 13.7 + r * 71.3);
            ctx.fillStyle = cyan ? `rgba(127,227,255,${a})` : `rgba(255,209,102,${a})`;
            ctx.fillRect(bx + 16 + c * 24, by + 18 + r * 28, 10, 15);
          }
        }
      }

      /* roof props */
      const s3 = b.seed % 3;
      if (s3 === 0 && b.w > 150) {
        /* water tower */
        const wx = bx + b.w * 0.28;
        ctx.fillStyle = '#1a2044';
        ctx.fillRect(wx - 14, by - 26, 4, 26);
        ctx.fillRect(wx + 10, by - 26, 4, 26);
        ctx.fillStyle = '#332b5c';
        ctx.fillRect(wx - 18, by - 52, 36, 28);
        ctx.fillStyle = 'rgba(255,154,90,0.25)';
        ctx.fillRect(wx - 18, by - 52, 36, 3);
        ctx.beginPath();
        ctx.moveTo(wx - 20, by - 52); ctx.lineTo(wx, by - 64); ctx.lineTo(wx + 20, by - 52);
        ctx.closePath();
        ctx.fillStyle = '#26204c';
        ctx.fill();
      } else if (s3 === 1) {
        const axx = bx + b.w * 0.7;
        ctx.fillStyle = '#3a3f73';
        ctx.fillRect(axx - 1.5, by - 44, 3, 44);
        const on = Math.sin(this.t * 2.6 + b.seed) > 0.15;
        ctx.fillStyle = on ? 'rgba(255,70,80,0.95)' : 'rgba(255,70,80,0.3)';
        ctx.beginPath();
        ctx.arc(axx, by - 47, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.seed % 4 === 2) {
        ctx.fillStyle = '#262c55';
        ctx.fillRect(bx + b.w * 0.55, by - 12, 22, 12);
        ctx.fillRect(bx + b.w * 0.55 + 26, by - 9, 16, 9);
      }
      /* neon sign */
      if (b.seed % 9 === 4) {
        const flick = Math.sin(this.t * 11 + b.seed) > -0.6 ? 1 : 0.3;
        const colr = b.seed % 2 === 0 ? `rgba(84,232,255,${0.8 * flick})` : `rgba(255,90,180,${0.8 * flick})`;
        ctx.fillStyle = colr;
        ctx.fillRect(bx + 12, by + 26, 46, 14);
        ctx.fillStyle = 'rgba(11,6,24,0.8)';
        ctx.fillRect(bx + 16, by + 30, 38, 6);
      }
    }
  }

  private drawTokens() {
    const { ctx } = this;
    for (const tk of this.tokens) {
      if (tk.taken) continue;
      const sx = tk.x - this.camX, sy = tk.y - this.camY + Math.sin(this.t * 3 + tk.ph) * 4;
      if (sx < -40 || sx > this.W + 40) continue;
      const col = tk.gold ? '#ffd23f' : '#54e8ff';
      const gl = ctx.createRadialGradient(sx, sy, 2, sx, sy, 22);
      gl.addColorStop(0, tk.gold ? 'rgba(255,210,63,0.5)' : 'rgba(84,232,255,0.42)');
      gl.addColorStop(1, 'rgba(84,232,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(sx - 22, sy - 22, 44, 44);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, tk.gold ? 10 : 8.5, 0, Math.PI * 2);
      ctx.stroke();
      /* spinning web spokes */
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.t * 2 + tk.ph);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (tk.gold ? 10 : 8.5), Math.sin(a) * (tk.gold ? 10 : 8.5));
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawDrones() {
    const { ctx } = this;
    for (const d of this.drones) {
      const sx = d.x - this.camX;
      const sy = d.y - this.camY + (d.hover ? 0 : Math.sin(this.t * 5 + d.ph) * 2.5);
      if (sx < -60 || sx > this.W + 60) continue;
      /* scan beam */
      ctx.fillStyle = 'rgba(255,59,77,0.07)';
      ctx.beginPath();
      ctx.moveTo(sx - 4, sy + 4);
      ctx.lineTo(sx + 4, sy + 4);
      ctx.lineTo(sx + 16, sy + 52);
      ctx.lineTo(sx - 16, sy + 52);
      ctx.closePath();
      ctx.fill();
      /* rotors */
      ctx.save();
      ctx.translate(sx, sy - 8);
      ctx.rotate(this.t * 26 + d.ph);
      ctx.strokeStyle = 'rgba(207,216,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
      ctx.moveTo(0, -4); ctx.lineTo(0, 4);
      ctx.stroke();
      ctx.restore();
      /* body */
      ctx.fillStyle = '#241a3e';
      ctx.strokeStyle = '#514586';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1a1330';
      ctx.fillRect(sx - 11, sy + 6, 4, 5);
      ctx.fillRect(sx + 7, sy + 6, 4, 5);
      /* eye */
      ctx.fillStyle = 'rgba(255,59,77,0.3)';
      ctx.beginPath(); ctx.arc(sx + d.dir * 5, sy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3b4d';
      ctx.beginPath(); ctx.arc(sx + d.dir * 5, sy, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd9dc';
      ctx.beginPath(); ctx.arc(sx + d.dir * 5 - 1, sy - 1, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawWeb() {
    if (!this.web) return;
    const { ctx } = this;
    const hx = this.px - this.camX + this.face * 6;
    const hy = this.py - this.camY - 10;
    const ax = this.web.ax - this.camX;
    const ay = this.web.ay - this.camY;
    const d = Math.hypot(ax - hx, ay - hy);
    ctx.lineCap = 'round';
    const path = () => {
      ctx.beginPath();
      if (d > this.web!.len) {
        ctx.moveTo(hx, hy);
        ctx.lineTo(ax, ay);
      } else {
        const sag = (this.web!.len - d) * 0.5 + 8;
        const mx = (hx + ax) / 2, my = (hy + ay) / 2 + sag;
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(mx, my, ax, ay);
      }
    };
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4.5;
    path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.6;
    path(); ctx.stroke();
    /* anchor splat */
    const fl = this.web.flash;
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + fl * 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + Math.cos(a) * (7 + fl * 9), ay + Math.sin(a) * (7 + fl * 9));
    }
    ctx.stroke();
  }

  private drawPlayer(_dt: number) {
    const { ctx } = this;
    if (this.deadT > 0) return;
    if (this.invuln > 0 && Math.floor(this.t * 18) % 2 === 0 && this.phase === 'playing') return;

    /* speed trail */
    for (let i = 0; i < this.trail.length; i++) {
      const tr = this.trail[i];
      const f = (i + 1) / this.trail.length;
      ctx.fillStyle = `rgba(230,36,41,${0.16 * f})`;
      ctx.beginPath();
      ctx.arc(tr.x - this.camX, tr.y - this.camY - 6, 4 + 9 * f, 0, Math.PI * 2);
      ctx.fill();
    }

    const sx = this.px - this.camX;
    const sy = this.py - this.camY;
    ctx.save();
    ctx.translate(sx, sy);

    let rot = 0;
    if (this.web) {
      rot = clamp(-Math.atan2(this.px - this.web.ax, this.py - this.web.ay) * 0.85, -0.8, 0.8);
    } else if (!this.onGround) {
      rot = clamp(this.vx * 0.00045, -0.55, 0.55);
    }
    ctx.rotate(rot);
    ctx.scale(this.face, 1);

    const swinging = !!this.web;
    const air = !this.onGround && !swinging;
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;

    /* legs */
    ctx.strokeStyle = '#2b59e0';
    const legA = this.onGround ? Math.sin(this.runPh) : swinging ? 0.55 : 0.85;
    const legB = this.onGround ? Math.sin(this.runPh + Math.PI) : swinging ? -0.15 : -0.7;
    const footA = this.onGround
      ? { x: Math.sin(this.runPh) * 9, y: 8 + Math.max(0, -Math.cos(this.runPh)) * 4 }
      : swinging ? { x: 7, y: 10 } : { x: 9, y: 7 + legA * 4 };
    const footB = this.onGround
      ? { x: Math.sin(this.runPh + Math.PI) * 9, y: 8 + Math.max(0, -Math.cos(this.runPh + Math.PI)) * 4 }
      : swinging ? { x: -3, y: 12 } : { x: -7, y: 8 + legB * -3 };
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(footA.x, footA.y + 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(footB.x, footB.y + 4); ctx.stroke();
    ctx.fillStyle = '#e62429';
    ctx.beginPath(); ctx.arc(footA.x, footA.y + 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(footB.x, footB.y + 5, 3, 0, Math.PI * 2); ctx.fill();

    /* torso */
    ctx.fillStyle = '#e62429';
    ctx.beginPath();
    ctx.ellipse(0, -5, 6.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b59e0';
    ctx.beginPath();
    ctx.ellipse(-1.5, -3.5, 3, 5.5, 0.25, 0, Math.PI * 2);
    ctx.fill();

    /* arms */
    ctx.strokeStyle = '#e62429';
    ctx.lineWidth = 3.6;
    if (swinging) {
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, -15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-7, -2); ctx.stroke();
      ctx.fillStyle = '#e62429';
      ctx.beginPath(); ctx.arc(6.5, -15.5, 2.6, 0, Math.PI * 2); ctx.fill();
    } else {
      const armA = this.onGround ? Math.sin(this.runPh + Math.PI) * 7 : 6;
      const armB = this.onGround ? Math.sin(this.runPh) * 7 : -5;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(armA + 3, -4 + (air ? -4 : 0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(armB - 4, -4 + (air ? 5 : 2)); ctx.stroke();
    }

    /* head */
    ctx.fillStyle = '#e62429';
    ctx.beginPath();
    ctx.arc(1, -16, 6.2, 0, Math.PI * 2);
    ctx.fill();
    /* eyes */
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(1, -16.5);
    ctx.rotate(-0.22);
    ctx.beginPath(); ctx.ellipse(1.4, 0, 2, 3.1, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4.6, 0.6, 1.6, 2.5, 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawParticles() {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - this.camX, p.y - this.camY, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPopups(W: number) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const f = clamp(p.life / p.max, 0, 1);
      const scaleIn = clamp((p.max - p.life) / 0.12, 0, 1);
      const s = 0.6 + 0.4 * scaleIn;
      const x = p.center ? W / 2 : p.x - this.camX;
      const y = p.center ? 190 : p.y - this.camY;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.font = `${p.size}px ${POP_FONT}`;
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(11,6,24,0.9)';
      ctx.strokeText(p.txt, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.txt, 0, 0);
      ctx.restore();
    }
  }

  private drawScreenFx(W: number, dt: number) {
    const { ctx } = this;
    /* speed lines */
    const sp = Math.hypot(this.vx, this.vy);
    if ((this.phase === 'playing' || this.phase === 'countdown') && sp > 540) {
      const n = Math.min(9, Math.floor((sp - 540) / 90));
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const y = Math.random() * 720;
        const len = 60 + Math.random() * sp * 0.24;
        const x = Math.random() * W;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y);
        ctx.stroke();
      }
    }

    /* countdown + GO */
    if (this.phase === 'countdown') {
      const txt = this.cdT > 1.8 ? 'READY?' : String(Math.ceil(this.cdT));
      const pulse = 1 + 0.08 * Math.sin(this.t * 9);
      ctx.save();
      ctx.translate(W / 2, 300);
      ctx.scale(pulse, pulse);
      ctx.font = `96px ${POP_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(11,6,24,0.95)';
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = txt === 'READY?' ? '#54e8ff' : '#ffd23f';
      ctx.fillText(txt, 0, 0);
      ctx.restore();
      ctx.font = `17px Rubik, sans-serif`;
      ctx.fillStyle = 'rgba(244,239,255,0.85)';
      ctx.fillText('HOLD SPACE / CLICK TO FIRE A WEB — RELEASE TO LET GO', W / 2, 366);
    }
    if (this.goT > 0 && this.phase === 'playing') {
      const f = this.goT / 0.85;
      ctx.save();
      ctx.translate(W / 2, 300);
      ctx.scale(1 + (1 - f) * 0.5, 1 + (1 - f) * 0.5);
      ctx.globalAlpha = f;
      ctx.font = `110px ${POP_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 11;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(11,6,24,0.95)';
      ctx.strokeText('SWING!', 0, 0);
      ctx.fillStyle = '#ff4b47';
      ctx.fillText('SWING!', 0, 0);
      ctx.restore();
    }

    /* hurt flash */
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230,36,41,${0.32 * this.flash})`;
      ctx.fillRect(-20, -20, W + 40, 760);
    }
    /* vignette */
    const vg = ctx.createRadialGradient(W / 2, 360, 240, W / 2, 360, Math.max(W * 0.72, 560));
    vg.addColorStop(0, 'rgba(8,4,20,0)');
    vg.addColorStop(1, 'rgba(8,4,20,0.46)');
    ctx.fillStyle = vg;
    ctx.fillRect(-20, -20, W + 40, 760);

    /* keep dt referenced (used by render loop signature) */
    void dt;
  }
}
