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

export type Snapshot = {
  player: Vector2;
  projectiles: Projectile[];
  enemies: Enemy[];
  score: number;
  wave: number;
};
