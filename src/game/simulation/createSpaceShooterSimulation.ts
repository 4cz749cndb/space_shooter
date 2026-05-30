import type { ActionState, Enemy, EnemyProjectile, PowerUp, Projectile, SimulationEvent, Snapshot, Vector2 } from "./types";

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
const powerUpSpawnMin = 12;
const powerUpSpawnMax = 20;
const weaponPowerDuration = 15;
const sineGunnerChance = 0.33;
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
const maxTimeScale = 2;
const maxTimeScaleElapsedSeconds = 240;
const initialMaxHealth = 100;
const firstLevelScore = 100;
const baseLevelScoreCost = 100;
const totalScoreLevelCostMultiplier = 0.1;
const levelHealthBonus = 20;
const enemyCollisionDamage = 20;
const enemyProjectileDamage = 10;
const enemyBeamDamage = 10;

export function createSpaceShooterSimulation() {
  let nextId = 1;
  let score = 0;
  let wave = 1;
  let level = 1;
  let nextLevelScore = firstLevelScore;
  let maxHealth = initialMaxHealth;
  let health = maxHealth;
  let shieldCharges = 0;
  let weaponPowerTimeRemaining = 0;
  let elapsedTime = 0;
  let fireTimer = 0;
  let spawnTimer = 0;
  let powerUpSpawnTimer = randomRange(powerUpSpawnMin, powerUpSpawnMax);
  const player: Vector2 = { x: -2.8, y: 0 };
  const projectiles: Projectile[] = [];
  const enemies: Enemy[] = [];
  const enemyProjectiles: EnemyProjectile[] = [];
  const powerUps: PowerUp[] = [];

  const getSnapshot = (events: SimulationEvent[] = []): Snapshot => ({
    player: { ...player },
    projectiles: projectiles.map((projectile) => ({ ...projectile })),
    enemies: enemies.map((enemy) => ({ ...enemy })),
    enemyProjectiles: enemyProjectiles.map((projectile) => ({ ...projectile })),
    enemyBeams: enemies
      .filter((enemy) => enemy.kind === "miniBoss" && enemy.beamTimeRemaining > 0)
      .map((enemy) => ({ id: enemy.id, y: enemy.y })),
    powerUps: powerUps.map((powerUp) => ({ ...powerUp })),
    elapsedTime,
    score,
    shieldCharges,
    level,
    nextLevelScore,
    timeScale: getTimeScale(),
    wave,
    weaponPowerTimeRemaining,
    health,
    maxHealth,
    events
  });

  const createEnemy = (): Enemy => {
    const hasMiniBoss = enemies.some((enemy) => enemy.kind === "miniBoss");
    const canSpawnMiniBoss = elapsedTime >= miniBossSpawnGracePeriod && !hasMiniBoss;
    const kind = canSpawnMiniBoss && Math.random() < miniBossChance ? "miniBoss" : Math.random() < sineGunnerChance ? "sineGunner" : "basic";
    const baseY = randomRange(bounds.bottom + 0.8, bounds.top - 0.8);

    return {
      id: nextId++,
      age: 0,
      baseY,
      beamChargeTimeRemaining: 0,
      beamHasHitPlayer: false,
      beamTimeRemaining: 0,
      fireTimer:
        kind === "sineGunner"
          ? randomRange(0.5, 3)
          : kind === "miniBoss"
            ? randomRange(miniBossFireMin, miniBossFireMax)
            : Number.POSITIVE_INFINITY,
      health: getEnemyHealth(kind),
      kind,
      phase: randomRange(0, Math.PI * 2),
      x: kind === "miniBoss" ? bounds.right - 0.42 : bounds.right + 0.4,
      y: baseY
    };
  };

  const createEnemyProjectile = (enemy: Enemy): EnemyProjectile => {
    const deltaX = player.x - enemy.x;
    const deltaY = player.y - enemy.y;
    const length = Math.hypot(deltaX, deltaY) || 1;

    return {
      id: nextId++,
      velocityX: (deltaX / length) * enemyProjectileSpeed,
      velocityY: (deltaY / length) * enemyProjectileSpeed,
      x: enemy.x - 0.22,
      y: enemy.y
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
    if (enemy.kind === "miniBoss") return miniBossScore;
    return enemy.kind === "sineGunner" ? 5 : 1;
  };

  const getEnemyHealth = (kind: Enemy["kind"]) => {
    const baseHealth = kind === "miniBoss" ? miniBossHealth : 1;
    return Math.ceil(baseHealth * getTimeScale());
  };

  const getTimeScale = () => clamp(1 + elapsedTime / maxTimeScaleElapsedSeconds, 1, maxTimeScale);

  const processLevelUps = (events: SimulationEvent[]) => {
    while (score >= nextLevelScore) {
      level += 1;
      maxHealth += levelHealthBonus;
      health = maxHealth;
      nextLevelScore += getNextLevelScoreCost(score);
      events.push({ type: "levelUp", health, level, maxHealth, nextLevelScore });
    }
  };

  const step = (delta: number, actions: ActionState): Snapshot => {
    if (health <= 0) {
      return getSnapshot();
    }

    const events: SimulationEvent[] = [];
    elapsedTime += delta;
    const timeScale = getTimeScale();
    const horizontal = Number(actions.right) - Number(actions.left);
    const vertical = Number(actions.up) - Number(actions.down);
    const length = Math.hypot(horizontal, vertical) || 1;

    player.x = clamp(player.x + (horizontal / length) * playerSpeed * delta, bounds.left, bounds.right);
    player.y = clamp(player.y + (vertical / length) * playerSpeed * delta, bounds.bottom, bounds.top);

    fireTimer -= delta;
    weaponPowerTimeRemaining = Math.max(0, weaponPowerTimeRemaining - delta);
    spawnTimer -= delta * timeScale;
    powerUpSpawnTimer -= delta * timeScale;

    if (actions.fire && fireTimer <= 0) {
      fireTimer = fireCooldown;
      firePlayerWeapon(events);
    }

    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.32, spawnInterval - wave * 0.04);
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
      enemy.age += enemy.kind === "miniBoss" ? delta : timeScale * delta;

      if (enemy.kind !== "miniBoss") {
        enemy.x -= (enemySpeed + wave * 0.08) * timeScale * delta;
      }

      if (enemy.kind === "sineGunner") {
        enemy.y = clamp(
          enemy.baseY + Math.sin(enemy.age * sineFrequency + enemy.phase) * sineAmplitude,
          bounds.bottom + 0.35,
          bounds.top - 0.35
        );
        enemy.fireTimer -= timeScale * delta;

        if (enemy.fireTimer <= 0) {
          enemy.fireTimer = randomRange(0.5, 3);
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
          enemy.fireTimer -= delta;

          if (enemy.fireTimer <= 0) {
            enemy.beamChargeTimeRemaining = miniBossBeamChargeDuration;
            enemy.beamHasHitPlayer = false;
          }
        }
      }
    }

    for (const projectile of enemyProjectiles) {
      projectile.x += projectile.velocityX * timeScale * delta;
      projectile.y += projectile.velocityY * timeScale * delta;
    }

    for (const powerUp of powerUps) {
      powerUp.x -= (enemySpeed + wave * 0.08) * timeScale * delta;
    }

    resolveCollisions(events);
    pruneOffscreen();
    wave = Math.floor(score / 12) + 1;

    return getSnapshot(events);
  };

  const resolveCollisions = (events: SimulationEvent[]) => {
    for (let powerUpIndex = powerUps.length - 1; powerUpIndex >= 0; powerUpIndex -= 1) {
      const powerUp = powerUps[powerUpIndex];

      if (distance(powerUp, player) < playerPowerUpHitRadius) {
        powerUps.splice(powerUpIndex, 1);

        if (powerUp.kind === "shield") {
          shieldCharges += 1;
        } else if (powerUp.kind === "health") {
          health = Math.min(maxHealth, health + enemyCollisionDamage);
        } else {
          weaponPowerTimeRemaining = weaponPowerDuration;
        }

        events.push({ type: "powerUpCollected", health, kind: powerUp.kind, position: { ...powerUp }, shieldCharges });
      }
    }

    for (let projectileIndex = enemyProjectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
      const projectile = enemyProjectiles[projectileIndex];

      if (distance(projectile, player) < playerEnemyProjectileHitRadius) {
        enemyProjectiles.splice(projectileIndex, 1);
        damagePlayer(events, enemyProjectileDamage);
      }
    }

    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = enemies[enemyIndex];

      if (enemy.kind !== "miniBoss" && distance(enemy, player) < playerEnemyHitRadius) {
        enemies.splice(enemyIndex, 1);
        damagePlayer(events, enemyCollisionDamage);
        continue;
      }

      for (let projectileIndex = projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
        const projectile = projectiles[projectileIndex];

        const hitRadius = enemy.kind === "miniBoss" ? miniBossProjectileHitRadius : enemyProjectileHitRadius;

        if (distance(enemy, projectile) < hitRadius) {
          const destroyedPosition = { ...enemy };
          projectiles.splice(projectileIndex, 1);

          if (enemy.kind === "miniBoss") {
            enemy.health -= 1;

            if (enemy.health > 0) {
              continue;
            }
          }

          enemies.splice(enemyIndex, 1);
          score += getEnemyScore(enemy);
          processLevelUps(events);
          events.push({ type: "enemyDestroyed", position: destroyedPosition });
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
    getSnapshot,
    step
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function distance(a: Vector2, b: Vector2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
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
