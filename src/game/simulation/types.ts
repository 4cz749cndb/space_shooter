export type ActionState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
};

export type Vector2 = {
  x: number;
  y: number;
};

export type Projectile = Vector2 & {
  id: number;
  velocityX: number;
  velocityY: number;
};

export type EnemyKind = "basic" | "sineGunner" | "miniBoss";

export type Enemy = Vector2 & {
  id: number;
  age: number;
  baseY: number;
  beamChargeTimeRemaining: number;
  beamHasHitPlayer: boolean;
  beamTimeRemaining: number;
  fireTimer: number;
  health: number;
  kind: EnemyKind;
  phase: number;
};

export type EnemyBeam = {
  id: number;
  y: number;
};

export type EnemyProjectile = Vector2 & {
  id: number;
  velocityX: number;
  velocityY: number;
};

export type PowerUpKind = "shield" | "health" | "weapon";

export type PowerUp = Vector2 & {
  id: number;
  kind: PowerUpKind;
};

export type SimulationEvent =
  | {
      type: "weaponFired";
      position: Vector2;
    }
  | {
      type: "enemyDestroyed";
      position: Vector2;
    }
  | {
      type: "playerHit";
      health: number;
      position: Vector2;
    }
  | {
      type: "playerDestroyed";
      position: Vector2;
    }
  | {
      type: "powerUpCollected";
      health: number;
      kind: PowerUpKind;
      position: Vector2;
      shieldCharges: number;
    }
  | {
      type: "shieldBlockedHit";
      position: Vector2;
      shieldCharges: number;
    }
  | {
      type: "levelUp";
      health: number;
      level: number;
      maxHealth: number;
      nextLevelScore: number;
    };

export type Snapshot = {
  player: Vector2;
  projectiles: Projectile[];
  enemies: Enemy[];
  enemyProjectiles: EnemyProjectile[];
  enemyBeams: EnemyBeam[];
  powerUps: PowerUp[];
  elapsedTime: number;
  score: number;
  shieldCharges: number;
  level: number;
  nextLevelScore: number;
  timeScale: number;
  wave: number;
  weaponPowerTimeRemaining: number;
  health: number;
  maxHealth: number;
  events: SimulationEvent[];
};
