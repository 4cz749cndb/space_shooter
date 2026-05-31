"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { GameOverScreen, RetroMenu } from "@/components/game/GameScreens";
import { type ExplosionKind, useEightBitMusic } from "@/components/game/useEightBitMusic";
import { useHighScores } from "@/components/game/useHighScores";
import { createSpaceShooterSimulation } from "@/game/simulation/createSpaceShooterSimulation";
import type { ActionState, Enemy, EnemyBeam, PowerUpKind, Snapshot, Vector2 } from "@/game/simulation/types";
import { qualifiesForHighScores } from "@/lib/highScores";

type GamePhase = "menu" | "playing" | "gameOver" | "exited" | "highScores";
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
type LevelUpMessage = {
  id: number;
  level: number;
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
  level: 1,
  nextLevelScore: 100,
  timeScale: 1,
  wave: 1,
  weaponPowerTimeRemaining: 0,
  health: 100,
  maxHealth: 100,
  events: []
};
const hudSnapshotInterval = 1 / 12;

export function GameClient() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [gameKey, setGameKey] = useState(0);
  const [isVictory, setIsVictory] = useState(false);
  const [levelUpMessage, setLevelUpMessage] = useState<LevelUpMessage | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const levelUpMessageIdRef = useRef(1);
  const levelUpMessageTimerRef = useRef<number | null>(null);
  const { highScores, refreshHighScores, submitHighScore } = useHighScores();
  const actions = useKeyboardActions(phase === "playing");
  const music = useEightBitMusic();

  useEffect(
    () => () => {
      if (levelUpMessageTimerRef.current !== null) {
        window.clearTimeout(levelUpMessageTimerRef.current);
      }
    },
    []
  );

  const clearLevelUpMessage = () => {
    if (levelUpMessageTimerRef.current !== null) {
      window.clearTimeout(levelUpMessageTimerRef.current);
      levelUpMessageTimerRef.current = null;
    }

    setLevelUpMessage(null);
  };

  const handleLevelUp = (level: number) => {
    if (levelUpMessageTimerRef.current !== null) {
      window.clearTimeout(levelUpMessageTimerRef.current);
    }

    setLevelUpMessage({ id: levelUpMessageIdRef.current++, level });
    levelUpMessageTimerRef.current = window.setTimeout(() => {
      setLevelUpMessage(null);
      levelUpMessageTimerRef.current = null;
    }, 1800);
  };

  const handleNewGame = () => {
    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    void music.start();
    clearLevelUpMessage();
    setIsVictory(false);
    setSnapshot(initialSnapshot);
    setGameKey((key) => key + 1);
    setPhase("playing");
  };

  const handleExit = () => {
    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setIsVictory(false);
    setSnapshot(initialSnapshot);
    setPhase("exited");
  };

  const handleGameOver = (finalSnapshot: Snapshot, victory = false) => {
    const qualifiesForLeaderboard = victory || qualifiesForHighScores(finalSnapshot.score, highScores);

    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setIsVictory(victory);
    setSnapshot(finalSnapshot);
    setPhase("gameOver");
    void music.playResultTune(qualifiesForLeaderboard ? "happy" : "sad");
  };

  const handleBackToMenu = () => {
    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setIsVictory(false);
    setSnapshot(initialSnapshot);
    setPhase("menu");
  };

  const handleHighScores = () => {
    void refreshHighScores();
    setPhase("highScores");
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
                onLevelUp={handleLevelUp}
                onSnapshot={setSnapshot}
                onTimeScaleChange={music.setIntensity}
                onStopMusic={music.stop}
                playBuzz={music.playBuzz}
                playBossSpawn={music.playBossSpawn}
                playExplosion={music.playExplosion}
                playLevelUpTune={music.playLevelUpTune}
                playPew={music.playPew}
                setBossMusicMode={music.setBossMode}
              />
            </Canvas>
          </div>
          <Hud snapshot={snapshot} onExit={handleExit} />
          {levelUpMessage ? <LevelUpBanner key={levelUpMessage.id} level={levelUpMessage.level} /> : null}
        </>
      ) : phase === "gameOver" ? (
        <GameOverScreen
          highScores={highScores}
          isVictory={isVictory}
          snapshot={snapshot}
          onBackToMenu={handleBackToMenu}
          onNewGame={handleNewGame}
          onSubmitHighScore={submitHighScore}
        />
      ) : (
        <RetroMenu
          phase={phase}
          highScores={highScores}
          onActivateAudio={music.start}
          onNewGame={handleNewGame}
          onExit={handleExit}
          onBackToMenu={handleBackToMenu}
          onHighScores={handleHighScores}
        />
      )}
    </main>
  );
}

function SpaceScene({
  actions,
  onGameOver,
  onLevelUp,
  onSnapshot,
  onTimeScaleChange,
  onStopMusic,
  playBossSpawn,
  playBuzz,
  playExplosion,
  playLevelUpTune,
  playPew,
  setBossMusicMode
}: {
  actions: ActionState;
  onGameOver: (snapshot: Snapshot, victory?: boolean) => void;
  onLevelUp: (level: number) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onTimeScaleChange: (timeScale: number) => void;
  onStopMusic: () => void;
  playBossSpawn: () => void;
  playBuzz: () => void;
  playExplosion: (kind: ExplosionKind) => void;
  playLevelUpTune: () => void;
  playPew: () => void;
  setBossMusicMode: (isBossMode: boolean) => void;
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
  const lastHudSnapshotRef = useRef<Snapshot>(simulation.getSnapshot());
  const lastHudUpdateTimeRef = useRef(0);
  const [sceneSnapshot, setSceneSnapshot] = useState(() => simulation.getSnapshot());
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

  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    elapsedTimeRef.current += delta;
    const snapshot = simulation.step(Math.min(delta, 0.05), actions);
    const elapsedTime = elapsedTimeRef.current;
    const blinkRemaining = blinkUntilRef.current - elapsedTime;
    const shouldPublishHudSnapshot =
      elapsedTime - lastHudUpdateTimeRef.current >= hudSnapshotInterval ||
      hasHudSnapshotChanged(snapshot, lastHudSnapshotRef.current);

    setSceneSnapshot(snapshot);

    if (playerRef.current) {
      playerRef.current.position.x = snapshot.player.x;
      playerRef.current.position.y = snapshot.player.y;
    }

    if (playerMaterialRef.current) {
      playerMaterialRef.current.visible =
        !playerDestroyedRef.current && (blinkRemaining <= 0 || Math.floor(blinkRemaining * 18) % 2 === 0);
    }

    if (shouldPublishHudSnapshot) {
      lastHudSnapshotRef.current = snapshot;
      lastHudUpdateTimeRef.current = elapsedTime;
      onSnapshot(snapshot);
    }

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
          blinkUntilRef.current = elapsedTime + 0.5;
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

      if (event.type === "levelUp") {
        playLevelUpTune();
        onLevelUp(event.level);
      }

      if (event.type === "bossSpawned") {
        setBossMusicMode(true);
        playBossSpawn();
      }

      if (event.type === "playerDestroyed" && !gameOverRef.current) {
        gameOverRef.current = true;
        playerDestroyedRef.current = true;
        lastHudSnapshotRef.current = snapshot;
        lastHudUpdateTimeRef.current = elapsedTime;
        onSnapshot(snapshot);
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

      if (event.type === "levelComplete" && !gameOverRef.current) {
        gameOverRef.current = true;
        lastHudSnapshotRef.current = snapshot;
        lastHudUpdateTimeRef.current = elapsedTime;
        onSnapshot(snapshot);
        onStopMusic();
        playExplosion("enemy");
        nextExplosions.push({
          id: explosionIdRef.current++,
          kind: "enemy",
          x: event.position.x,
          y: event.position.y
        });
        gameOverTimerRef.current = window.setTimeout(() => onGameOver(snapshot, true), 900);
      }
    }

    if (nextExplosions.length > 0) {
      setExplosions((current) => [...current, ...nextExplosions]);
    }

    if (nextShieldFlashes.length > 0) {
      setShieldFlashes((current) => [...current, ...nextShieldFlashes]);
    }
  });

  return (
    <>
      <Starfield />
      <mesh ref={playerRef} position={[sceneSnapshot.player.x, sceneSnapshot.player.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.29, 0.74, 3]} />
        <meshBasicMaterial ref={playerMaterialRef} color="#66e3ff" />
      </mesh>
      {sceneSnapshot.shieldCharges > 0 ? (
        <PlayerShield position={[sceneSnapshot.player.x, sceneSnapshot.player.y, 0.04]} charges={sceneSnapshot.shieldCharges} />
      ) : null}
      {sceneSnapshot.weaponPowerTimeRemaining > 0 ? (
        <WeaponPowerAura position={[sceneSnapshot.player.x, sceneSnapshot.player.y, 0.05]} />
      ) : null}
      {sceneSnapshot.projectiles.map((projectile) => (
        <mesh
          key={projectile.id}
          position={[projectile.x, projectile.y, 0]}
          rotation={[0, 0, Math.atan2(projectile.velocityY, projectile.velocityX) - Math.PI / 2]}
        >
          <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
          <meshBasicMaterial color="#ffbf69" />
        </mesh>
      ))}
      {sceneSnapshot.enemies.map((enemy) =>
        enemy.kind === "boss" ? (
          <BossEnemy key={enemy.id} enemy={enemy} />
        ) : enemy.kind === "miniBoss" ? (
          <MiniBossEnemy key={enemy.id} enemy={enemy} />
        ) : (
          <mesh key={enemy.id} position={[enemy.x, enemy.y, 0]}>
            {enemy.kind === "sineGunner" ? <dodecahedronGeometry args={[0.27, 0]} /> : <octahedronGeometry args={[0.26, 0]} />}
            <meshBasicMaterial color={enemy.kind === "sineGunner" ? "#8cff98" : "#ff5d73"} />
          </mesh>
        )
      )}
      {sceneSnapshot.enemyBeams.map((beam) => (
        <EnemyBeamEffect beam={beam} key={beam.id} />
      ))}
      {sceneSnapshot.enemyProjectiles.map((projectile) => (
        <mesh key={projectile.id} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
          <meshBasicMaterial color="#ff5d73" />
        </mesh>
      ))}
      {sceneSnapshot.powerUps.map((powerUp) => (
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

function hasHudSnapshotChanged(next: Snapshot, previous: Snapshot) {
  return (
    next.score !== previous.score ||
    next.wave !== previous.wave ||
    next.level !== previous.level ||
    next.nextLevelScore !== previous.nextLevelScore ||
    next.health !== previous.health ||
    next.maxHealth !== previous.maxHealth
  );
}

function MiniBossEnemy({ enemy }: { enemy: Enemy }) {
  const groupRef = useRef<Group>(null);
  const chargeGlowRef = useRef<MeshBasicMaterial>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.rotation.z = Math.sin(elapsedTimeRef.current * 2.4) * 0.04;
    groupRef.current.scale.setScalar(1 + Math.sin(elapsedTimeRef.current * 5) * 0.025);

    if (chargeGlowRef.current) {
      const isCharging = enemy.beamChargeTimeRemaining > 0;
      chargeGlowRef.current.opacity = isCharging ? 0.32 + Math.sin(elapsedTimeRef.current * 28) * 0.14 : 0;
    }
  });

  const isBeamActive = enemy.beamTimeRemaining > 0;
  const isBeamCharging = enemy.beamChargeTimeRemaining > 0;
  const coreColor = isBeamActive ? "#ff2f7d" : isBeamCharging ? "#ffe66d" : "#66e3ff";

  return (
    <group ref={groupRef} position={[enemy.x, enemy.y, 0.02]}>
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[0.64, 24]} />
        <meshBasicMaterial ref={chargeGlowRef} color="#ffe66d" transparent opacity={0} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.5, 0.58, 0.12]} />
        <meshBasicMaterial color={isBeamCharging ? "#e8a8ff" : "#b45cff"} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.56, 0.13, 0.14]} />
        <meshBasicMaterial color={isBeamCharging ? "#ffe66d" : "#ffbf69"} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.56, 0.13, 0.14]} />
        <meshBasicMaterial color="#ffe66d" />
      </mesh>
      <mesh position={[-0.2, 0, 0.04]}>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#05070d" />
      </mesh>
      <mesh position={[-0.2, 0, 0.05]}>
        <ringGeometry args={[0.12, 0.18, 18]} />
        <meshBasicMaterial color={coreColor} transparent opacity={isBeamCharging ? 1 : 0.9} />
      </mesh>
      <mesh position={[0.31, 0.22, 0.03]}>
        <circleGeometry args={[0.065, 12]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.82} />
      </mesh>
      <mesh position={[0.31, -0.22, 0.03]}>
        <circleGeometry args={[0.065, 12]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

function BossEnemy({ enemy }: { enemy: Enemy }) {
  const groupRef = useRef<Group>(null);
  const chargeGlowRef = useRef<MeshBasicMaterial>(null);
  const elapsedTimeRef = useRef(0);
  const isBeamCharging = enemy.beamChargeTimeRemaining > 0;
  const isBeamActive = enemy.beamTimeRemaining > 0;

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.rotation.z = Math.sin(elapsedTimeRef.current * 1.6) * 0.025;
    groupRef.current.scale.setScalar(1 + Math.sin(elapsedTimeRef.current * 3) * 0.012);

    if (chargeGlowRef.current) {
      chargeGlowRef.current.opacity = isBeamCharging ? 0.26 + Math.sin(elapsedTimeRef.current * 24) * 0.12 : 0;
    }
  });

  return (
    <group ref={groupRef} position={[enemy.x, enemy.y, 0.04]}>
      <mesh position={[-0.88, 0, -0.04]}>
        <circleGeometry args={[0.46, 18]} />
        <meshBasicMaterial ref={chargeGlowRef} color="#ffe66d" transparent opacity={0} />
      </mesh>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[1.88, 0.42, 0.14]} />
        <meshBasicMaterial color="#8a6dff" />
      </mesh>
      <mesh position={[-0.18, 0.18, 0.04]}>
        <boxGeometry args={[1.2, 0.42, 0.16]} />
        <meshBasicMaterial color="#66e3ff" transparent opacity={0.92} />
      </mesh>
      <mesh position={[0.25, 0.42, 0.07]}>
        <boxGeometry args={[0.56, 0.3, 0.16]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.8} />
      </mesh>
      <mesh position={[-0.95, -0.04, 0.09]}>
        <boxGeometry args={[0.38, 0.18, 0.18]} />
        <meshBasicMaterial color={isBeamActive ? "#ff2f7d" : isBeamCharging ? "#ffe66d" : "#ffbf69"} />
      </mesh>
      <mesh position={[-0.18, 0.74, 0.08]}>
        <boxGeometry args={[0.26, 0.4, 0.14]} />
        <meshBasicMaterial color="#8cff98" />
      </mesh>
      {[-0.64, -0.2, 0.24, 0.68].map((x, index) => (
        <mesh key={x} position={[x, -0.32, 0.08]}>
          <boxGeometry args={[0.22, 0.16, 0.14]} />
          <meshBasicMaterial color={index % 2 === 0 ? "#ffe66d" : "#ff5d73"} transparent opacity={0.88} />
        </mesh>
      ))}
    </group>
  );
}

function EnemyBeamEffect({ beam }: { beam: EnemyBeam }) {
  const groupRef = useRef<Group>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    const pulse = 1 + Math.sin(elapsedTimeRef.current * 34) * 0.08;
    groupRef.current.scale.y = pulse;
  });

  if (beam.kind === "aimed") {
    const length = distance2D(beam.start, beam.end);
    const center = midpoint2D(beam.start, beam.end);
    const angle = Math.atan2(beam.end.y - beam.start.y, beam.end.x - beam.start.x);

    return (
      <group ref={groupRef} position={[center.x, center.y, 0.05]} rotation={[0, 0, angle]}>
        <mesh>
          <boxGeometry args={[length, 0.44, 0.02]} />
          <meshBasicMaterial color="#ff2f7d" transparent opacity={0.24} />
        </mesh>
        <mesh>
          <boxGeometry args={[length, 0.2, 0.03]} />
          <meshBasicMaterial color="#ff5d73" transparent opacity={0.74} />
        </mesh>
        <mesh>
          <boxGeometry args={[length, 0.06, 0.04]} />
          <meshBasicMaterial color="#eef7ff" transparent opacity={0.92} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[0, beam.y, 0.04]}>
      <mesh>
        <boxGeometry args={[8.4, 0.72, 0.02]} />
        <meshBasicMaterial color="#ff2f7d" transparent opacity={0.28} />
      </mesh>
      <mesh>
        <boxGeometry args={[8.4, 0.34, 0.03]} />
        <meshBasicMaterial color="#ff5d73" transparent opacity={0.78} />
      </mesh>
      <mesh>
        <boxGeometry args={[8.4, 0.09, 0.04]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function PlayerShield({ charges, position }: { charges: number; position: [number, number, number] }) {
  const groupRef = useRef<Group>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    const pulse = 1 + Math.sin(elapsedTimeRef.current * 6) * 0.05 + Math.min(charges - 1, 3) * 0.03;
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
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.rotation.z = Math.sin(elapsedTimeRef.current * 8) * 0.08;
    groupRef.current.scale.setScalar(1 + Math.sin(elapsedTimeRef.current * 10) * 0.04);
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
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    const pulse = 1 + Math.sin(elapsedTimeRef.current * 7) * 0.08;
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
        <div className="hud-panel hud-level">
          <p className="hud-label">Level</p>
          <p className="hud-value">{snapshot.level}</p>
          <p className="hud-subvalue">Next {snapshot.nextLevelScore}</p>
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

function LevelUpBanner({ level }: { level: number }) {
  return (
    <div className="level-up-banner" aria-live="polite" role="status">
      <span className="level-up-kicker">Level Up</span>
      <span className="level-up-value">Level {level}</span>
      <span className="level-up-bonus">Max health restored</span>
    </div>
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

function seededRange(seed: number, min: number, max: number) {
  return min + seededUnit(seed) * (max - min);
}

function seededUnit(seed: number) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453);
}

function distance2D(a: Vector2, b: Vector2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint2D(a: Vector2, b: Vector2) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function fract(value: number) {
  return value - Math.floor(value);
}
