"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { Shape, ShapeGeometry } from "three";
import { GameOverScreen, RetroMenu, StageBriefingScreen } from "@/components/game/GameScreens";
import { Hud } from "@/components/game/Hud";
import { type ExplosionKind, useEightBitMusic } from "@/components/game/useEightBitMusic";
import { useHighScores } from "@/components/game/useHighScores";
import { useKeyboardActions } from "@/components/game/useKeyboardActions";
import { createSpaceShooterSimulation } from "@/game/simulation/createSpaceShooterSimulation";
import type {
  ActionState,
  Enemy,
  EnemyBeam,
  EnemyProjectile,
  GroundProfile,
  PowerUp,
  PowerUpKind,
  Projectile,
  SimulationFrame,
  SimulationInitialProgress,
  Snapshot,
  Vector2
} from "@/game/simulation/types";
import { qualifiesForHighScores } from "@/lib/highScores";

type GamePhase = "menu" | "stageSelect" | "stageBriefing" | "playing" | "gameOver" | "exited" | "highScores";
type StageDefinition = {
  backgroundKind?: "stars" | "rock";
  briefing: string;
  ceiling?: GroundProfile;
  difficultyMultiplier: number;
  ground?: GroundProfile;
  id: number;
  setting: string;
  title: string;
  turretsEnabled?: boolean;
};
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
  ceiling: null,
  ground: null,
  elapsedTime: 0,
  score: 0,
  shieldCharges: 0,
  level: 1,
  nextLevelScore: 100,
  timeScale: 1,
  weaponPowerTimeRemaining: 0,
  health: 100,
  maxHealth: 100,
  events: []
};
const hudSnapshotInterval = 1 / 12;
const stageDefinitions: StageDefinition[] = [
  {
    briefing: "Enemy formations are breaking through the outer patrol lane. Hold the line, survive the assault, and eliminate the command ship.",
    difficultyMultiplier: 0.8,
    id: 1,
    setting: "Outer Orbit",
    title: "First Contact"
  },
  {
    briefing: "Attack the enemy base from low orbit. Skim the outpost defenses, but stay clear of the jagged ground batteries along the lower edge.",
    difficultyMultiplier: 1,
    ground: {
      points: [
        { x: -5.12, y: -2.84 },
        { x: -4.36, y: -2.18 },
        { x: -3.8, y: -2.78 },
        { x: -3.1, y: -2.5 },
        { x: -2.35, y: -2.66 },
        { x: -1.58, y: -2.08 },
        { x: -0.74, y: -2.56 },
        { x: 0.06, y: -1.96 },
        { x: 0.82, y: -2.48 },
        { x: 1.55, y: -1.92 },
        { x: 2.32, y: -2.44 },
        { x: 3.08, y: -2.24 },
        { x: 3.8, y: -2.58 },
        { x: 4.56, y: -2.04 },
        { x: 5.32, y: -2.82 }
      ]
    },
    id: 2,
    setting: "Enemy Outpost",
    title: "Base Attack",
    turretsEnabled: true
  },
  {
    backgroundKind: "rock",
    briefing: "Fly deep into the enemy base, thread the reactor tunnels, and destroy the core before the complex seals itself around you.",
    ceiling: {
      maxStep: 0.84,
      maxY: 2.9,
      minY: 1.45,
      points: [
        { x: -5.12, y: 2.72 },
        { x: -4.36, y: 1.72 },
        { x: -3.8, y: 2.58 },
        { x: -3.1, y: 1.55 },
        { x: -2.35, y: 2.82 },
        { x: -1.58, y: 1.66 },
        { x: -0.74, y: 2.28 },
        { x: 0.06, y: 1.48 },
        { x: 0.82, y: 2.72 },
        { x: 1.55, y: 1.78 },
        { x: 2.32, y: 2.9 },
        { x: 3.08, y: 1.58 },
        { x: 3.8, y: 2.46 },
        { x: 4.56, y: 1.94 },
        { x: 5.32, y: 2.84 }
      ]
    },
    difficultyMultiplier: 1.3,
    ground: {
      maxStep: 0.84,
      maxY: -1.45,
      minY: -2.9,
      points: [
        { x: -5.12, y: -2.86 },
        { x: -4.36, y: -1.74 },
        { x: -3.8, y: -2.7 },
        { x: -3.1, y: -1.58 },
        { x: -2.35, y: -2.88 },
        { x: -1.58, y: -1.72 },
        { x: -0.74, y: -2.22 },
        { x: 0.06, y: -1.46 },
        { x: 0.82, y: -2.78 },
        { x: 1.55, y: -1.82 },
        { x: 2.32, y: -2.86 },
        { x: 3.08, y: -1.54 },
        { x: 3.8, y: -2.52 },
        { x: 4.56, y: -2.02 },
        { x: 5.32, y: -2.9 }
      ]
    },
    id: 3,
    setting: "Enemy Core",
    title: "Going deep",
    turretsEnabled: true
  }
];

export function GameClient() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [gameKey, setGameKey] = useState(0);
  const [isVictory, setIsVictory] = useState(false);
  const [levelUpMessage, setLevelUpMessage] = useState<LevelUpMessage | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(initialSnapshot);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
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
    clearLevelUpMessage();
    setIsVictory(false);
    setCurrentStageIndex(0);
    setSnapshot(initialSnapshot);
    setPhase("stageBriefing");
  };

  const handleStartStage = () => {
    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    void music.start();
    clearLevelUpMessage();
    setGameKey((key) => key + 1);
    setPhase("playing");
  };

  const handleExit = () => {
    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setIsVictory(false);
    setCurrentStageIndex(0);
    setSnapshot(initialSnapshot);
    setPhase("exited");
  };

  const handleStageComplete = (finalSnapshot: Snapshot) => {
    const nextStageIndex = currentStageIndex + 1;

    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setSnapshot(finalSnapshot);

    if (nextStageIndex >= stageDefinitions.length) {
      handleGameOver(finalSnapshot, true);
      return;
    }

    setCurrentStageIndex(nextStageIndex);
    setPhase("stageBriefing");
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
    setCurrentStageIndex(0);
    setSnapshot(initialSnapshot);
    setPhase("menu");
  };

  const handleHighScores = () => {
    void refreshHighScores();
    setPhase("highScores");
  };

  const handleSelectStage = () => {
    setPhase("stageSelect");
  };

  const handleStageSelect = (stageId: number) => {
    const nextStageIndex = stageDefinitions.findIndex((stage) => stage.id === stageId);

    if (nextStageIndex < 0) return;

    music.stop();
    music.setBossMode(false);
    music.setIntensity(1);
    clearLevelUpMessage();
    setIsVictory(false);
    setCurrentStageIndex(nextStageIndex);
    setSnapshot(initialSnapshot);
    setPhase("stageBriefing");
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
                backgroundKind={stageDefinitions[currentStageIndex].backgroundKind ?? "stars"}
                ceiling={stageDefinitions[currentStageIndex].ceiling}
                difficultyMultiplier={stageDefinitions[currentStageIndex].difficultyMultiplier}
                ground={stageDefinitions[currentStageIndex].ground}
                initialProgress={getSimulationInitialProgress(snapshot)}
                turretsEnabled={stageDefinitions[currentStageIndex].turretsEnabled}
                onGameOver={handleGameOver}
                onLevelUp={handleLevelUp}
                onSnapshot={setSnapshot}
                onStageComplete={handleStageComplete}
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
          <Hud currentStage={stageDefinitions[currentStageIndex]} snapshot={snapshot} stageCount={stageDefinitions.length} onExit={handleExit} />
          {levelUpMessage ? <LevelUpBanner key={levelUpMessage.id} level={levelUpMessage.level} /> : null}
        </>
      ) : phase === "stageBriefing" ? (
        <StageBriefingScreen
          stage={stageDefinitions[currentStageIndex]}
          stageCount={stageDefinitions.length}
          onActivateAudio={music.start}
          onStartStage={handleStartStage}
        />
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
          stages={stageDefinitions}
          highScores={highScores}
          onActivateAudio={music.start}
          onNewGame={handleNewGame}
          onExit={handleExit}
          onBackToMenu={handleBackToMenu}
          onHighScores={handleHighScores}
          onSelectStage={handleSelectStage}
          onStageSelect={handleStageSelect}
        />
      )}
    </main>
  );
}

function SpaceScene({
  actions,
  backgroundKind,
  ceiling,
  difficultyMultiplier,
  ground,
  initialProgress,
  turretsEnabled = false,
  onGameOver,
  onLevelUp,
  onSnapshot,
  onStageComplete,
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
  backgroundKind: "stars" | "rock";
  ceiling?: GroundProfile;
  difficultyMultiplier: number;
  ground?: GroundProfile;
  initialProgress: Partial<SimulationInitialProgress>;
  turretsEnabled?: boolean;
  onGameOver: (snapshot: Snapshot, victory?: boolean) => void;
  onLevelUp: (level: number) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  onStageComplete: (snapshot: Snapshot) => void;
  onTimeScaleChange: (timeScale: number) => void;
  onStopMusic: () => void;
  playBossSpawn: () => void;
  playBuzz: () => void;
  playExplosion: (kind: ExplosionKind) => void;
  playLevelUpTune: () => void;
  playPew: () => void;
  setBossMusicMode: (isBossMode: boolean) => void;
}) {
  const [simulation] = useState(() => createSpaceShooterSimulation(initialProgress, { ceiling, difficultyMultiplier, ground, turretsEnabled }));
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
  const [sceneFrame] = useState(() => simulation.getFrame());
  const sceneSignatureRef = useRef(getSceneSignature(sceneFrame));
  const [, setSceneVersion] = useState(0);
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
    const frame = simulation.step(Math.min(delta, 0.05), actions);
    const elapsedTime = elapsedTimeRef.current;
    const blinkRemaining = blinkUntilRef.current - elapsedTime;
    const shouldPublishHudSnapshot =
      elapsedTime - lastHudUpdateTimeRef.current >= hudSnapshotInterval ||
      hasHudSnapshotChanged(frame, lastHudSnapshotRef.current);

    if (playerRef.current) {
      playerRef.current.position.x = frame.player.x;
      playerRef.current.position.y = frame.player.y;
    }

    if (playerMaterialRef.current) {
      playerMaterialRef.current.visible =
        !playerDestroyedRef.current && (blinkRemaining <= 0 || Math.floor(blinkRemaining * 18) % 2 === 0);
    }

    if (shouldPublishHudSnapshot) {
      const snapshot = simulation.getSnapshot(frame.events);
      lastHudSnapshotRef.current = snapshot;
      lastHudUpdateTimeRef.current = elapsedTime;
      onSnapshot(snapshot);
    }

    onTimeScaleChange(frame.timeScale);

    const nextSceneSignature = getSceneSignature(frame);
    if (nextSceneSignature !== sceneSignatureRef.current) {
      sceneSignatureRef.current = nextSceneSignature;
      setSceneVersion((version) => version + 1);
    }

    if (frame.events.length === 0) return;

    const nextExplosions: Explosion[] = [];
    const nextShieldFlashes: ShieldFlash[] = [];

    for (const event of frame.events) {
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
          x: frame.player.x,
          y: frame.player.y
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
        const finalSnapshot = simulation.getSnapshot(frame.events);
        gameOverRef.current = true;
        playerDestroyedRef.current = true;
        lastHudSnapshotRef.current = finalSnapshot;
        lastHudUpdateTimeRef.current = elapsedTime;
        onSnapshot(finalSnapshot);
        onStopMusic();
        playExplosion("player");
        nextExplosions.push({
          id: explosionIdRef.current++,
          kind: "player",
          x: event.position.x,
          y: event.position.y
        });
        gameOverTimerRef.current = window.setTimeout(() => onGameOver(finalSnapshot), 700);
      }

      if (event.type === "stageComplete" && !gameOverRef.current) {
        const finalSnapshot = simulation.getSnapshot(frame.events);
        gameOverRef.current = true;
        lastHudSnapshotRef.current = finalSnapshot;
        lastHudUpdateTimeRef.current = elapsedTime;
        onSnapshot(finalSnapshot);
        onStopMusic();
        playExplosion("enemy");
        nextExplosions.push({
          id: explosionIdRef.current++,
          kind: "enemy",
          x: event.position.x,
          y: event.position.y
        });
        gameOverTimerRef.current = window.setTimeout(() => onStageComplete(finalSnapshot), 900);
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
      {backgroundKind === "rock" ? <RockBackground /> : <Starfield />}
      {sceneFrame.ceiling ? <Terrain terrain={sceneFrame.ceiling} side="ceiling" /> : null}
      {sceneFrame.ground ? <GroundTerrain ground={sceneFrame.ground} /> : null}
      <mesh ref={playerRef} position={[sceneFrame.player.x, sceneFrame.player.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.29, 0.74, 3]} />
        <meshBasicMaterial ref={playerMaterialRef} color="#66e3ff" />
      </mesh>
      {sceneFrame.shieldCharges > 0 ? (
        <PlayerShield charges={sceneFrame.shieldCharges} player={sceneFrame.player} />
      ) : null}
      {sceneFrame.weaponPowerTimeRemaining > 0 ? <WeaponPowerAura player={sceneFrame.player} /> : null}
      {sceneFrame.projectiles.map((projectile) => (
        <PlayerProjectileMesh key={projectile.id} projectile={projectile} />
      ))}
      {sceneFrame.enemies.map((enemy) =>
        enemy.kind === "boss" ? (
          <BossEnemy key={enemy.id} enemy={enemy} />
        ) : enemy.kind === "miniBoss" ? (
          <MiniBossEnemy key={enemy.id} enemy={enemy} />
        ) : enemy.kind === "turret" ? (
          <TurretEnemy key={enemy.id} enemy={enemy} />
        ) : (
          <BasicEnemy key={enemy.id} enemy={enemy} />
        )
      )}
      {sceneFrame.enemyBeams.map((beam) => (
        <EnemyBeamEffect beam={beam} key={beam.id} />
      ))}
      {sceneFrame.enemyProjectiles.map((projectile) => (
        <EnemyProjectileMesh key={projectile.id} projectile={projectile} />
      ))}
      {sceneFrame.powerUps.map((powerUp) => (
        <PowerUpPickup key={powerUp.id} powerUp={powerUp} />
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

function hasHudSnapshotChanged(next: SimulationFrame, previous: Snapshot) {
  return (
    next.score !== previous.score ||
    next.level !== previous.level ||
    next.nextLevelScore !== previous.nextLevelScore ||
    next.health !== previous.health ||
    next.maxHealth !== previous.maxHealth
  );
}

function getSceneSignature(frame: SimulationFrame) {
  return [
    getIdsSignature(frame.projectiles),
    frame.enemies
      .map(
        (enemy) =>
          `${enemy.id}:${enemy.kind}:${Number(enemy.beamChargeTimeRemaining > 0)}:${Number(enemy.beamTimeRemaining > 0)}:${Number(
            enemy.turretChargeTimeRemaining > 0
          )}:${enemy.turretBeams.length}`
      )
      .join(","),
    getIdsSignature(frame.enemyProjectiles),
    frame.enemyBeams.map((beam) => `${beam.id}:${beam.kind}`).join(","),
    frame.powerUps.map((powerUp) => `${powerUp.id}:${powerUp.kind}`).join(","),
    Number(frame.shieldCharges > 0),
    Number(frame.weaponPowerTimeRemaining > 0),
    frame.ground?.points.length ?? 0,
    frame.ceiling?.points.length ?? 0
  ].join("|");
}

function getIdsSignature(items: Array<{ id: number }>) {
  return items.map((item) => item.id).join(",");
}

function PlayerProjectileMesh({ projectile }: { projectile: Projectile }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;

    meshRef.current.position.x = projectile.x;
    meshRef.current.position.y = projectile.y;
  });

  return (
    <mesh ref={meshRef} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, Math.atan2(projectile.velocityY, projectile.velocityX) - Math.PI / 2]}>
      <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
      <meshBasicMaterial color="#ffbf69" />
    </mesh>
  );
}

function EnemyProjectileMesh({ projectile }: { projectile: EnemyProjectile }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;

    meshRef.current.position.x = projectile.x;
    meshRef.current.position.y = projectile.y;
  });

  return (
    <mesh ref={meshRef} position={[projectile.x, projectile.y, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
      <meshBasicMaterial color="#ff5d73" />
    </mesh>
  );
}

function BasicEnemy({ enemy }: { enemy: Enemy }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;

    meshRef.current.position.x = enemy.x;
    meshRef.current.position.y = enemy.y;
  });

  return (
    <mesh ref={meshRef} position={[enemy.x, enemy.y, 0]}>
      {enemy.kind === "sineGunner" ? <dodecahedronGeometry args={[0.27, 0]} /> : <octahedronGeometry args={[0.26, 0]} />}
      <meshBasicMaterial color={enemy.kind === "sineGunner" ? "#8cff98" : "#ff5d73"} />
    </mesh>
  );
}

function TurretEnemy({ enemy }: { enemy: Enemy }) {
  const groupRef = useRef<Group>(null);
  const chargeGlowRef = useRef<MeshBasicMaterial>(null);
  const elapsedTimeRef = useRef(0);
  const hasActiveBeam = enemy.turretBeams.length > 0;
  const isCharging = enemy.turretChargeTimeRemaining > 0;
  const verticalScale = enemy.turretMount === "ceiling" ? -1 : 1;

  useFrame((_, delta) => {
    elapsedTimeRef.current += delta;

    if (groupRef.current) {
      groupRef.current.position.x = enemy.x;
      groupRef.current.position.y = enemy.y;
      groupRef.current.rotation.z = Math.sin(elapsedTimeRef.current * 3.2) * 0.015;
    }

    if (chargeGlowRef.current) {
      chargeGlowRef.current.opacity = isCharging ? 0.34 + Math.sin(elapsedTimeRef.current * 30) * 0.16 : 0.08;
    }
  });

  return (
    <group ref={groupRef} position={[enemy.x, enemy.y, 0.04]} scale={[1, verticalScale, 1]}>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[0.62, 0.22, 0.12]} />
        <meshBasicMaterial color="#2c3949" />
      </mesh>
      <mesh position={[0, 0.03, 0.02]}>
        <boxGeometry args={[0.36, 0.3, 0.14]} />
        <meshBasicMaterial color="#ffbf69" />
      </mesh>
      <mesh position={[-0.2, 0.2, 0.05]} rotation={[0, 0, Math.PI / 10]}>
        <boxGeometry args={[0.4, 0.12, 0.12]} />
        <meshBasicMaterial color={isCharging ? "#ffe66d" : hasActiveBeam ? "#ff2f7d" : "#eef7ff"} />
      </mesh>
      <mesh position={[-0.43, 0.25, 0.06]}>
        <circleGeometry args={[0.13, 16]} />
        <meshBasicMaterial color={isCharging ? "#ffe66d" : hasActiveBeam ? "#ff2f7d" : "#66e3ff"} transparent opacity={0.9} />
      </mesh>
      <mesh position={[-0.43, 0.25, -0.02]}>
        <circleGeometry args={[0.32, 20]} />
        <meshBasicMaterial ref={chargeGlowRef} color="#ff2f7d" transparent opacity={0.08} />
      </mesh>
    </group>
  );
}

function MiniBossEnemy({ enemy }: { enemy: Enemy }) {
  const groupRef = useRef<Group>(null);
  const chargeGlowRef = useRef<MeshBasicMaterial>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.position.x = enemy.x;
    groupRef.current.position.y = enemy.y;
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
    groupRef.current.position.x = enemy.x;
    groupRef.current.position.y = enemy.y;
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

    if (beam.kind === "aimed") {
      const length = distance2D(beam.start, beam.end);
      const center = midpoint2D(beam.start, beam.end);
      groupRef.current.position.x = center.x;
      groupRef.current.position.y = center.y;
      groupRef.current.rotation.z = Math.atan2(beam.end.y - beam.start.y, beam.end.x - beam.start.x);
      groupRef.current.scale.x = length;
      groupRef.current.scale.y = pulse;
      return;
    }

    groupRef.current.position.y = beam.y;
    groupRef.current.scale.y = pulse;
  });

  if (beam.kind === "aimed") {
    const length = distance2D(beam.start, beam.end);
    const center = midpoint2D(beam.start, beam.end);
    const angle = Math.atan2(beam.end.y - beam.start.y, beam.end.x - beam.start.x);

    return (
      <group ref={groupRef} position={[center.x, center.y, 0.05]} rotation={[0, 0, angle]} scale={[length, 1, 1]}>
        <mesh>
          <boxGeometry args={[1, 0.44, 0.02]} />
          <meshBasicMaterial color="#ff2f7d" transparent opacity={0.24} />
        </mesh>
        <mesh>
          <boxGeometry args={[1, 0.2, 0.03]} />
          <meshBasicMaterial color="#ff5d73" transparent opacity={0.74} />
        </mesh>
        <mesh>
          <boxGeometry args={[1, 0.06, 0.04]} />
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

function PlayerShield({ charges, player }: { charges: number; player: Vector2 }) {
  const groupRef = useRef<Group>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.position.x = player.x;
    groupRef.current.position.y = player.y;
    const pulse = 1 + Math.sin(elapsedTimeRef.current * 6) * 0.05 + Math.min(charges - 1, 3) * 0.03;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.rotation.z += 0.025;
  });

  return (
    <group ref={groupRef} position={[player.x, player.y, 0.04]}>
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

function WeaponPowerAura({ player }: { player: Vector2 }) {
  const groupRef = useRef<Group>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.position.x = player.x;
    groupRef.current.position.y = player.y;
    groupRef.current.rotation.z = Math.sin(elapsedTimeRef.current * 8) * 0.08;
    groupRef.current.scale.setScalar(1 + Math.sin(elapsedTimeRef.current * 10) * 0.04);
  });

  return (
    <group ref={groupRef} position={[player.x, player.y, 0.05]}>
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

function PowerUpPickup({ powerUp }: { powerUp: PowerUp }) {
  const groupRef = useRef<Group>(null);
  const elapsedTimeRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    elapsedTimeRef.current += delta;
    groupRef.current.position.x = powerUp.x;
    groupRef.current.position.y = powerUp.y;
    const pulse = 1 + Math.sin(elapsedTimeRef.current * 7) * 0.08;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.rotation.z += delta * 2.5;
  });

  return (
    <group ref={groupRef} position={[powerUp.x, powerUp.y, 0.06]}>
      <mesh>
        <ringGeometry args={[0.2, 0.3, 24]} />
        <meshBasicMaterial color={getPowerUpColor(powerUp.kind)} transparent opacity={0.9} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.12, 16]} />
        <meshBasicMaterial color="#eef7ff" transparent opacity={0.82} />
      </mesh>
      {powerUp.kind === "shield" ? (
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.1, 0.34, 0.02]} />
          <meshBasicMaterial color="#8cff98" transparent opacity={0.88} />
        </mesh>
      ) : powerUp.kind === "health" ? (
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

function GroundTerrain({ ground }: { ground: GroundProfile }) {
  return <Terrain side="floor" terrain={ground} />;
}

function Terrain({ side, terrain }: { side: "floor" | "ceiling"; terrain: GroundProfile }) {
  const terrainFillY = side === "floor" ? -4.6 : 4.6;
  const isCeiling = side === "ceiling";
  const fillRef = useRef<Mesh>(null);
  const edgeRefs = useRef<Array<Mesh | null>>([]);
  const pointRefs = useRef<Array<Mesh | null>>([]);
  const terrainShape = useMemo(() => createTerrainShape(terrain, terrainFillY), [terrain, terrainFillY]);

  const edgeSegments = useMemo(
    () => getTerrainEdgeSegments(terrain),
    [terrain]
  );

  useFrame(() => {
    if (fillRef.current) {
      fillRef.current.geometry.dispose();
      fillRef.current.geometry = new ShapeGeometry(createTerrainShape(terrain, terrainFillY));
    }

    const nextEdgeSegments = getTerrainEdgeSegments(terrain);
    for (const segment of nextEdgeSegments) {
      const edge = edgeRefs.current[segment.id];
      if (!edge) continue;

      edge.position.x = segment.x;
      edge.position.y = segment.y;
      edge.rotation.z = segment.angle;
      edge.scale.x = segment.length;
    }

    terrain.points.forEach((point, index) => {
      const pointMesh = pointRefs.current[index];
      if (!pointMesh) return;

      pointMesh.position.x = point.x;
      pointMesh.position.y = point.y + (isCeiling ? 0.14 : -0.14);
    });
  });

  return (
    <group position={[0, 0, -0.18]}>
      <mesh ref={fillRef}>
        <shapeGeometry args={[terrainShape]} />
        <meshBasicMaterial color="#18202a" transparent opacity={0.96} />
      </mesh>
      {edgeSegments.map((segment) => (
        <mesh
          key={segment.id}
          ref={(mesh) => {
            edgeRefs.current[segment.id] = mesh;
          }}
          position={[segment.x, segment.y, 0.02]}
          rotation={[0, 0, segment.angle]}
          scale={[segment.length, 1, 1]}
        >
          <boxGeometry args={[1, 0.045, 0.02]} />
          <meshBasicMaterial color="#ffbf69" transparent opacity={0.78} />
        </mesh>
      ))}
      {terrain.points.map((point, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            pointRefs.current[index] = mesh;
          }}
          position={[point.x, point.y + (isCeiling ? 0.14 : -0.14), 0.03]}
        >
          <boxGeometry args={[0.16, 0.28, 0.02]} />
          <meshBasicMaterial color="#2c3949" transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function createTerrainShape(terrain: GroundProfile, terrainFillY: number) {
  const shape = new Shape();
  const firstPoint = terrain.points[0];
  const lastPoint = terrain.points[terrain.points.length - 1];

  shape.moveTo(firstPoint.x, terrainFillY);

  for (const point of terrain.points) {
    shape.lineTo(point.x, point.y);
  }

  shape.lineTo(lastPoint.x, terrainFillY);
  shape.closePath();

  return shape;
}

function getTerrainEdgeSegments(terrain: GroundProfile) {
  return terrain.points.slice(1).map((point, index) => {
    const previous = terrain.points[index];
    const deltaX = point.x - previous.x;
    const deltaY = point.y - previous.y;

    return {
      angle: Math.atan2(deltaY, deltaX),
      id: index,
      length: Math.hypot(deltaX, deltaY),
      x: (previous.x + point.x) / 2,
      y: (previous.y + point.y) / 2
    };
  });
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

function RockBackground() {
  const plates = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => ({
        color: seededUnit(index * 19 + 9) > 0.58 ? "#202833" : seededUnit(index * 23 + 11) > 0.42 ? "#151b23" : "#29313c",
        height: seededRange(index * 7 + 2, 0.48, 1.15),
        id: index,
        rotation: seededRange(index * 13 + 4, -0.42, 0.42),
        width: seededRange(index * 5 + 3, 0.72, 1.8),
        x: seededRange(index * 3 + 1, -6.8, 6.8),
        y: seededRange(index * 11 + 5, -4, 4)
      })),
    []
  );
  const cracks = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => ({
        height: seededRange(index * 17 + 6, 0.018, 0.044),
        id: index,
        opacity: seededRange(index * 29 + 10, 0.18, 0.46),
        rotation: seededRange(index * 31 + 8, -0.82, 0.82),
        width: seededRange(index * 37 + 12, 0.22, 1.12),
        x: seededRange(index * 41 + 14, -6.9, 6.9),
        y: seededRange(index * 43 + 16, -4.1, 4.1)
      })),
    []
  );

  return (
    <group position={[0, 0, -1.25]}>
      <mesh>
        <planeGeometry args={[14.4, 8.2]} />
        <meshBasicMaterial color="#0b0e12" />
      </mesh>
      {plates.map((plate) => (
        <mesh key={plate.id} position={[plate.x, plate.y, 0.01]} rotation={[0, 0, plate.rotation]}>
          <boxGeometry args={[plate.width, plate.height, 0.01]} />
          <meshBasicMaterial color={plate.color} transparent opacity={0.72} />
        </mesh>
      ))}
      {cracks.map((crack) => (
        <mesh key={crack.id} position={[crack.x, crack.y, 0.02]} rotation={[0, 0, crack.rotation]}>
          <boxGeometry args={[crack.width, crack.height, 0.01]} />
          <meshBasicMaterial color="#05070d" transparent opacity={crack.opacity} />
        </mesh>
      ))}
    </group>
  );
}

function getSimulationInitialProgress(snapshot: Snapshot): Partial<SimulationInitialProgress> {
  return {
    elapsedTime: snapshot.elapsedTime,
    health: snapshot.health,
    level: snapshot.level,
    maxHealth: snapshot.maxHealth,
    nextLevelScore: snapshot.nextLevelScore,
    score: snapshot.score,
    shieldCharges: snapshot.shieldCharges
  };
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
