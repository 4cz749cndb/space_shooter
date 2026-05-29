import type { ActionState, Enemy, Projectile, SimulationEvent, Snapshot, Vector2 } from "./types";

const bounds = {
  left: -3.6,
  right: 3.6,
  bottom: -3,
  top: 3
};

const playerSpeed = 4.2;
const projectileSpeed = 6.8;
const enemySpeed = 1.15;
const fireCooldown = 0.16;
const spawnInterval = 0.85;
const enemyProjectileHitRadius = 0.29;
const playerEnemyHitRadius = 0.38;
const maxHealth = 5;

export function createSpaceShooterSimulation() {
  let nextId = 1;
  let score = 0;
  let wave = 1;
  let health = maxHealth;
  let fireTimer = 0;
  let spawnTimer = 0;
  const player: Vector2 = { x: -2.8, y: 0 };
  const projectiles: Projectile[] = [];
  const enemies: Enemy[] = [];

  const getSnapshot = (events: SimulationEvent[] = []): Snapshot => ({
    player: { ...player },
    projectiles: projectiles.map((projectile) => ({ ...projectile })),
    enemies: enemies.map((enemy) => ({ ...enemy })),
    score,
    wave,
    health,
    maxHealth,
    events
  });

  const step = (delta: number, actions: ActionState): Snapshot => {
    if (health <= 0) {
      return getSnapshot();
    }

    const events: SimulationEvent[] = [];
    const horizontal = Number(actions.right) - Number(actions.left);
    const vertical = Number(actions.up) - Number(actions.down);
    const length = Math.hypot(horizontal, vertical) || 1;

    player.x = clamp(player.x + (horizontal / length) * playerSpeed * delta, bounds.left, bounds.right);
    player.y = clamp(player.y + (vertical / length) * playerSpeed * delta, bounds.bottom, bounds.top);

    fireTimer -= delta;
    spawnTimer -= delta;

    if (actions.fire && fireTimer <= 0) {
      fireTimer = fireCooldown;
      const projectile = { id: nextId++, x: player.x + 0.42, y: player.y };
      projectiles.push(projectile);
      events.push({ type: "weaponFired", position: { x: projectile.x, y: projectile.y } });
    }

    if (spawnTimer <= 0) {
      spawnTimer = Math.max(0.32, spawnInterval - wave * 0.04);
      enemies.push({ id: nextId++, x: bounds.right + 0.4, y: randomRange(bounds.bottom + 0.2, bounds.top - 0.2) });
    }

    for (const projectile of projectiles) {
      projectile.x += projectileSpeed * delta;
    }

    for (const enemy of enemies) {
      enemy.x -= (enemySpeed + wave * 0.08) * delta;
    }

    resolveCollisions(events);
    pruneOffscreen();
    wave = Math.floor(score / 12) + 1;

    return getSnapshot(events);
  };

  const resolveCollisions = (events: SimulationEvent[]) => {
    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
      const enemy = enemies[enemyIndex];

      if (distance(enemy, player) < playerEnemyHitRadius) {
        enemies.splice(enemyIndex, 1);
        const previousHealth = health;
        health = Math.max(0, health - 1);
        events.push({ type: "playerHit", health, position: { ...player } });

        if (previousHealth > 0 && health === 0) {
          events.push({ type: "playerDestroyed", position: { ...player } });
        }

        continue;
      }

      for (let projectileIndex = projectiles.length - 1; projectileIndex >= 0; projectileIndex -= 1) {
        const projectile = projectiles[projectileIndex];

        if (distance(enemy, projectile) < enemyProjectileHitRadius) {
          const destroyedPosition = { ...enemy };
          enemies.splice(enemyIndex, 1);
          projectiles.splice(projectileIndex, 1);
          score += 1;
          events.push({ type: "enemyDestroyed", position: destroyedPosition });
          break;
        }
      }
    }
  };

  const pruneOffscreen = () => {
    removeWhere(projectiles, (projectile) => projectile.x > bounds.right + 0.8);
    removeWhere(enemies, (enemy) => enemy.x < bounds.left - 0.8);
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

function removeWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
}
