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

export type GroundProfile = {
  maxY?: number;
  minY?: number;
  maxStep?: number;
  points: Vector2[];
};

export type Projectile = Vector2 & {
  id: number;
  velocityX: number;
  velocityY: number;
};

export type EnemyKind = "basic" | "sineGunner" | "miniBoss" | "boss" | "turret";

export type TurretMount = "floor" | "ceiling";

export type TurretBeam = {
  id: number;
  start: Vector2;
  target: Vector2;
  timeRemaining: number;
  hasHitPlayer: boolean;
};

export type Enemy = Vector2 & {
  id: number;
  age: number;
  baseY: number;
  beamStart: Vector2 | null;
  beamChargeTimeRemaining: number;
  beamHasHitPlayer: boolean;
  beamCooldownTimer: number;
  beamTarget: Vector2 | null;
  beamTimeRemaining: number;
  fireTimer: number;
  health: number;
  kind: EnemyKind;
  phase: number;
  targetY: number;
  turretBeams: TurretBeam[];
  turretBurstShotsFired: number;
  turretChargeTarget: Vector2 | null;
  turretChargeTimeRemaining: number;
  turretIdleTimer: number;
  turretMount: TurretMount | null;
};

export type EnemyBeam =
  | {
      id: number;
      kind: "horizontal";
      y: number;
    }
  | {
      end: Vector2;
      id: number;
      kind: "aimed";
      start: Vector2;
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
    }
  | {
      type: "bossSpawned";
      position: Vector2;
    }
  | {
      type: "stageComplete";
      position: Vector2;
      score: number;
    };

export type SimulationInitialProgress = Pick<Snapshot, "elapsedTime" | "health" | "level" | "maxHealth" | "nextLevelScore" | "score" | "shieldCharges">;

export type Snapshot = {
  player: Vector2;
  projectiles: Projectile[];
  enemies: Enemy[];
  enemyProjectiles: EnemyProjectile[];
  enemyBeams: EnemyBeam[];
  powerUps: PowerUp[];
  ceiling: GroundProfile | null;
  ground: GroundProfile | null;
  elapsedTime: number;
  score: number;
  shieldCharges: number;
  level: number;
  nextLevelScore: number;
  timeScale: number;
  weaponPowerTimeRemaining: number;
  health: number;
  maxHealth: number;
  events: SimulationEvent[];
};
