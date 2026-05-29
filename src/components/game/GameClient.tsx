"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { createSpaceShooterSimulation } from "@/game/simulation/createSpaceShooterSimulation";
import type { ActionState, Snapshot } from "@/game/simulation/types";

type GamePhase = "menu" | "playing" | "exited";

const initialSnapshot: Snapshot = {
  player: { x: 0, y: -2.4 },
  projectiles: [],
  enemies: [],
  score: 0,
  wave: 1
};

export function GameClient() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [gameKey, setGameKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const actions = useKeyboardActions(phase === "playing");
  const music = useEightBitMusic();

  const handleNewGame = () => {
    void music.start();
    setSnapshot(initialSnapshot);
    setGameKey((key) => key + 1);
    setPhase("playing");
  };

  const handleExit = () => {
    music.stop();
    setSnapshot(initialSnapshot);
    setPhase("exited");
  };

  const handleBackToMenu = () => {
    setSnapshot(initialSnapshot);
    setPhase("menu");
  };

  return (
    <main className="game-shell">
      {phase === "playing" ? (
        <>
          <div className="game-canvas">
            <Canvas camera={{ position: [0, 0, 8], fov: 52 }}>
              <color attach="background" args={["#05070d"]} />
              <ambientLight intensity={1} />
              <pointLight position={[4, 4, 6]} intensity={2.2} color="#66e3ff" />
              <SpaceScene key={gameKey} actions={actions.current} onSnapshot={setSnapshot} />
            </Canvas>
          </div>
          <Hud snapshot={snapshot} onExit={handleExit} />
        </>
      ) : (
        <RetroMenu
          phase={phase}
          onActivateAudio={music.start}
          onNewGame={handleNewGame}
          onExit={handleExit}
          onBackToMenu={handleBackToMenu}
        />
      )}
    </main>
  );
}

function SpaceScene({
  actions,
  onSnapshot
}: {
  actions: ActionState;
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const simulation = useMemo(() => createSpaceShooterSimulation(), []);
  const playerRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const snapshot = simulation.step(Math.min(delta, 0.05), actions);

    if (playerRef.current) {
      playerRef.current.position.x = snapshot.player.x;
      playerRef.current.position.y = snapshot.player.y;
    }

    onSnapshot(snapshot);
  });

  const snapshot = simulation.getSnapshot();

  return (
    <>
      <Starfield />
      <mesh ref={playerRef} position={[snapshot.player.x, snapshot.player.y, 0]}>
        <coneGeometry args={[0.36, 0.92, 3]} />
        <meshBasicMaterial color="#66e3ff" />
      </mesh>
      {snapshot.projectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.x, projectile.y, 0]}>
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshBasicMaterial color="#ffbf69" />
        </mesh>
      ))}
      {snapshot.enemies.map((enemy) => (
        <mesh key={enemy.id} position={[enemy.x, enemy.y, 0]}>
          <octahedronGeometry args={[0.32, 0]} />
          <meshBasicMaterial color="#ff5d73" />
        </mesh>
      ))}
    </>
  );
}

function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 120 }, (_, index) => ({
        id: index,
        x: seededRange(index * 3 + 1, -6.6, 6.6),
        y: seededRange(index * 5 + 2, -3.8, 3.8),
        size: seededRange(index * 7 + 3, 0.012, 0.04),
        color: seededUnit(index * 11 + 4) > 0.82 ? "#66e3ff" : "#dcecff"
      })),
    []
  );

  return (
    <group position={[0, 0, -1.2]}>
      {stars.map((star) => (
        <mesh key={star.id} position={[star.x, star.y, 0]}>
          <circleGeometry args={[star.size, 8]} />
          <meshBasicMaterial color={star.color} />
        </mesh>
      ))}
    </group>
  );
}

function Hud({ snapshot, onExit }: { snapshot: Snapshot; onExit: () => void }) {
  return (
    <section className="hud" aria-label="Game status">
      <div className="hud-top">
        <div className="hud-panel">
          <p className="hud-label">Score</p>
          <p className="hud-value">{snapshot.score}</p>
        </div>
        <div className="hud-panel">
          <p className="hud-label">Wave</p>
          <p className="hud-value">{snapshot.wave}</p>
        </div>
        <button className="hud-exit" type="button" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="hud-bottom">Move with WASD or arrows. Fire with Space.</div>
    </section>
  );
}

function RetroMenu({
  phase,
  onActivateAudio,
  onNewGame,
  onExit,
  onBackToMenu
}: {
  phase: Exclude<GamePhase, "playing">;
  onActivateAudio: () => Promise<void>;
  onNewGame: () => void;
  onExit: () => void;
  onBackToMenu: () => void;
}) {
  const isExited = phase === "exited";

  return (
    <section
      className="retro-screen"
      aria-label={isExited ? "Exited game" : "Main menu"}
      onPointerDown={() => void onActivateAudio()}
    >
      <div className="retro-stars" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-alpha" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-beta" aria-hidden="true" />
      <div className="laser laser-alpha" aria-hidden="true" />
      <div className="laser laser-beta" aria-hidden="true" />
      <div className="pixel-boom boom-alpha" aria-hidden="true" />
      <div className="pixel-boom boom-beta" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />

      <div className="menu-stack">
        <p className="menu-kicker">{isExited ? "System Offline" : "Insert Credit"}</p>
        <h1 className="menu-title">Space Shooter</h1>
        <p className="menu-status">{isExited ? "Game session ended" : "Ready player one"}</p>

        {isExited ? (
          <div className="menu-actions" aria-label="Exited actions">
            <button className="menu-button is-primary" type="button" onClick={onBackToMenu}>
              Back To Menu
            </button>
          </div>
        ) : (
          <div className="menu-actions" aria-label="Main menu actions">
            <button className="menu-button is-primary" type="button" onClick={onNewGame}>
              New Game
            </button>
            <button className="menu-button" type="button" aria-disabled="true">
              Select Level
            </button>
            <button className="menu-button" type="button" aria-disabled="true">
              Options
            </button>
            <button className="menu-button" type="button" onClick={onExit}>
              Exit
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function useKeyboardActions(active: boolean) {
  const actions = useRef<ActionState>({
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false
  });

  useEffect(() => {
    const clearActions = () => {
      actions.current.left = false;
      actions.current.right = false;
      actions.current.up = false;
      actions.current.down = false;
      actions.current.fire = false;
    };

    if (!active) {
      clearActions();
      return;
    }

    const setAction = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code === "ArrowLeft" || event.code === "KeyA") actions.current.left = pressed;
      if (event.code === "ArrowRight" || event.code === "KeyD") actions.current.right = pressed;
      if (event.code === "ArrowUp" || event.code === "KeyW") actions.current.up = pressed;
      if (event.code === "ArrowDown" || event.code === "KeyS") actions.current.down = pressed;
      if (event.code === "Space") {
        event.preventDefault();
        actions.current.fire = pressed;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => setAction(event, true);
    const handleKeyUp = (event: KeyboardEvent) => setAction(event, false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearActions();
    };
  }, [active]);

  return actions;
}

function useEightBitMusic() {
  const audioRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    gainRef.current?.gain.cancelScheduledValues(0);
    gainRef.current?.gain.setValueAtTime(0, audioRef.current?.currentTime ?? 0);
  };

  const start = async () => {
    if (timerRef.current !== null) return;

    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = gainRef.current ?? context.createGain();
    gainRef.current = gain;
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.055, context.currentTime);

    const melody = [330, 392, 494, 392, 523, 494, 392, 294, 330, 392, 440, 392, 330, 262, 294, 330];
    let noteIndex = 0;

    const playNote = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(melody[noteIndex % melody.length], now);
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      oscillator.connect(noteGain);
      noteGain.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.2);

      noteIndex += 1;
    };

    playNote();
    timerRef.current = window.setInterval(playNote, 220);
  };

  useEffect(() => stop, []);

  return { start, stop };
}

function getAudioContext(audioRef: React.MutableRefObject<AudioContext | null>) {
  if (audioRef.current) return audioRef.current;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  audioRef.current = new AudioContextConstructor();
  return audioRef.current;
}

function seededRange(seed: number, min: number, max: number) {
  return min + seededUnit(seed) * (max - min);
}

function seededUnit(seed: number) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453);
}

function fract(value: number) {
  return value - Math.floor(value);
}
