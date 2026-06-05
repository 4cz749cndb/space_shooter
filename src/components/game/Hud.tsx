"use client";

import type { Snapshot } from "@/game/simulation/types";

export type HudStage = {
  id: number;
  setting: string;
};

export function Hud({
  currentStage,
  snapshot,
  stageCount,
  onExit
}: {
  currentStage: HudStage;
  snapshot: Snapshot;
  stageCount: number;
  onExit: () => void;
}) {
  const healthPercent = `${(snapshot.health / snapshot.maxHealth) * 100}%`;

  return (
    <section className="hud" aria-label="Game status">
      <div className="hud-top">
        <div className="hud-panel">
          <p className="hud-label">Stage</p>
          <p className="hud-value">
            {currentStage.id}/{stageCount}
          </p>
          <p className="hud-subvalue">{currentStage.setting}</p>
        </div>
        <div className="hud-panel">
          <p className="hud-label">Score</p>
          <p className="hud-value">{snapshot.score}</p>
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
