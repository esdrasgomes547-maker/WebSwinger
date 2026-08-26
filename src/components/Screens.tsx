import type { ReactNode } from 'react';
import type { RunStats } from '../game/engine';

/* ---------- shared bits ---------- */

const burstPoints = (() => {
  const pts: string[] = [];
  const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 100 : 58;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${100 + Math.cos(a) * r},${100 + Math.sin(a) * r}`);
  }
  return pts.join(' ');
})();

function StarBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <polygon points={burstPoints} fill="currentColor" stroke="#0b0618" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function ControlRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 items-center gap-1">
        {keys.map((k) => (
          <span key={k} className="keycap">{k}</span>
        ))}
      </div>
      <span className="font-body text-sm font-medium text-[#e6ddff]">{label}</span>
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border-2 border-[#0b0618] bg-[#170d36] px-3 py-2 text-center">
      <div className="font-body text-[9px] font-bold tracking-[0.28em] text-[#8f83bd]">{label}</div>
      <div className={`font-display text-2xl leading-tight ${accent ?? 'text-[#f4efff]'}`}>{value}</div>
    </div>
  );
}

function StatGrid({ stats }: { stats: RunStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatBlock label="DISTANCE" value={`${stats.dist}m`} accent="text-[#7fe9ff]" />
      <StatBlock label="WEB ORBS" value={`${stats.tokens}`} accent="text-[#54e8ff]" />
      <StatBlock label="TOP CHAIN" value={`×${stats.bestCombo}`} accent="text-[#ff9ab0]" />
      <StatBlock label="TIME" value={fmtTime(stats.time)} />
    </div>
  );
}

function Overlay({ children, dark = 0.8 }: { children: ReactNode; dark?: number }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto p-4">
      <div
        className="halftone-overlay absolute inset-0"
        style={{ backgroundColor: `rgba(13,7,36,${dark})` }}
      />
      <div className="relative w-full max-w-3xl">{children}</div>
    </div>
  );
}

/* ---------- MENU ---------- */
export function MenuScreen({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <Overlay dark={0.72}>
      <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr]">
        <div className="anim-rise">
          <div className="anim-tag mb-4 inline-block -rotate-2 border-3 border-[#0b0618] bg-[#e62429] px-3 py-1 shadow-[4px_4px_0_rgba(0,0,0,0.55)]" style={{ borderWidth: 3 }}>
            <span className="font-display text-sm tracking-widest text-white">ISSUE #01 — THE NEON DISTRICT</span>
          </div>
          <h1 className="font-display title-shadow leading-[0.86]">
            <span className="block text-6xl text-[#f4efff] sm:text-8xl">WEB</span>
            <span className="block text-7xl text-[#ffd23f] sm:text-9xl">SWINGER</span>
          </h1>
          <p className="mt-4 max-w-md font-body text-sm font-medium leading-relaxed text-[#cfc3f2]">
            The city never sleeps and neither do you. Fire webs, swing the gaps, chain
            style combos and reach the <span className="font-bold text-[#ffd23f]">FINISH beam at 2000m</span> —
            the street is <span className="font-bold text-[#ff4b47]">not</span> your friend.
          </p>
          <div className="mt-5 space-y-2.5">
            <ControlRow keys={['HOLD SPACE', 'CLICK']} label="Fire a web & swing" />
            <ControlRow keys={['RELEASE']} label="Let go mid-swing to launch" />
            <ControlRow keys={['A', 'D']} label="Steer in the air" />
            <ControlRow keys={['TOUCH']} label="Hold anywhere = web · left/right side steers" />
          </div>
        </div>

        <div className="comic-panel anim-pop rotate-1 p-6">
          <div className="font-display text-2xl text-[#7fe9ff]">TONIGHT'S MISSION</div>
          <ul className="mt-3 space-y-2 font-body text-sm font-medium text-[#e6ddff]">
            <li className="flex gap-2"><span className="text-[#ffd23f]">★</span> Grab web orbs — they build your STYLE multiplier.</li>
            <li className="flex gap-2"><span className="text-[#ff4b47]">★</span> Dodge patrol drones or get zapped mid-swing.</li>
            <li className="flex gap-2"><span className="text-[#54e8ff]">★</span> 3 lives. Fall into the street and you lose one.</li>
          </ul>
          <button onClick={onStart} className="btn-comic btn-red anim-cta mt-6 w-full justify-center px-6 py-4 text-3xl">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5Z" /></svg>
            START SWINGING
          </button>
          <div className="mt-4 flex items-center justify-between">
            <span className="font-body text-xs font-bold tracking-[0.2em] text-[#8f83bd]">BEST SCORE</span>
            <span className="font-display text-2xl text-[#ffd23f]">{best.toLocaleString()}</span>
          </div>
          <div className="mt-2 text-center font-body text-[11px] text-[#8f83bd]">
            ENTER to start · P pauses · M mutes
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/* ---------- PAUSE ---------- */
export function PauseScreen({ onResume, onRestart, onMenu }: { onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <Overlay dark={0.66}>
      <div className="comic-panel anim-pop mx-auto max-w-md -rotate-1 p-7 text-center">
        <div className="font-display title-shadow text-6xl text-[#54e8ff]">PAUSED</div>
        <div className="mt-1 font-body text-xs font-bold tracking-[0.3em] text-[#8f83bd]">CATCHING YOUR BREATH UP HERE</div>
        <div className="mt-5 space-y-3">
          <button onClick={onResume} className="btn-comic btn-red w-full justify-center px-6 py-3 text-2xl">RESUME</button>
          <div className="flex gap-3">
            <button onClick={onRestart} className="btn-comic btn-blue flex-1 justify-center px-4 py-2.5 text-xl">RESTART</button>
            <button onClick={onMenu} className="btn-comic btn-ghost flex-1 justify-center px-4 py-2.5 text-xl">MENU</button>
          </div>
        </div>
        <div className="mt-5 space-y-2 border-t-2 border-dashed border-[#3a2a6e] pt-4">
          <ControlRow keys={['HOLD']} label="web  ·  RELEASE lets go" />
          <ControlRow keys={['A', 'D']} label="steer  ·  M mute  ·  R restart" />
        </div>
      </div>
    </Overlay>
  );
}

/* ---------- GAME OVER ---------- */
export function GameOverScreen({ stats, onRetry, onMenu }: { stats: RunStats; onRetry: () => void; onMenu: () => void }) {
  return (
    <Overlay dark={0.8}>
      <div className="anim-pop relative mx-auto mb-2 w-fit">
        <StarBurst className="h-52 w-52 text-[#e62429] sm:h-60 sm:w-60" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display title-shadow -rotate-6 text-6xl text-white sm:text-7xl">SPLAT!</span>
        </div>
      </div>
      <div className="comic-panel anim-rise mx-auto max-w-xl p-6 text-center">
        <div className="font-display text-3xl text-[#ff9ab0]">THE STREET WON THIS ROUND</div>
        <div className="mt-3 flex flex-wrap items-end justify-center gap-x-3">
          <span className="font-body text-xs font-bold tracking-[0.25em] text-[#8f83bd]">FINAL SCORE</span>
          <span className="font-display text-6xl leading-none text-[#ffd23f]">{stats.score.toLocaleString()}</span>
          {stats.newBest && <span className="anim-blink mb-1 font-display text-xl text-[#54e8ff]">NEW BEST!</span>}
        </div>
        <div className="mt-4"><StatGrid stats={stats} /></div>
        <div className="mt-4 font-body text-xs font-semibold text-[#8f83bd]">
          BEST&nbsp;<span className="font-display text-base text-[#7fe9ff]">{stats.best.toLocaleString()}</span>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={onRetry} className="btn-comic btn-red flex-1 justify-center px-6 py-3.5 text-2xl">TRY AGAIN</button>
          <button onClick={onMenu} className="btn-comic btn-ghost justify-center px-6 py-3.5 text-2xl">MENU</button>
        </div>
        <div className="mt-3 font-body text-[11px] text-[#8f83bd]">press R or ENTER to swing again</div>
      </div>
    </Overlay>
  );
}

/* ---------- WIN ---------- */
export function WinScreen({ stats, onEndless, onReplay, onMenu }: {
  stats: RunStats; onEndless: () => void; onReplay: () => void; onMenu: () => void;
}) {
  return (
    <Overlay dark={0.78}>
      <div className="anim-pop relative mx-auto mb-2 w-fit">
        <StarBurst className="h-52 w-52 text-[#ffd23f] sm:h-60 sm:w-60" />
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <span className="font-display title-shadow-gold -rotate-3 text-4xl leading-[0.95] text-[#3a2300] sm:text-5xl">
            DISTRICT<br />CLEARED!
          </span>
        </div>
      </div>
      <div className="comic-panel anim-rise mx-auto max-w-xl p-6 text-center">
        <div className="font-display text-3xl text-[#7fe9ff]">2000m OF PURE SWING</div>
        <div className="mt-3 flex flex-wrap items-end justify-center gap-x-3">
          <span className="font-body text-xs font-bold tracking-[0.25em] text-[#8f83bd]">SCORE</span>
          <span className="font-display text-6xl leading-none text-[#ffd23f]">{stats.score.toLocaleString()}</span>
          {stats.newBest && <span className="anim-blink mb-1 font-display text-xl text-[#54e8ff]">NEW BEST!</span>}
        </div>
        <div className="mt-4"><StatGrid stats={stats} /></div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button onClick={onEndless} className="btn-comic btn-gold flex-1 justify-center px-6 py-3.5 text-2xl">KEEP SWINGING ∞</button>
          <button onClick={onReplay} className="btn-comic btn-red flex-1 justify-center px-6 py-3.5 text-2xl">PLAY AGAIN</button>
        </div>
        <button onClick={onMenu} className="btn-comic btn-ghost mx-auto mt-3 justify-center px-6 py-2.5 text-xl">MENU</button>
      </div>
    </Overlay>
  );
}
