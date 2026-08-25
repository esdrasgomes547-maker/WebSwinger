import type { HudData } from '../game/engine';

function SpiderIcon({ dead }: { dead?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-6 w-6 transition-all duration-300 ${dead ? 'scale-90 opacity-20 grayscale' : 'drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]'}`}
    >
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none">
        <path d="M8.6 9.6 L4.2 5.8 M8 12 L2.8 11.6 M8.6 14.4 L4.2 18.2 M15.4 9.6 L19.8 5.8 M16 12 L21.2 11.6 M15.4 14.4 L19.8 18.2 M10.2 8.4 L8.4 3.6 M13.8 8.4 L15.6 3.6" />
      </g>
      <path
        d="M12 7.6 C9.4 7.6 8.2 9.8 8.2 12 C8.2 14.4 9.6 16.4 12 16.4 C14.4 16.4 15.8 14.4 15.8 12 C15.8 9.8 14.6 7.6 12 7.6 Z"
        fill="currentColor"
      />
      <circle cx="10.7" cy="10.6" r="1.15" fill="#fff" />
      <circle cx="13.3" cy="10.6" r="1.15" fill="#fff" />
    </svg>
  );
}

function WebGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <g stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 3.5 V20.5 M3.5 12 H20.5 M6 6 L18 18 M18 6 L6 18" />
      </g>
    </svg>
  );
}

interface Props {
  hud: HudData;
  show: boolean;
  onMute: () => void;
}

export default function Hud({ hud, show, onMute }: Props) {
  if (!show) return null;
  const pct = hud.endless ? 100 : Math.min(100, (hud.dist / hud.goal) * 100);
  const multLabel = `×${hud.mult % 1 === 0 ? hud.mult : hud.mult.toFixed(1)}`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* score + distance */}
      <div className="comic-panel absolute left-3 top-3 -rotate-1 px-4 py-2.5">
        <div className="font-body text-[10px] font-bold tracking-[0.3em] text-[#ff9ab0]">SCORE</div>
        <div className="font-display text-[2.6rem] leading-none text-[#ffd23f]">
          {hud.score.toLocaleString()}
        </div>
        <div className="mt-1.5 flex items-center gap-2.5">
          <div className="h-3 w-36 -skew-x-12 overflow-hidden border-2 border-[#0b0618] bg-[#12081f] sm:w-44">
            <div
              className="h-full bg-gradient-to-r from-[#e62429] via-[#ff7a3c] to-[#ffd23f] transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="font-display text-base leading-none text-[#7fe9ff]">
            {hud.dist}m
            {!hud.endless && <span className="text-[#8f83bd]"> / {hud.goal}m</span>}
            {hud.endless && <span className="ml-1 text-[#ffd23f]">∞</span>}
          </span>
        </div>
      </div>

      {/* lives + tokens */}
      <div className="comic-panel absolute right-3 top-3 rotate-1 flex items-center gap-3 px-4 py-2.5">
        <div className="flex items-center gap-1 text-[#ff4b47]">
          {[0, 1, 2].map((i) => (
            <SpiderIcon key={i} dead={i >= hud.lives} />
          ))}
        </div>
        <div className="h-8 w-[3px] -skew-x-12 bg-[#0b0618]" />
        <div className="flex items-center gap-1.5 text-[#54e8ff]">
          <WebGlyph />
          <span className="font-display text-xl leading-none">{hud.tokens}</span>
        </div>
      </div>

      {/* style meter */}
      {hud.mult > 1 && (
        <div
          key={hud.combo}
          className="anim-style absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2"
        >
          <div className="comic-panel -rotate-2 border-[#ffd23f] px-4 py-1.5">
            <span className="font-display text-2xl leading-none text-[#ffd23f]">STYLE {multLabel}</span>
            <span className="ml-2 font-body text-[10px] font-bold tracking-[0.2em] text-[#ff9ab0]">
              {hud.combo} CHAIN
            </span>
          </div>
        </div>
      )}

      {/* controls hint */}
      <div className="absolute bottom-3 left-3 hidden items-center gap-2 sm:flex">
        <div className="flex items-center gap-1.5">
          <span className="keycap">HOLD</span>
          <span className="font-body text-xs font-semibold text-[#cfc3f2]/90">web</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="keycap">RELEASE</span>
          <span className="font-body text-xs font-semibold text-[#cfc3f2]/90">let go</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="keycap">A</span>
          <span className="keycap">D</span>
          <span className="font-body text-xs font-semibold text-[#cfc3f2]/90">steer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="keycap">P</span>
          <span className="font-body text-xs font-semibold text-[#cfc3f2]/90">pause</span>
        </div>
      </div>

      {/* best + mute */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        <div className="comic-panel px-3 py-1.5">
          <span className="font-body text-[10px] font-bold tracking-[0.25em] text-[#8f83bd]">BEST </span>
          <span className="font-display text-lg leading-none text-[#7fe9ff]">
            {hud.best.toLocaleString()}
          </span>
        </div>
        <button
          onClick={onMute}
          className="btn-comic btn-ghost pointer-events-auto px-3 py-1.5 text-lg"
          aria-label="Toggle sound"
        >
          {hud.muted ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" stroke="none" />
              <path d="M16 9.5 21 14.5 M21 9.5 16 14.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" fill="currentColor" stroke="none" />
              <path d="M15.5 9.5a4 4 0 0 1 0 5 M18 7.5a7 7 0 0 1 0 9" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
