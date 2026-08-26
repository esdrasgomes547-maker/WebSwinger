import { useEffect, useRef, useState } from 'react';
import { WebGame } from './game/engine';
import type { Phase, HudData, RunStats } from './game/engine';
import Hud from './components/Hud';
import { MenuScreen, PauseScreen, GameOverScreen, WinScreen } from './components/Screens';

const initialHud: HudData = {
  score: 0,
  dist: 0,
  goal: 2000,
  lives: 3,
  mult: 1,
  combo: 0,
  tokens: 0,
  endless: false,
  muted: false,
  best: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<WebGame | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<HudData>(initialHud);
  const [stats, setStats] = useState<RunStats | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = new WebGame(
      cv,
      (h) => setHud(h),
      (p, s) => {
        setPhase(p);
        setStats(s);
      },
    );
    gameRef.current = g;
    return () => {
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  const g = () => gameRef.current;
  const hudVisible = phase === 'playing' || phase === 'countdown' || phase === 'paused';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0d0724]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <Hud hud={hud} show={hudVisible} onMute={() => g()?.toggleMute()} />

      {phase === 'menu' && <MenuScreen best={hud.best} onStart={() => g()?.startRun()} />}
      {phase === 'paused' && (
        <PauseScreen
          onResume={() => g()?.togglePause()}
          onRestart={() => g()?.startRun()}
          onMenu={() => g()?.backToMenu()}
        />
      )}
      {phase === 'gameover' && stats && (
        <GameOverScreen stats={stats} onRetry={() => g()?.startRun()} onMenu={() => g()?.backToMenu()} />
      )}
      {phase === 'win' && stats && (
        <WinScreen
          stats={stats}
          onEndless={() => g()?.continueEndless()}
          onReplay={() => g()?.startRun()}
          onMenu={() => g()?.backToMenu()}
        />
      )}
    </div>
  );
}
