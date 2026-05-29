"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { createSpaceShooterSimulation } from "@/game/simulation/createSpaceShooterSimulation";
import type { ActionState, Snapshot } from "@/game/simulation/types";

type GamePhase = "menu" | "playing" | "gameOver" | "exited";
type ResultTune = "happy" | "sad";
type HighScoreEntry = {
  name: string;
  score: number;
  isPlayer?: boolean;
};
type ExplosionKind = "enemy" | "player";
type Explosion = {
  id: number;
  kind: ExplosionKind;
  x: number;
  y: number;
};

const highScores: HighScoreEntry[] = [
  { name: "ACE", score: 24 },
  { name: "NOVA", score: 15 },
  { name: "ZED", score: 8 }
];

const initialSnapshot: Snapshot = {
  player: { x: -2.8, y: 0 },
  projectiles: [],
  enemies: [],
  enemyProjectiles: [],
  elapsedTime: 0,
  score: 0,
  timeScale: 1,
  wave: 1,
  health: 5,
  maxHealth: 5,
  events: []
};

export function GameClient() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [gameKey, setGameKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const actions = useKeyboardActions(phase === "playing");
  const music = useEightBitMusic();

  const handleNewGame = () => {
    music.stop();
    music.setIntensity(1);
    void music.start();
    setSnapshot(initialSnapshot);
    setGameKey((key) => key + 1);
    setPhase("playing");
  };

  const handleExit = () => {
    music.stop();
    music.setIntensity(1);
    setSnapshot(initialSnapshot);
    setPhase("exited");
  };

  const handleGameOver = (finalSnapshot: Snapshot) => {
    const qualifiesForTopThree = finalSnapshot.score > highScores[2].score;

    music.stop();
    music.setIntensity(1);
    setSnapshot(finalSnapshot);
    setPhase("gameOver");
    void music.playResultTune(qualifiesForTopThree ? "happy" : "sad");
  };

  const handleBackToMenu = () => {
    music.stop();
    music.setIntensity(1);
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
              <SpaceScene
                key={gameKey}
                actions={actions.current}
                onGameOver={handleGameOver}
                onSnapshot={setSnapshot}
                onTimeScaleChange={music.setIntensity}
                onStopMusic={music.stop}
                playBuzz={music.playBuzz}
                playExplosion={music.playExplosion}
                playPew={music.playPew}
              />
            </Canvas>
          </div>
          <Hud snapshot={snapshot} onExit={handleExit} />
        </>
      ) : phase === "gameOver" ? (
        <GameOverScreen snapshot={snapshot} onBackToMenu={handleBackToMenu} onNewGame={handleNewGame} />
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
  onGameOver,
  onSnapshot,
  onTimeScaleChange,
  onStopMusic,
  playBuzz,
  playExplosion,
  playPew
}: {
  actions: ActionState;
  onGameOver: (snapshot: Snapshot) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onTimeScaleChange: (timeScale: number) => void;
  onStopMusic: () => void;
  playBuzz: () => void;
  playExplosion: (kind: ExplosionKind) => void;
  playPew: () => void;
}) {
  const simulation = useMemo(() => createSpaceShooterSimulation(), []);
  const playerRef = useRef<Mesh>(null);
  const playerMaterialRef = useRef<MeshBasicMaterial>(null);
  const gameOverRef = useRef(false);
  const playerDestroyedRef = useRef(false);
  const blinkUntilRef = useRef(0);
  const explosionIdRef = useRef(1);
  const gameOverTimerRef = useRef<number | null>(null);
  const [explosions, setExplosions] = useState<Explosion[]>([]);

  useEffect(
    () => () => {
      if (gameOverTimerRef.current !== null) {
        window.clearTimeout(gameOverTimerRef.current);
      }
    },
    []
  );

  useFrame(({ clock }, delta) => {
    const snapshot = simulation.step(Math.min(delta, 0.05), actions);
    const blinkRemaining = blinkUntilRef.current - clock.elapsedTime;

    if (playerRef.current) {
      playerRef.current.position.x = snapshot.player.x;
      playerRef.current.position.y = snapshot.player.y;
    }

    if (playerMaterialRef.current) {
      playerMaterialRef.current.visible =
        !playerDestroyedRef.current && (blinkRemaining <= 0 || Math.floor(blinkRemaining * 18) % 2 === 0);
    }

    onSnapshot(snapshot);
    onTimeScaleChange(snapshot.timeScale);

    if (snapshot.events.length === 0) return;

    const nextExplosions: Explosion[] = [];

    for (const event of snapshot.events) {
      if (event.type === "weaponFired") {
        playPew();
      }

      if (event.type === "enemyDestroyed") {
        playExplosion("enemy");
        nextExplosions.push({
          id: explosionIdRef.current++,
          kind: "enemy",
          x: event.position.x,
          y: event.position.y
        });
      }

      if (event.type === "playerHit") {
        playBuzz();

        if (event.health > 0) {
          blinkUntilRef.current = clock.elapsedTime + 0.5;
        }
      }

      if (event.type === "playerDestroyed" && !gameOverRef.current) {
        gameOverRef.current = true;
        playerDestroyedRef.current = true;
        onStopMusic();
        playExplosion("player");
        nextExplosions.push({
          id: explosionIdRef.current++,
          kind: "player",
          x: event.position.x,
          y: event.position.y
        });
        gameOverTimerRef.current = window.setTimeout(() => onGameOver(snapshot), 700);
      }
    }

    if (nextExplosions.length > 0) {
      setExplosions((current) => [...current, ...nextExplosions]);
    }
  });

  const snapshot = simulation.getSnapshot();

  return (
    <>
      <Starfield />
      <mesh ref={playerRef} position={[snapshot.player.x, snapshot.player.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.29, 0.74, 3]} />
        <meshBasicMaterial ref={playerMaterialRef} color="#66e3ff" />
      </mesh>
      {snapshot.projectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshBasicMaterial color="#ffbf69" />
        </mesh>
      ))}
      {snapshot.enemies.map((enemy) => (
        <mesh key={enemy.id} position={[enemy.x, enemy.y, 0]}>
          {enemy.kind === "sineGunner" ? <dodecahedronGeometry args={[0.27, 0]} /> : <octahedronGeometry args={[0.26, 0]} />}
          <meshBasicMaterial color={enemy.kind === "sineGunner" ? "#8cff98" : "#ff5d73"} />
        </mesh>
      ))}
      {snapshot.enemyProjectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
          <meshBasicMaterial color="#ff5d73" />
        </mesh>
      ))}
      {explosions.map((explosion) => (
        <ExplosionEffect
          key={explosion.id}
          kind={explosion.kind}
          position={[explosion.x, explosion.y, 0.08]}
          onDone={() => setExplosions((current) => current.filter((item) => item.id !== explosion.id))}
        />
      ))}
    </>
  );
}

function ExplosionEffect({
  kind,
  onDone,
  position
}: {
  kind: ExplosionKind;
  onDone: () => void;
  position: [number, number, number];
}) {
  const groupRef = useRef<Group>(null);
  const ageRef = useRef(0);
  const doneRef = useRef(false);
  const duration = kind === "player" ? 0.7 : 0.42;
  const baseScale = kind === "player" ? 1.4 : 0.82;

  useFrame((_, delta) => {
    ageRef.current += delta;
    const progress = Math.min(ageRef.current / duration, 1);

    if (groupRef.current) {
      const scale = baseScale * (0.35 + progress * 1.5);
      groupRef.current.scale.setScalar(scale);
      groupRef.current.rotation.z += delta * (kind === "player" ? 4.5 : 7);

      for (const child of groupRef.current.children) {
        child.visible = progress < 1;
      }
    }

    if (progress >= 1 && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <ringGeometry args={[0.2, 0.28, 16]} />
        <meshBasicMaterial color={kind === "player" ? "#66e3ff" : "#ffbf69"} transparent opacity={0.85} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.18, 12]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0.24, 0.12, 0]}>
        <circleGeometry args={[0.08, 8]} />
        <meshBasicMaterial color="#ffe66d" transparent opacity={0.78} />
      </mesh>
      <mesh position={[-0.2, -0.16, 0]}>
        <circleGeometry args={[0.07, 8]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.72} />
      </mesh>
    </group>
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
  const healthPercent = `${(snapshot.health / snapshot.maxHealth) * 100}%`;

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
        <div className="hud-panel hud-health">
          <div className="hud-health-header">
            <p className="hud-label">Health</p>
            <p className="hud-health-count">
              {snapshot.health}/{snapshot.maxHealth}
            </p>
          </div>
          <div
            className="health-bar"
            role="meter"
            aria-label="Player health"
            aria-valuemin={0}
            aria-valuemax={snapshot.maxHealth}
            aria-valuenow={snapshot.health}
          >
            <div className="health-bar-fill" style={{ width: healthPercent }} />
          </div>
        </div>
        <button className="hud-exit" type="button" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="hud-bottom">Dodge incoming objects from the right. Move with WASD or arrows. Fire with Space.</div>
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
  phase: "menu" | "exited";
  onActivateAudio: () => Promise<void>;
  onNewGame: () => void;
  onExit: () => void;
  onBackToMenu: () => void;
}) {
  const isExited = phase === "exited";

  return (
    <RetroScreen ariaLabel={isExited ? "Exited game" : "Main menu"} onPointerDown={() => void onActivateAudio()}>
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
    </RetroScreen>
  );
}

function GameOverScreen({
  snapshot,
  onBackToMenu,
  onNewGame
}: {
  snapshot: Snapshot;
  onBackToMenu: () => void;
  onNewGame: () => void;
}) {
  const qualifiesForTopThree = snapshot.score > highScores[2].score;
  const playerScore: HighScoreEntry = { name: "YOU", score: snapshot.score, isPlayer: true };
  const displayedScores = qualifiesForTopThree
    ? [...highScores, playerScore].sort((a, b) => b.score - a.score).slice(0, 3)
    : highScores;

  return (
    <RetroScreen ariaLabel="Game over">
      <div className="menu-stack game-over-stack">
        <p className="menu-kicker">{qualifiesForTopThree ? "Mission Complete" : "Signal Lost"}</p>
        <h1 className="menu-title">Game Over</h1>
        <p className="menu-status">Final Score: {snapshot.score}</p>

        <div className="high-score-board" aria-label="High scores">
          <p className="high-score-heading">High Scores</p>
          <ol className="high-score-list">
            {displayedScores.map((entry, index) => (
              <li className={entry.isPlayer ? "high-score-row is-player" : "high-score-row"} key={`${entry.name}-${index}`}>
                <span className="high-score-rank">{index + 1}</span>
                <span className="high-score-name">{entry.name}</span>
                <span className="high-score-value">{entry.score}</span>
              </li>
            ))}
          </ol>
          {!qualifiesForTopThree ? (
            <p className="player-score-note">
              Your Score <span>{snapshot.score}</span>
            </p>
          ) : null}
        </div>

        <div className="menu-actions" aria-label="Game over actions">
          <button className="menu-button is-primary" type="button" onClick={onNewGame}>
            New Game
          </button>
          <button className="menu-button" type="button" onClick={onBackToMenu}>
            Back To Menu
          </button>
        </div>
      </div>
    </RetroScreen>
  );
}

function RetroScreen({
  ariaLabel,
  children,
  onPointerDown
}: {
  ariaLabel: string;
  children: React.ReactNode;
  onPointerDown?: () => void;
}) {
  return (
    <section className="retro-screen" aria-label={ariaLabel} onPointerDown={onPointerDown}>
      <div className="retro-stars" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-alpha" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-beta" aria-hidden="true" />
      <div className="laser laser-alpha" aria-hidden="true" />
      <div className="laser laser-beta" aria-hidden="true" />
      <div className="pixel-boom boom-alpha" aria-hidden="true" />
      <div className="pixel-boom boom-beta" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      {children}
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
  const gainConnectedRef = useRef(false);
  const intensityRef = useRef(1);
  const noteIndexRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number[]>([]);
  const melody = useMemo(
    () => [330, 392, 494, 392, 523, 494, 392, 294, 330, 392, 440, 392, 330, 262, 294, 330],
    []
  );

  const getMusicInterval = () => {
    const progress = clamp01(intensityRef.current - 1);
    return 220 - progress * 75;
  };

  const getMusicVolume = () => {
    const progress = clamp01(intensityRef.current - 1);
    return 0.055 + progress * 0.025;
  };

  const getMusicGain = (context: AudioContext) => {
    const gain = gainRef.current ?? context.createGain();
    gainRef.current = gain;

    if (!gainConnectedRef.current) {
      gain.connect(context.destination);
      gainConnectedRef.current = true;
    }

    return gain;
  };

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    for (const timer of resultTimerRef.current) {
      window.clearTimeout(timer);
    }
    resultTimerRef.current = [];
    noteIndexRef.current = 0;

    gainRef.current?.gain.cancelScheduledValues(0);
    gainRef.current?.gain.setValueAtTime(0, audioRef.current?.currentTime ?? 0);
  };

  const setIntensity = (timeScale: number) => {
    const nextIntensity = Math.min(Math.max(timeScale, 1), 2);
    intensityRef.current = nextIntensity;

    const context = audioRef.current;
    if (!context || !gainRef.current || timerRef.current === null) return;

    gainRef.current.gain.cancelScheduledValues(context.currentTime);
    gainRef.current.gain.linearRampToValueAtTime(getMusicVolume(), context.currentTime + 0.08);
  };

  const start = async () => {
    if (timerRef.current !== null) return;

    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = getMusicGain(context);
    gain.gain.setValueAtTime(getMusicVolume(), context.currentTime);

    const playNote = () => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const intensityProgress = clamp01(intensityRef.current - 1);
      const melodyIndex = noteIndexRef.current % melody.length;
      const shouldLiftOctave = intensityProgress > 0.58 && noteIndexRef.current % 4 === 0;
      const frequency = melody[melodyIndex] * (shouldLiftOctave ? 2 : 1);

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, now);
      noteGain.gain.setValueAtTime(0, now);
      noteGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      oscillator.connect(noteGain);
      noteGain.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 0.2);

      noteIndexRef.current += 1;
      timerRef.current = window.setTimeout(playNote, getMusicInterval());
    };

    playNote();
  };

  const playResultTune = async (kind: ResultTune) => {
    stop();

    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      await context.resume();
    }

    const gain = getMusicGain(context);
    gain.gain.setValueAtTime(0.065, context.currentTime);

    const notes = kind === "happy" ? [392, 494, 587, 784, 988] : [392, 349, 294, 247, 196];
    const noteLength = kind === "happy" ? 0.16 : 0.22;

    resultTimerRef.current = notes.map((frequency, index) =>
      window.setTimeout(() => {
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const noteGain = context.createGain();

        oscillator.type = kind === "happy" ? "square" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, now);
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + noteLength);
        oscillator.connect(noteGain);
        noteGain.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + noteLength + 0.02);
      }, index * 170)
    );
  };

  const playPew = () => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1160, now);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.08);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
  };

  const playBuzz = () => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.setValueAtTime(120, now + 0.045);
    oscillator.frequency.setValueAtTime(150, now + 0.09);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
    gain.gain.setValueAtTime(0.16, now + 0.11);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  };

  const playExplosion = (kind: ExplosionKind) => {
    const context = getAudioContext(audioRef);
    if (!context) return;

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    const duration = kind === "player" ? 0.42 : 0.24;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(kind === "player" ? 220 : 360, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "player" ? 42 : 95, now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(kind === "player" ? 0.24 : 0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  };

  useEffect(() => stop, []);

  return { playBuzz, playExplosion, playPew, playResultTune, setIntensity, start, stop };
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

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
