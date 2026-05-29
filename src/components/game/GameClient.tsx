"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { createSpaceShooterSimulation } from "@/game/simulation/createSpaceShooterSimulation";
import type { ActionState, Enemy, PowerUpKind, Snapshot } from "@/game/simulation/types";
import {
  MAX_HIGH_SCORE_NAME_LENGTH,
  qualifiesForHighScores,
  sortHighScores,
  staticHighScores,
  type HighScoreEntry
} from "@/lib/highScores";

type GamePhase = "menu" | "playing" | "gameOver" | "exited" | "highScores";
type ResultTune = "happy" | "sad";
type DisplayHighScoreEntry = HighScoreEntry & {
  isPlayer?: boolean;
};
type ExplosionKind = "enemy" | "player";
type Explosion = {
  id: number;
  kind: ExplosionKind;
  x: number;
  y: number;
};
type ShieldFlash = {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
};

const initialSnapshot: Snapshot = {
  player: { x: -2.8, y: 0 },
  projectiles: [],
  enemies: [],
  enemyProjectiles: [],
  enemyBeams: [],
  powerUps: [],
  elapsedTime: 0,
  score: 0,
  shieldCharges: 0,
  timeScale: 1,
  wave: 1,
  weaponPowerTimeRemaining: 0,
  health: 5,
  maxHealth: 5,
  events: []
};

export function GameClient() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [gameKey, setGameKey] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(staticHighScores);
  const actions = useKeyboardActions(phase === "playing");
  const music = useEightBitMusic();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let isMounted = true;

    async function loadHighScores() {
      const scores = await fetchHighScores();

      if (isMounted) {
        setHighScores(scores);
      }
    }

    void loadHighScores();

    return () => {
      isMounted = false;
    };
  }, []);

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
    const qualifiesForTopThree = qualifiesForHighScores(finalSnapshot.score, highScores);

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
        <GameOverScreen
          highScores={highScores}
          snapshot={snapshot}
          onBackToMenu={handleBackToMenu}
          onHighScoresChange={setHighScores}
          onNewGame={handleNewGame}
        />
      ) : (
        <RetroMenu
          phase={phase}
          highScores={highScores}
          onActivateAudio={music.start}
          onNewGame={handleNewGame}
          onExit={handleExit}
          onBackToMenu={handleBackToMenu}
          onHighScores={() => setPhase("highScores")}
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
  const shieldFlashIdRef = useRef(1);
  const gameOverTimerRef = useRef<number | null>(null);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [shieldFlashes, setShieldFlashes] = useState<ShieldFlash[]>([]);

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
    const nextShieldFlashes: ShieldFlash[] = [];

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

      if (event.type === "powerUpCollected" || event.type === "shieldBlockedHit") {
        nextShieldFlashes.push({
          id: shieldFlashIdRef.current++,
          kind: event.type === "powerUpCollected" ? event.kind : "shield",
          x: snapshot.player.x,
          y: snapshot.player.y
        });
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

    if (nextShieldFlashes.length > 0) {
      setShieldFlashes((current) => [...current, ...nextShieldFlashes]);
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
      {snapshot.shieldCharges > 0 ? (
        <PlayerShield position={[snapshot.player.x, snapshot.player.y, 0.04]} charges={snapshot.shieldCharges} />
      ) : null}
      {snapshot.weaponPowerTimeRemaining > 0 ? (
        <WeaponPowerAura position={[snapshot.player.x, snapshot.player.y, 0.05]} />
      ) : null}
      {snapshot.projectiles.map((projectile) => (
        <mesh
          key={projectile.id}
          position={[projectile.x, projectile.y, 0]}
          rotation={[0, 0, Math.atan2(projectile.velocityY, projectile.velocityX) - Math.PI / 2]}
        >
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshBasicMaterial color="#ffbf69" />
        </mesh>
      ))}
      {snapshot.enemies.map((enemy) =>
        enemy.kind === "miniBoss" ? (
          <MiniBossEnemy key={enemy.id} enemy={enemy} />
        ) : (
          <mesh key={enemy.id} position={[enemy.x, enemy.y, 0]}>
            {enemy.kind === "sineGunner" ? <dodecahedronGeometry args={[0.27, 0]} /> : <octahedronGeometry args={[0.26, 0]} />}
            <meshBasicMaterial color={enemy.kind === "sineGunner" ? "#8cff98" : "#ff5d73"} />
          </mesh>
        )
      )}
      {snapshot.enemyBeams.map((beam) => (
        <EnemyBeamEffect key={beam.id} y={beam.y} />
      ))}
      {snapshot.enemyProjectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
          <meshBasicMaterial color="#ff5d73" />
        </mesh>
      ))}
      {snapshot.powerUps.map((powerUp) => (
        <PowerUpPickup key={powerUp.id} kind={powerUp.kind} position={[powerUp.x, powerUp.y, 0.06]} />
      ))}
      {explosions.map((explosion) => (
        <ExplosionEffect
          key={explosion.id}
          kind={explosion.kind}
          position={[explosion.x, explosion.y, 0.08]}
          onDone={() => setExplosions((current) => current.filter((item) => item.id !== explosion.id))}
        />
      ))}
      {shieldFlashes.map((flash) => (
        <PowerUpFlashEffect
          key={flash.id}
          kind={flash.kind}
          position={[flash.x, flash.y, 0.1]}
          onDone={() => setShieldFlashes((current) => current.filter((item) => item.id !== flash.id))}
        />
      ))}
    </>
  );
}

function MiniBossEnemy({ enemy }: { enemy: Enemy }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 2.4) * 0.04;
    groupRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5) * 0.025);
  });

  return (
    <group ref={groupRef} position={[enemy.x, enemy.y, 0.02]}>
      <mesh>
        <boxGeometry args={[0.62, 0.82, 0.12]} />
        <meshBasicMaterial color="#b45cff" />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.72, 0.16, 0.14]} />
        <meshBasicMaterial color="#ffbf69" />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.72, 0.16, 0.14]} />
        <meshBasicMaterial color="#ffe66d" />
      </mesh>
      <mesh position={[-0.23, 0, 0.04]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#05070d" />
      </mesh>
      <mesh position={[-0.23, 0, 0.05]}>
        <ringGeometry args={[0.12, 0.18, 18]} />
        <meshBasicMaterial color={enemy.beamTimeRemaining > 0 ? "#ff2f7d" : "#66e3ff"} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0.38, 0.31, 0.03]}>
        <circleGeometry args={[0.08, 12]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.82} />
      </mesh>
      <mesh position={[0.38, -0.31, 0.03]}>
        <circleGeometry args={[0.08, 12]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

function EnemyBeamEffect({ y }: { y: number }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const pulse = 1 + Math.sin(clock.elapsedTime * 34) * 0.08;
    groupRef.current.scale.y = pulse;
  });

  return (
    <group ref={groupRef} position={[0, y, 0.04]}>
      <mesh>
        <boxGeometry args={[8.4, 0.34, 0.02]} />
        <meshBasicMaterial color="#ff2f7d" transparent opacity={0.28} />
      </mesh>
      <mesh>
        <boxGeometry args={[8.4, 0.14, 0.03]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.78} />
      </mesh>
      <mesh>
        <boxGeometry args={[8.4, 0.045, 0.04]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function PlayerShield({ charges, position }: { charges: number; position: [number, number, number] }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const pulse = 1 + Math.sin(clock.elapsedTime * 6) * 0.05 + Math.min(charges - 1, 3) * 0.03;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.rotation.z += 0.025;
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <ringGeometry args={[0.48, 0.54, 28]} />
        <meshBasicMaterial color="#66e3ff" transparent opacity={0.5} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.5, 28]} />
        <meshBasicMaterial color="#66e3ff" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

function WeaponPowerAura({ position }: { position: [number, number, number] }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 8) * 0.08;
    groupRef.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 10) * 0.04);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <ringGeometry args={[0.58, 0.64, 28]} />
        <meshBasicMaterial color="#ffbf69" transparent opacity={0.38} />
      </mesh>
      <mesh position={[0.1, 0.38, 0]}>
        <circleGeometry args={[0.06, 10]} />
        <meshBasicMaterial color="#ffe66d" transparent opacity={0.86} />
      </mesh>
      <mesh position={[0.1, -0.38, 0]}>
        <circleGeometry args={[0.06, 10]} />
        <meshBasicMaterial color="#ffe66d" transparent opacity={0.86} />
      </mesh>
    </group>
  );
}

function PowerUpPickup({ kind, position }: { kind: PowerUpKind; position: [number, number, number] }) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;

    const pulse = 1 + Math.sin(clock.elapsedTime * 7) * 0.08;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.rotation.z += delta * 2.5;
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <ringGeometry args={[0.2, 0.3, 24]} />
        <meshBasicMaterial color={getPowerUpColor(kind)} transparent opacity={0.9} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.82} />
      </mesh>
      {kind === "shield" ? (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.1, 0.34, 0.02]} />
          <meshBasicMaterial color="#8cff98" transparent opacity={0.88} />
        </mesh>
      ) : kind === "health" ? (
        <>
          <mesh>
            <boxGeometry args={[0.32, 0.09, 0.02]} />
            <meshBasicMaterial color="#8cff98" transparent opacity={0.92} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.09, 0.32, 0.02]} />
            <meshBasicMaterial color="#8cff98" transparent opacity={0.92} />
          </mesh>
        </>
      ) : (
        <>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.36, 0.02]} />
            <meshBasicMaterial color="#ffbf69" transparent opacity={0.94} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.1, 0.36, 0.02]} />
            <meshBasicMaterial color="#ffe66d" transparent opacity={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
}

function PowerUpFlashEffect({
  kind,
  onDone,
  position
}: {
  kind: PowerUpKind;
  onDone: () => void;
  position: [number, number, number];
}) {
  const groupRef = useRef<Group>(null);
  const ageRef = useRef(0);
  const doneRef = useRef(false);
  const duration = 0.32;

  useFrame((_, delta) => {
    ageRef.current += delta;
    const progress = Math.min(ageRef.current / duration, 1);

    if (groupRef.current) {
      groupRef.current.scale.setScalar(0.8 + progress * 0.8);
    }

    if (progress >= 1 && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <ringGeometry args={[0.42, 0.5, 28]} />
        <meshBasicMaterial color={getPowerUpColor(kind)} transparent opacity={0.7} />
      </mesh>
      {kind !== "shield" ? (
        <mesh>
          <circleGeometry args={[0.24, 18]} />
          <meshBasicMaterial color="#eef7ff" transparent opacity={0.22} />
        </mesh>
      ) : null}
    </group>
  );
}

function getPowerUpColor(kind: PowerUpKind) {
  if (kind === "shield") return "#66e3ff";
  if (kind === "health") return "#8cff98";
  return "#ffbf69";
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
  highScores,
  onActivateAudio,
  onNewGame,
  onExit,
  onBackToMenu,
  onHighScores
}: {
  phase: "menu" | "exited" | "highScores";
  highScores: HighScoreEntry[];
  onActivateAudio: () => Promise<void>;
  onNewGame: () => void;
  onExit: () => void;
  onBackToMenu: () => void;
  onHighScores: () => void;
}) {
  const isExited = phase === "exited";
  const isHighScores = phase === "highScores";

  return (
    <RetroScreen ariaLabel={isExited ? "Exited game" : isHighScores ? "High scores" : "Main menu"} onPointerDown={() => void onActivateAudio()}>
      <div className={isHighScores ? "menu-stack high-scores-menu-stack" : "menu-stack"}>
        <p className="menu-kicker">{isExited ? "System Offline" : isHighScores ? "Hall Of Fame" : "Insert Credit"}</p>
        <h1 className="menu-title">Space Shooter</h1>
        <p className="menu-status">{isExited ? "Game session ended" : isHighScores ? "Top pilots" : "Ready player one"}</p>

        {isExited ? (
          <div className="menu-actions" aria-label="Exited actions">
            <button className="menu-button is-primary" type="button" onClick={onBackToMenu}>
              Back To Menu
            </button>
          </div>
        ) : isHighScores ? (
          <>
            <HighScoreBoard scores={highScores} />
            <div className="menu-actions" aria-label="High score actions">
              <button className="menu-button is-primary" type="button" onClick={onBackToMenu}>
                Back To Menu
              </button>
            </div>
          </>
        ) : (
          <div className="menu-actions" aria-label="Main menu actions">
            <button className="menu-button is-primary" type="button" onClick={onNewGame}>
              New Game
            </button>
            <button className="menu-button" type="button" onClick={onHighScores}>
              High Scores
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
  highScores,
  snapshot,
  onBackToMenu,
  onHighScoresChange,
  onNewGame
}: {
  highScores: HighScoreEntry[];
  snapshot: Snapshot;
  onBackToMenu: () => void;
  onHighScoresChange: (scores: HighScoreEntry[]) => void;
  onNewGame: () => void;
}) {
  const [playerName, setPlayerName] = useState("YOU");
  const [submittedScoreId, setSubmittedScoreId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qualifiesForTopThree = qualifiesForHighScores(snapshot.score, highScores);
  const playerScore: DisplayHighScoreEntry = {
    id: submittedScoreId ?? "current-player",
    name: playerName.trim() || "YOU",
    score: snapshot.score,
    isPlayer: true
  };
  const survivedTime = formatSurvivalTime(snapshot.elapsedTime);
  const displayedScores: DisplayHighScoreEntry[] = submittedScoreId
    ? highScores.map((entry) => ({
        ...entry,
        isPlayer: entry.id === submittedScoreId
      }))
    : qualifiesForTopThree
    ? sortHighScores([...highScores, playerScore])
    : highScores;
  const submittedScoreIsVisible = displayedScores.some((entry) => entry.id === submittedScoreId);

  const handleSubmitScore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || submittedScoreId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/high-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: playerName,
          score: snapshot.score
        })
      });

      if (!response.ok) {
        throw new Error("Score submission failed");
      }

      const result = (await response.json()) as HighScoresResponse;
      const nextHighScores = parseHighScoresResponse(result.scores);
      const submittedScore = parseSubmittedScore(result.submittedScore);

      onHighScoresChange(nextHighScores);
      setSubmittedScoreId(submittedScore?.id ?? null);
      setPlayerName(submittedScore?.name ?? playerName);
    } catch {
      setSubmitError("Score link failed. Static board restored.");
      onHighScoresChange(staticHighScores);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RetroScreen ariaLabel="Game over">
      <div className="menu-stack game-over-stack">
        <p className="menu-kicker">{qualifiesForTopThree ? "Mission Complete" : "Signal Lost"}</p>
        <h1 className="menu-title">Game Over</h1>
        <div className="final-run-stats" aria-label="Final run stats">
          <p>
            Final Score <span>{snapshot.score}</span>
          </p>
          <p>
            Time Survived <span>{survivedTime}</span>
          </p>
        </div>

        <HighScoreBoard
          scores={displayedScores}
          footer={
            <>
              {!qualifiesForTopThree ? (
                <p className="player-score-note">
                  Your Score <span>{snapshot.score}</span>
                </p>
              ) : null}
              {submittedScoreId && !submittedScoreIsVisible ? (
                <p className="player-score-note">
                  Score Saved <span>{snapshot.score}</span>
                </p>
              ) : null}
            </>
          }
        />

        {!submittedScoreId ? (
          <form className="score-submit-form" aria-label="Submit high score" onSubmit={handleSubmitScore}>
            <label className="score-submit-label" htmlFor="player-name">
              Pilot Name
            </label>
            <div className="score-submit-row">
              <input
                id="player-name"
                className="score-submit-input"
                type="text"
                value={playerName}
                maxLength={MAX_HIGH_SCORE_NAME_LENGTH}
                autoComplete="off"
                inputMode="text"
                onChange={(event) => setPlayerName(event.target.value)}
              />
              <button className="menu-button is-primary score-submit-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving" : "Submit"}
              </button>
            </div>
            {submitError ? <p className="score-submit-error">{submitError}</p> : null}
          </form>
        ) : null}

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

function HighScoreBoard({ footer, scores }: { footer?: React.ReactNode; scores: DisplayHighScoreEntry[] }) {
  return (
    <div className="high-score-board" aria-label="High scores">
      <p className="high-score-heading">High Scores</p>
      <ol className="high-score-list">
        {scores.map((entry, index) => (
          <li className={entry.isPlayer ? "high-score-row is-player" : "high-score-row"} key={entry.id ?? `${entry.name}-${index}`}>
            <span className="high-score-rank">{index + 1}</span>
            <span className="high-score-name">{entry.name}</span>
            <span className="high-score-value">{entry.score}</span>
          </li>
        ))}
      </ol>
      {footer}
    </div>
  );
}

function formatSurvivalTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

type HighScoresResponse = {
  scores?: unknown;
  submittedScore?: unknown;
};

async function fetchHighScores() {
  try {
    const response = await fetch("/api/high-scores");

    if (!response.ok) {
      return staticHighScores;
    }

    const result = (await response.json()) as HighScoresResponse;

    return parseHighScoresResponse(result.scores);
  } catch {
    return staticHighScores;
  }
}

function parseHighScoresResponse(scores: unknown) {
  if (!Array.isArray(scores)) return staticHighScores;

  const parsedScores = scores
    .map(parseSubmittedScore)
    .filter((score): score is HighScoreEntry => Boolean(score));

  return parsedScores.length > 0 ? sortHighScores(parsedScores) : staticHighScores;
}

function parseSubmittedScore(score: unknown): HighScoreEntry | null {
  if (!score || typeof score !== "object") return null;

  const entry = score as { id?: unknown; name?: unknown; score?: unknown };

  if (typeof entry.name !== "string" || typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
    return null;
  }

  return {
    id: typeof entry.id === "string" ? entry.id : undefined,
    name: entry.name,
    score: Math.max(0, Math.floor(entry.score))
  };
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
