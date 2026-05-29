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
};

export type Enemy = Vector2 & {
  id: number;
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
    };

export type Snapshot = {
  player: Vector2;
  projectiles: Projectile[];
  enemies: Enemy[];
  score: number;
  wave: number;
  health: number;
  maxHealth: number;
  events: SimulationEvent[];
};
