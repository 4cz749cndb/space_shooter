import type {
  ActionState,
  Enemy,
  EnemyBeam,
  EnemyProjectile,
  GroundProfile,
  PowerUp,
  Projectile,
  SimulationFrame,
  SimulationEvent,
  SimulationInitialProgress,
  Snapshot,
  TurretMount,
  Vector2
} from "./types";

const bounds = {
  left: -3.6,
  right: 3.6,
  bottom: -3,
  top: 3
};

const playerSpeed = 4.2;
const projectileSpeed = 6.8;
const enemyProjectileSpeed = 3.2;
const enemySpeed = 1.15;
const fireCooldown = 0.16;
const spawnInterval = 1.02;
const enemyProjectileHitRadius = 0.29;
const playerEnemyHitRadius = 0.38;
const playerEnemyProjectileHitRadius = 0.24;
const playerPowerUpHitRadius = 0.44;
const playerGroundHitRadius = 0.3;
const groundHitCooldown = 0.75;
const groundScrollSpeedMultiplier = 0.5;
const groundPointSpacing = 0.76;
const groundOffscreenBuffer = 2.8;
const terrainLeftEdge = bounds.left - groundOffscreenBuffer - groundPointSpacing;
const terrainRightEdge = bounds.right + groundOffscreenBuffer + groundPointSpacing;
const groundHeightMin = -2.9;
const groundHeightMax = -1.92;
const groundHeightMaxStep = 0.58;
const powerUpSpawnMin = 12;
const powerUpSpawnMax = 20;
const weaponPowerDuration = 15;
const sineGunnerChance = 0.33;
const sineGunnerFireMin = 0.5;
const sineGunnerFireMax = 3;
const sineAmplitude = 0.72;
const sineFrequency = 3.1;
const miniBossChance = 0.04;
const miniBossHealth = 8;
const miniBossScore = 20;
const miniBossBeamChargeDuration = 0.75;
const miniBossBeamDurationMin = 2;
const miniBossBeamDurationMax = 7;
const miniBossBeamHalfHeight = 0.34;
const miniBossProjectileHitRadius = 0.32;
const miniBossFireMin = 2;
const miniBossFireMax = 5;
const miniBossSpawnGracePeriod = 45;
const miniBossDriftAmplitude = 0.55;
const miniBossDriftFrequency = 1.05;
const turretHealth = 4;
const turretScore = 10;
const turretBeamDuration = 2;
const turretBeamHalfWidth = 0.13;
const turretBeamInterval = 1;
const turretChargeDuration = 0.28;
const turretBurstSize = 3;
const turretIdleDuration = 3;
const turretYOffset = 0.32;
const bossSpawnTime = 240;
const bossHealth = 40;
const bossScore = 250;
const bossX = bounds.right - 0.5;
const bossProjectileHitRadius = 0.82;
const bossBodyHitRadius = 0.92;
const bossBeamChargeDuration = 0.75;
const bossBeamDuration = 1.2;
const bossBeamHalfWidth = 0.16;
const bossBeamCooldownMin = 2.6;
const bossBeamCooldownMax = 4.6;
const bossMoveSpeed = 0.72;
const bossTopGunYOffset = 0.52;
const bossFrontGunOffsetX = -1.02;
const maxTimeScale = 1.75;
const maxTimeScaleElapsedSeconds = 240;
const gameSpeedDifficultyFactor = 0.75;
const spawnRateDifficultyFactor = 1.35;
const enemyFireDifficultyFactor = 1.45;
const enemyHealthDifficultyFactor = 1;
const initialMaxHealth = 100;
const firstLevelScore = 100;
const baseLevelScoreCost = 100;
const totalScoreLevelCostMultiplier = 0.1;
const levelHealthBonus = 20;
const enemyCollisionDamage = 20;
const enemyProjectileDamage = 10;
const enemyBeamDamage = 10;
const turretBeamDamage = enemyBeamDamage * 2;

type SimulationOptions = {
  ceiling?: GroundProfile;
  difficultyMultiplier?: number;
  ground?: GroundProfile;
  turretsEnabled?: boolean;
};

export function createSpaceShooterSimulation(initialProgress?: Partial<SimulationInitialProgress>, options: SimulationOptions = {}) {
  const difficultyMultiplier = options.difficultyMultiplier ?? 1;
  const groundProfile = cloneGroundProfile(options.ground);
  const ceilingProfile = cloneGroundProfile(options.ceiling);

  normalizeInitialTerrainProfile(groundProfile);
  normalizeInitialTerrainProfile(ceilingProfile);

  const groundPoints = groundProfile?.points;
  const ceilingPoints = ceilingProfile?.points;
  const turretsEnabled = Boolean(options.turretsEnabled && (groundPoints || ceilingPoints));
  let nextId = 1;
  let score = initialProgress?.score ?? 0;
  let level = initialProgress?.level ?? 1;
  let nextLevelScore = initialProgress?.nextLevelScore ?? firstLevelScore;
  let maxHealth = initialProgress?.maxHealth ?? initialMaxHealth;
  let health = initialProgress?.health ?? maxHealth;
  let shieldCharges = initialProgress?.shieldCharges ?? 0;
  let weaponPowerTimeRemaining = 0;
  let elapsedTime = initialProgress?.elapsedTime ?? 0;
  let stageElapsedTime = 0;
  let fireTimer = 0;
  let groundHitTimer = 0;
  let spawnTimer = 0;
  let powerUpSpawnTimer = randomRange(powerUpSpawnMin, powerUpSpawnMax);
  let bossPhaseStarted = false;
  let stageComplete = false;
  const player: Vector2 = { x: -2.8, y: 0 };
  const projectiles: Projectile[] = [];
  const enemies: Enemy[] = [];
  const enemyProjectiles: EnemyProjectile[] = [];
  const powerUps: PowerUp[] = [];
  const enemyBeams: EnemyBeam[] = [];
  const enemyBeamCache = new Map<number, EnemyBeam>();
  const frame: SimulationFrame = {
    player,
    projectiles,
    enemies,
    enemyProjectiles,
    enemyBeams,
    powerUps,
    ceiling: ceilingProfile ?? null,
    ground: groundProfile ?? null,
    elapsedTime,
    score,
    shieldCharges,
    level,
    nextLevelScore,
    timeScale: 1,
    weaponPowerTimeRemaining,
    health,
    maxHealth,
    events: []
  };

  const updateFrame = (events: SimulationEvent[] = []): SimulationFrame => {
    updateEnemyBeams(enemyBeams);
    frame.elapsedTime = elapsedTime;
    frame.score = score;
    frame.shieldCharges = shieldCharges;
    frame.level = level;
    frame.nextLevelScore = nextLevelScore;
    frame.timeScale = getGameSpeedScale();
    frame.weaponPowerTimeRemaining = weaponPowerTimeRemaining;
    frame.health = health;
    frame.maxHealth = maxHealth;
    frame.events = events;

    return frame;
  };

  const getSnapshot = (events: SimulationEvent[] = []): Snapshot => ({
    player: { ...player },
    projectiles: projectiles.map((projectile) => ({ ...projectile })),
    enemies: enemies.map((enemy) => ({
      ...enemy,
      turretChargeTarget: enemy.turretChargeTarget ? { ...enemy.turretChargeTarget } : null,
      turretBeams: enemy.turretBeams.map((beam) => ({
        ...beam,
        start: { ...beam.start },
        target: { ...beam.target }
      }))
    })),
    enemyProjectiles: enemyProjectiles.map((projectile) => ({ ...projectile })),
    enemyBeams: getEnemyBeamSnapshots(),
    powerUps: powerUps.map((powerUp) => ({ ...powerUp })),
    ceiling: ceilingProfile ? (cloneGroundProfile(ceilingProfile) ?? null) : null,
    ground: groundProfile ? (cloneGroundProfile(groundProfile) ?? null) : null,
    elapsedTime,
    score,
    shieldCharges,
    level,
    nextLevelScore,
    timeScale: getGameSpeedScale(),
    weaponPowerTimeRemaining,
    health,
    maxHealth,
    events
  });

  const createEnemy = (): Enemy => {
    const hasMiniBoss = enemies.some((enemy) => enemy.kind === "miniBoss");
    const availableTurretMounts = getAvailableTurretMounts();
    const turretMount = pickTurretMount(availableTurretMounts);
    const canSpawnMiniBoss = stageElapsedTime >= miniBossSpawnGracePeriod && !hasMiniBoss;
    const canSpawnTurret = stageElapsedTime >= miniBossSpawnGracePeriod && turretMount !== null;
    const kind =
      canSpawnTurret && Math.random() < miniBossChance
        ? "turret"
        : canSpawnMiniBoss && Math.random() < miniBossChance
          ? "miniBoss"
          : Math.random() < sineGunnerChance
            ? "sineGunner"
            : "basic";
    const baseY = randomRange(bounds.bottom + 0.8, bounds.top - 0.8);
    const x = kind === "miniBoss" ? bounds.right - 0.42 : kind === "turret" ? bounds.right + 0.4 : bounds.right + 0.4;
    const y = kind === "turret" ? getTurretY(x, turretMount, groundPoints, ceilingPoints) : baseY;

    return {
      id: nextId++,
      age: 0,
      baseY,
      beamStart: null,
      beamChargeTimeRemaining: 0,
      beamHasHitPlayer: false,
      beamCooldownTimer: randomRange(bossBeamCooldownMin, bossBeamCooldownMax),
      beamTarget: null,
      beamTimeRemaining: 0,
      fireTimer:
        kind === "sineGunner"
          ? getSineGunnerFireInterval()
          : kind === "miniBoss"
            ? randomRange(miniBossFireMin, miniBossFireMax)
            : kind === "turret"
              ? turretBeamInterval
              : Number.POSITIVE_INFINITY,
      health: getEnemyHealth(kind),
      kind,
      phase: randomRange(0, Math.PI * 2),
      targetY: baseY,
      turretBeams: [],
      turretBurstShotsFired: 0,
      turretChargeTarget: null,
      turretChargeTimeRemaining: 0,
      turretIdleTimer: 0,
      turretMount: kind === "turret" ? turretMount : null,
      x,
      y
    };
  };

  const createBoss = (): Enemy => {
    const baseY = 0;

    return {
      id: nextId++,
      age: 0,
      baseY,
      beamStart: null,
      beamChargeTimeRemaining: 0,
      beamHasHitPlayer: false,
      beamCooldownTimer: randomRange(bossBeamCooldownMin, bossBeamCooldownMax),
      beamTarget: null,
      beamTimeRemaining: 0,
      fireTimer: getSineGunnerFireInterval(),
      health: bossHealth,
      kind: "boss",
      phase: randomRange(0, Math.PI * 2),
      targetY: randomBossTargetY(),
      turretBeams: [],
      turretBurstShotsFired: 0,
      turretChargeTarget: null,
      turretChargeTimeRemaining: 0,
      turretIdleTimer: 0,
      turretMount: null,
      x: bossX,
      y: baseY
    };
  };

  const createEnemyProjectile = (enemy: Enemy, origin: Vector2 = { x: enemy.x - 0.22, y: enemy.y }): EnemyProjectile => {
    const deltaX = player.x - origin.x;
    const deltaY = player.y - origin.y;
    const length = Math.hypot(deltaX, deltaY) || 1;

    return {
      id: nextId++,
      velocityX: (deltaX / length) * enemyProjectileSpeed,
      velocityY: (deltaY / length) * enemyProjectileSpeed,
      x: origin.x,
      y: origin.y
    };
  };

  const createPowerUp = (): PowerUp => {
    const roll = Math.random();

    return {
      id: nextId++,
      kind: roll < 0.34 ? "shield" : roll < 0.67 ? "health" : "weapon",
      x: bounds.right + 0.4,
      y: randomRange(bounds.bottom + 0.4, bounds.top - 0.4)
    };
  };

  const createPlayerProjectile = (angleDegrees: number): Projectile => {
    const radians = (angleDegrees * Math.PI) / 180;

    return {
      id: nextId++,
      velocityX: Math.cos(radians) * projectileSpeed,
      velocityY: Math.sin(radians) * projectileSpeed,
      x: player.x + 0.42,
      y: player.y
    };
  };

  const firePlayerWeapon = (events: SimulationEvent[]) => {
    const angles = weaponPowerTimeRemaining > 0 ? [-24, -12, 0, 12, 24] : [0];
    const firedPosition = { x: player.x + 0.42, y: player.y };

    for (const angle of angles) {
      projectiles.push(createPlayerProjectile(angle));
    }

    events.push({ type: "weaponFired", position: firedPosition });
  };

  const damagePlayer = (events: SimulationEvent[], damage: number) => {
    if (shieldCharges > 0) {
      shieldCharges -= 1;
      events.push({ type: "shieldBlockedHit", position: { ...player }, shieldCharges });
      return;
    }

    const previousHealth = health;
    health = Math.max(0, health - damage);
    events.push({ type: "playerHit", health, position: { ...player } });

    if (previousHealth > 0 && health === 0) {
      events.push({ type: "playerDestroyed", position: { ...player } });
    }
  };

  const getEnemyScore = (enemy: Enemy) => {
    if (enemy.kind === "boss") return bossScore;
    if (enemy.kind === "miniBoss") return miniBossScore;
    if (enemy.kind === "turret") return turretScore;
    return enemy.kind === "sineGunner" ? 5 : 1;
  };

  const getEnemyHealth = (kind: Enemy["kind"]) => {
    if (kind === "boss") return bossHealth;
    if (kind === "turret") return turretHealth;

    const baseHealth = kind === "miniBoss" ? miniBossHealth : 1;
    return Math.ceil(baseHealth * getEnemyHealthScale());
  };

  const getDifficultyScale = (factor: number) => 1 + getElapsedDifficultyProgress() * (maxTimeScale - 1) * factor * difficultyMultiplier;

  const getElapsedDifficultyProgress = () => clamp(stageElapsedTime / maxTimeScaleElapsedSeconds, 0, 1);

  const getEnemyFireScale = () => getDifficultyScale(enemyFireDifficultyFactor);

  const getEnemyHealthScale = () => getDifficultyScale(enemyHealthDifficultyFactor);

  const getGameSpeedScale = () => getDifficultyScale(gameSpeedDifficultyFactor);

  const getSpawnRateScale = () => getDifficultyScale(spawnRateDifficultyFactor);

  const processLevelUps = (events: SimulationEvent[]) => {
    while (score >= nextLevelScore) {
      level += 1;
      maxHealth += levelHealthBonus;
      health = maxHealth;
      nextLevelScore += getNextLevelScoreCost(score);
      events.push({ type: "levelUp", health, level, maxHealth, nextLevelScore });
    }
  };

  const getSineGunnerFireInterval = () => randomRange(sineGunnerFireMin, sineGunnerFireMax) / getEnemyFireScale();

  const getAvailableTurretMounts = (): TurretMount[] => {
    if (!turretsEnabled) return [];

    const mounts: TurretMount[] = [];
    const hasFloorTurret = enemies.some((enemy) => enemy.kind === "turret" && enemy.turretMount === "floor");
    const hasCeilingTurret = enemies.some((enemy) => enemy.kind === "turret" && enemy.turretMount === "ceiling");

    if (groundPoints && !hasFloorTurret) {
      mounts.push("floor");
    }

    if (ceilingPoints && !hasCeilingTurret) {
      mounts.push("ceiling");
    }

    return mounts;
  };

  const pickTurretMount = (mounts: TurretMount[]): TurretMount | null => {
    if (mounts.length === 0) return null;
    return mounts[Math.floor(Math.random() * mounts.length)] ?? null;
  };

  const step = (delta: number, actions: ActionState): SimulationFrame => {
    if (health <= 0 || stageComplete) {
      return updateFrame();
    }

    const events: SimulationEvent[] = [];
    elapsedTime += delta;
    stageElapsedTime += delta;
    const gameSpeedScale = getGameSpeedScale();
    const spawnRateScale = getSpawnRateScale();
    const enemyFireScale = getEnemyFireScale();
    const horizontal = Number(actions.right) - Number(actions.left);
    const vertical = Number(actions.up) - Number(actions.down);
    const length = Math.hypot(horizontal, vertical) || 1;

    player.x = clamp(player.x + (horizontal / length) * playerSpeed * delta, bounds.left, bounds.right);
    player.y = clamp(player.y + (vertical / length) * playerSpeed * delta, bounds.bottom, bounds.top);
    updateTerrain(gameSpeedScale, delta);
    groundHitTimer = Math.max(0, groundHitTimer - delta);
    resolveTerrainCollision(events);

    fireTimer -= delta;
    weaponPowerTimeRemaining = Math.max(0, weaponPowerTimeRemaining - delta);
    spawnTimer -= delta * spawnRateScale;
    powerUpSpawnTimer -= delta * gameSpeedScale;

    for (const powerUp of powerUps) {
      powerUp.x -= enemySpeed * gameSpeedScale * delta;
    }

    resolvePowerUpCollisions(events);

    if (actions.fire && fireTimer <= 0) {
      fireTimer = fireCooldown;
      firePlayerWeapon(events);
    }

    if (!bossPhaseStarted && stageElapsedTime >= bossSpawnTime) {
      bossPhaseStarted = true;
      removeWhere(enemies, (enemy) => enemy.kind !== "boss");
      enemyProjectiles.length = 0;
      spawnTimer = Number.POSITIVE_INFINITY;
      const boss = createBoss();
      enemies.push(boss);
      events.push({ type: "bossSpawned", position: { x: boss.x, y: boss.y } });
    }

    if (!bossPhaseStarted && spawnTimer <= 0) {
      spawnTimer = spawnInterval;
      enemies.push(createEnemy());
    }

    if (powerUpSpawnTimer <= 0) {
      powerUpSpawnTimer = randomRange(powerUpSpawnMin, powerUpSpawnMax);
      powerUps.push(createPowerUp());
    }

    for (const projectile of projectiles) {
      projectile.x += projectile.velocityX * delta;
      projectile.y += projectile.velocityY * delta;
    }

    for (const enemy of enemies) {
      enemy.age += enemy.kind === "miniBoss" || enemy.kind === "boss" || enemy.kind === "turret" ? delta : gameSpeedScale * delta;

      if (enemy.kind !== "miniBoss" && enemy.kind !== "boss" && enemy.kind !== "turret") {
        enemy.x -= enemySpeed * gameSpeedScale * delta;
      }

      if (enemy.kind === "sineGunner") {
        enemy.y = clamp(
          enemy.baseY + Math.sin(enemy.age * sineFrequency + enemy.phase) * sineAmplitude,
          bounds.bottom + 0.35,
          bounds.top - 0.35
        );
        enemy.fireTimer -= delta;

        if (enemy.fireTimer <= 0) {
          enemy.fireTimer = getSineGunnerFireInterval();
          enemyProjectiles.push(createEnemyProjectile(enemy));
        }
      } else if (enemy.kind === "miniBoss") {
        enemy.y = clamp(
          enemy.baseY + Math.sin(enemy.age * miniBossDriftFrequency + enemy.phase) * miniBossDriftAmplitude,
          bounds.bottom + 0.55,
          bounds.top - 0.55
        );

        if (enemy.beamChargeTimeRemaining > 0) {
          enemy.beamChargeTimeRemaining = Math.max(0, enemy.beamChargeTimeRemaining - delta);

          if (enemy.beamChargeTimeRemaining <= 0) {
            enemy.beamTimeRemaining = randomRange(miniBossBeamDurationMin, miniBossBeamDurationMax);
            enemy.beamHasHitPlayer = false;
          }
        } else if (enemy.beamTimeRemaining > 0) {
          enemy.beamTimeRemaining = Math.max(0, enemy.beamTimeRemaining - delta);

          if (!enemy.beamHasHitPlayer && Math.abs(player.y - enemy.y) <= miniBossBeamHalfHeight) {
            enemy.beamHasHitPlayer = true;
            damagePlayer(events, enemyBeamDamage);
          }

          if (enemy.beamTimeRemaining <= 0) {
            enemy.fireTimer = randomRange(miniBossFireMin, miniBossFireMax);
            enemy.beamHasHitPlayer = false;
          }
        } else {
          enemy.fireTimer -= delta * enemyFireScale;

          if (enemy.fireTimer <= 0) {
            enemy.beamChargeTimeRemaining = miniBossBeamChargeDuration;
            enemy.beamHasHitPlayer = false;
          }
        }
      } else if (enemy.kind === "boss") {
        updateBoss(enemy, delta, events);
      } else if (enemy.kind === "turret") {
        updateTurret(enemy, gameSpeedScale, delta, events);
      }
    }

    for (const projectile of enemyProjectiles) {
      projectile.x += projectile.velocityX * gameSpeedScale * delta;
      projectile.y += projectile.velocityY * gameSpeedScale * delta;
    }

    resolveCollisions(events);
    pruneOffscreen();

    return updateFrame(events);
  };

  const resolvePowerUpCollisions = (events: SimulationEvent[]) => {
    for (let powerUpIndex = powerUps.length - 1; powerUpIndex >= 0; powerUpIndex -= 1) {
      const powerUp = powerUps[powerUpIndex];

      if (distanceSquared(powerUp, player) < playerPowerUpHitRadius * playerPowerUpHitRadius) {
        powerUps.splice(powerUpIndex, 1);

        if (powerUp.kind === "shield") {
          shieldCharges += 1;
        } else if (powerUp.kind === "health") {
          health = Math.min(maxHealth, health + enemyCollisionDamage);
        } else {
          weaponPowerTimeRemaining = weaponPowerDuration;
          fireTimer = 0;
        }

        events.push({ type: "powerUpCollected", health, kind: powerUp.kind, position: { ...powerUp }, shieldCharges });
      }
    }
  };

  const resolveTerrainCollision = (events: SimulationEvent[]) => {
    let hitTerrain = false;

    if (groundPoints) {
      const groundHeight = getTerrainHeightAtX(player.x, groundPoints, bounds.bottom);
      const minPlayerY = groundHeight + playerGroundHitRadius;

      if (player.y < minPlayerY) {
        player.y = minPlayerY;
        hitTerrain = true;
      }
    }

    if (ceilingPoints) {
      const ceilingHeight = getTerrainHeightAtX(player.x, ceilingPoints, bounds.top);
      const maxPlayerY = ceilingHeight - playerGroundHitRadius;

      if (player.y > maxPlayerY) {
        player.y = maxPlayerY;
        hitTerrain = true;
      }
    }

    if (!hitTerrain || groundHitTimer > 0) return;

    groundHitTimer = groundHitCooldown;
    damagePlayer(events, Math.ceil(maxHealth / 3));
  };

  const updateTerrain = (gameSpeedScale: number, delta: number) => {
    const scrollAmount = enemySpeed * groundScrollSpeedMultiplier * gameSpeedScale * delta;

    updateTerrainProfile(groundProfile, scrollAmount);
    updateTerrainProfile(ceilingProfile, scrollAmount);
  };

  const resolveCollisions = (events: SimulationEvent[]) => {
    for (let projectileIndex = enemyProjectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = enemyProjectiles[projectileIndex];

      if (distanceSquared(projectile, player) < playerEnemyProjectileHitRadius * playerEnemyProjectileHitRadius) {
        enemyProjectiles.splice(projectileIndex, 1);
        damagePlayer(events, enemyProjectileDamage);
      }
    }

    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = enemies[enemyIndex];

      if (enemy.kind === "boss" && distanceSquared(enemy, player) < bossBodyHitRadius * bossBodyHitRadius) {
        damagePlayer(events, enemyCollisionDamage);
        continue;
      }

      if (
        enemy.kind !== "miniBoss" &&
        enemy.kind !== "boss" &&
        enemy.kind !== "turret" &&
        distanceSquared(enemy, player) < playerEnemyHitRadius * playerEnemyHitRadius
      ) {
        enemies.splice(enemyIndex, 1);
        damagePlayer(events, enemyCollisionDamage);
        continue;
      }

      for (let projectileIndex = projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
        const projectile = projectiles[projectileIndex];

        const hitRadius =
          enemy.kind === "boss" ? bossProjectileHitRadius : enemy.kind === "miniBoss" ? miniBossProjectileHitRadius : enemyProjectileHitRadius;

        if (distanceSquared(enemy, projectile) < hitRadius * hitRadius) {
          const destroyedPosition = { ...enemy };
          projectiles.splice(projectileIndex, 1);

          if (enemy.kind === "miniBoss" || enemy.kind === "boss" || enemy.kind === "turret") {
            enemy.health -= 1;

            if (enemy.health > 0) {
              continue;
            }
          }

          enemies.splice(enemyIndex, 1);
          score += getEnemyScore(enemy);
          processLevelUps(events);
          events.push({ type: "enemyDestroyed", position: destroyedPosition });

          if (enemy.kind === "boss") {
            stageComplete = true;
            events.push({ type: "stageComplete", position: destroyedPosition, score });
          }

          break;
        }
      }
    }
  };

  const pruneOffscreen = () => {
    removeWhere(
      projectiles,
      (projectile) =>
        projectile.x > bounds.right + 0.8 ||
        projectile.x < bounds.left - 0.8 ||
        projectile.y > bounds.top + 0.8 ||
        projectile.y < bounds.bottom - 0.8
    );
    removeWhere(enemies, (enemy) => enemy.kind !== "miniBoss" && enemy.x < bounds.left - 0.8);
    removeWhere(powerUps, (powerUp) => powerUp.x < bounds.left - 0.8);
    removeWhere(
      enemyProjectiles,
      (projectile) =>
        projectile.x < bounds.left - 0.8 ||
        projectile.x > bounds.right + 0.8 ||
        projectile.y < bounds.bottom - 0.8 ||
        projectile.y > bounds.top + 0.8
    );
  };

  return {
    getFrame: () => updateFrame(),
    getSnapshot,
    step
  };

  function getEnemyBeamSnapshots() {
    const beams: EnemyBeam[] = [];
    updateEnemyBeams(beams);
    return beams.map((beam) =>
      beam.kind === "horizontal"
        ? { ...beam }
        : {
            end: { ...beam.end },
            id: beam.id,
            kind: "aimed" as const,
            start: { ...beam.start }
          }
    );
  }

  function updateEnemyBeams(beams: EnemyBeam[]) {
    beams.length = 0;

    for (const enemy of enemies) {
      if (enemy.kind === "miniBoss" && enemy.beamTimeRemaining > 0) {
        beams.push(upsertHorizontalBeam(enemy.id, enemy.y));
        continue;
      }

      if (enemy.kind === "turret" && enemy.turretBeams.length > 0) {
        for (const beam of enemy.turretBeams) {
          const start = getTurretBeamStart(enemy);
          beams.push(upsertAimedBeam(beam.id, start, getBeamEnd(start, beam.target)));
        }
        continue;
      }

      if (enemy.kind === "boss" && enemy.beamTimeRemaining > 0 && enemy.beamStart && enemy.beamTarget) {
        beams.push(upsertAimedBeam(enemy.id, enemy.beamStart, getBeamEnd(enemy.beamStart, enemy.beamTarget)));
      }
    }
  }

  function upsertHorizontalBeam(id: number, y: number): EnemyBeam {
    const cached = enemyBeamCache.get(id);

    if (cached?.kind === "horizontal") {
      cached.y = y;
      return cached;
    }

    const beam: EnemyBeam = { id, kind: "horizontal", y };
    enemyBeamCache.set(id, beam);
    return beam;
  }

  function upsertAimedBeam(id: number, start: Vector2, end: Vector2): EnemyBeam {
    const cached = enemyBeamCache.get(id);

    if (cached?.kind === "aimed") {
      cached.start = start;
      cached.end = end;
      return cached;
    }

    const beam: EnemyBeam = { end, id, kind: "aimed", start };
    enemyBeamCache.set(id, beam);
    return beam;
  }

  function updateTurret(enemy: Enemy, gameSpeedScale: number, delta: number, events: SimulationEvent[]) {
    enemy.x -= enemySpeed * groundScrollSpeedMultiplier * gameSpeedScale * delta;
    enemy.y = getTurretY(enemy.x, enemy.turretMount, groundPoints, ceilingPoints);

    for (let beamIndex = enemy.turretBeams.length - 1; beamIndex >= 0; beamIndex -= 1) {
      const beam = enemy.turretBeams[beamIndex];
      beam.timeRemaining = Math.max(0, beam.timeRemaining - delta);

      if (!beam.hasHitPlayer && isPointNearExtendedBeam(player, getTurretBeamStart(enemy), beam.target, turretBeamHalfWidth)) {
        beam.hasHitPlayer = true;
        damagePlayer(events, turretBeamDamage);
      }

      if (beam.timeRemaining <= 0) {
        enemy.turretBeams.splice(beamIndex, 1);
      }
    }

    if (enemy.turretIdleTimer > 0) {
      enemy.turretChargeTimeRemaining = 0;
      enemy.turretChargeTarget = null;
      enemy.turretIdleTimer = Math.max(0, enemy.turretIdleTimer - delta);

      if (enemy.turretIdleTimer <= 0) {
        enemy.turretBurstShotsFired = 0;
        enemy.fireTimer = turretBeamInterval;
      }

      return;
    }

    if (enemy.turretBurstShotsFired >= turretBurstSize) {
      enemy.turretChargeTimeRemaining = 0;
      enemy.turretChargeTarget = null;
      if (enemy.turretBeams.length === 0) {
        enemy.turretIdleTimer = turretIdleDuration;
      }

      return;
    }

    enemy.fireTimer -= delta;
    const isCharging = enemy.fireTimer > 0 && enemy.fireTimer <= turretChargeDuration;
    enemy.turretChargeTimeRemaining = isCharging ? enemy.fireTimer : 0;

    if (isCharging && !enemy.turretChargeTarget) {
      enemy.turretChargeTarget = { ...player };
    } else if (!isCharging && enemy.fireTimer > turretChargeDuration) {
      enemy.turretChargeTarget = null;
    }

    if (enemy.fireTimer <= 0) {
      const target = enemy.turretChargeTarget ?? player;
      enemy.fireTimer = turretBeamInterval;
      enemy.turretChargeTimeRemaining = 0;
      enemy.turretChargeTarget = null;
      enemy.turretBurstShotsFired += 1;
      enemy.turretBeams.push({
        hasHitPlayer: false,
        id: nextId++,
        start: getTurretBeamStart(enemy),
        target: { ...target },
        timeRemaining: turretBeamDuration
      });
    }
  }

  function updateBoss(enemy: Enemy, delta: number, events: SimulationEvent[]) {
    enemy.x = bossX;
    enemy.y = moveToward(enemy.y, enemy.targetY, bossMoveSpeed * delta);

    if (Math.abs(enemy.y - enemy.targetY) < 0.04) {
      enemy.targetY = randomBossTargetY();
    }

    enemy.fireTimer -= delta;
    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = getSineGunnerFireInterval();
      enemyProjectiles.push(createEnemyProjectile(enemy, { x: enemy.x - 0.18, y: enemy.y + bossTopGunYOffset }));
    }

    if (enemy.beamChargeTimeRemaining > 0) {
      enemy.beamChargeTimeRemaining = Math.max(0, enemy.beamChargeTimeRemaining - delta);

      if (enemy.beamChargeTimeRemaining <= 0) {
        enemy.beamStart = getBossBeamStart(enemy);
        enemy.beamTarget = { ...player };
        enemy.beamTimeRemaining = bossBeamDuration;
        enemy.beamHasHitPlayer = false;
      }
    } else if (enemy.beamTimeRemaining > 0) {
      enemy.beamTimeRemaining = Math.max(0, enemy.beamTimeRemaining - delta);

      if (
        !enemy.beamHasHitPlayer &&
        enemy.beamStart &&
        enemy.beamTarget &&
        isPointNearExtendedBeam(player, enemy.beamStart, enemy.beamTarget, bossBeamHalfWidth)
      ) {
        enemy.beamHasHitPlayer = true;
        damagePlayer(events, enemyBeamDamage);
      }

      if (enemy.beamTimeRemaining <= 0) {
        enemy.beamCooldownTimer = randomRange(bossBeamCooldownMin, bossBeamCooldownMax);
        enemy.beamStart = null;
        enemy.beamTarget = null;
        enemy.beamHasHitPlayer = false;
      }
    } else {
      enemy.beamCooldownTimer -= delta;
    }

    if (enemy.beamCooldownTimer <= 0 && enemy.beamChargeTimeRemaining <= 0 && enemy.beamTimeRemaining <= 0) {
      enemy.beamChargeTimeRemaining = bossBeamChargeDuration;
      enemy.beamHasHitPlayer = false;
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function distanceSquared(a: Vector2, b: Vector2) {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;

  return deltaX * deltaX + deltaY * deltaY;
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function cloneGroundProfile(profile: GroundProfile | undefined): GroundProfile | undefined {
  if (!profile) return undefined;

  return {
    maxStep: profile.maxStep,
    maxY: profile.maxY,
    minY: profile.minY,
    points: profile.points.map((point) => ({ ...point }))
  };
}

function normalizeInitialTerrainProfile(profile: GroundProfile | undefined) {
  if (!profile || profile.points.length === 0) return;

  while (profile.points[0].x > terrainLeftEdge) {
    const firstPoint = profile.points[0];
    profile.points.unshift({
      x: firstPoint.x - groundPointSpacing,
      y: getNextTerrainHeight(firstPoint.y, profile)
    });
  }

  extendTerrainRight(profile);
}

function updateTerrainProfile(profile: GroundProfile | undefined, scrollAmount: number) {
  if (!profile) return;

  for (const point of profile.points) {
    point.x -= scrollAmount;
  }

  while (profile.points.length > 2 && profile.points[1].x < terrainLeftEdge) {
    profile.points.shift();
  }

  extendTerrainRight(profile);
}

function extendTerrainRight(profile: GroundProfile) {
  while (profile.points[profile.points.length - 1].x < terrainRightEdge) {
    const previousPoint = profile.points[profile.points.length - 1];
    profile.points.push({
      x: previousPoint.x + groundPointSpacing,
      y: getNextTerrainHeight(previousPoint.y, profile)
    });
  }
}

function getTerrainHeightAtX(x: number, points: Vector2[], fallback: number) {
  if (points.length === 0) return fallback;
  if (x <= points[0].x) return points[0].y;

  for (let index = 1; index < points.length; index += 1) {
    const end = points[index];
    const start = points[index - 1];

    if (x <= end.x) {
      const progress = (x - start.x) / (end.x - start.x || 1);
      return start.y + (end.y - start.y) * progress;
    }
  }

  return points[points.length - 1].y;
}

function getNextTerrainHeight(previousHeight: number, profile: GroundProfile) {
  return clamp(
    previousHeight + randomRange(-(profile.maxStep ?? groundHeightMaxStep), profile.maxStep ?? groundHeightMaxStep),
    profile.minY ?? groundHeightMin,
    profile.maxY ?? groundHeightMax
  );
}

function randomBossTargetY() {
  return randomRange(bounds.bottom + 0.8, bounds.top - 0.8);
}

function getTurretY(
  x: number,
  mount: TurretMount | null,
  groundPoints: Vector2[] | undefined,
  ceilingPoints: Vector2[] | undefined
) {
  if (mount === "ceiling") {
    return getTerrainHeightAtX(x, ceilingPoints ?? [], bounds.top) - turretYOffset;
  }

  return getTerrainHeightAtX(x, groundPoints ?? [], bounds.bottom) + turretYOffset;
}

function getTurretBeamStart(enemy: Enemy): Vector2 {
  return { x: enemy.x - 0.43, y: enemy.y + getTurretVerticalSign(enemy) * 0.25 };
}

function getBossBeamStart(enemy: Enemy): Vector2 {
  return { x: enemy.x + bossFrontGunOffsetX, y: enemy.y };
}

function getTurretVerticalSign(enemy: Enemy) {
  return enemy.turretMount === "ceiling" ? -1 : 1;
}

function getBeamEnd(start: Vector2, target: Vector2): Vector2 {
  const deltaX = target.x - start.x;
  const deltaY = target.y - start.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const extension = 9;

  return {
    x: start.x + (deltaX / length) * extension,
    y: start.y + (deltaY / length) * extension
  };
}

function isPointNearExtendedBeam(point: Vector2, start: Vector2, target: Vector2, maxDistance: number) {
  const targetDeltaX = target.x - start.x;
  const targetDeltaY = target.y - start.y;
  const targetLength = Math.hypot(targetDeltaX, targetDeltaY) || 1;
  const extension = 9;
  const segmentX = (targetDeltaX / targetLength) * extension;
  const segmentY = (targetDeltaY / targetLength) * extension;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return distanceSquared(point, start) <= maxDistance * maxDistance;
  }

  const t = clamp(((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared, 0, 1);
  const closestX = start.x + segmentX * t;
  const closestY = start.y + segmentY * t;
  const deltaX = point.x - closestX;
  const deltaY = point.y - closestY;

  return deltaX * deltaX + deltaY * deltaY <= maxDistance * maxDistance;
}

function moveToward(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function getNextLevelScoreCost(totalScore: number) {
  return Math.ceil(baseLevelScoreCost + totalScore * totalScoreLevelCostMultiplier);
}

function removeWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
}
