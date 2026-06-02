"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import type { Snapshot } from "@/game/simulation/types";
import {
  MAX_HIGH_SCORE_NAME_LENGTH,
  qualifiesForHighScores,
  sortHighScores,
  type HighScoreEntry
} from "@/lib/highScores";

type MenuPhase = "menu" | "stageSelect" | "exited" | "highScores";

type DisplayHighScoreEntry = HighScoreEntry & {
  isPlayer?: boolean;
};

type SubmitHighScore = (input: { name: string; score: number }) => Promise<{
  scores: HighScoreEntry[];
  submittedScore: HighScoreEntry | null;
}>;

type StageBriefing = {
  briefing: string;
  id: number;
  setting: string;
  title: string;
};

type StageSelectItem = {
  id: number;
  setting: string;
  title: string;
};

export function RetroMenu({
  phase,
  stages,
  highScores,
  onActivateAudio,
  onNewGame,
  onExit,
  onBackToMenu,
  onHighScores,
  onSelectStage,
  onStageSelect
}: {
  phase: MenuPhase;
  stages: StageSelectItem[];
  highScores: HighScoreEntry[];
  onActivateAudio: () => Promise<void>;
  onNewGame: () => void;
  onExit: () => void;
  onBackToMenu: () => void;
  onHighScores: () => void;
  onSelectStage: () => void;
  onStageSelect: (stageId: number) => void;
}) {
  const isExited = phase === "exited";
  const isHighScores = phase === "highScores";
  const isStageSelect = phase === "stageSelect";

  return (
    <RetroScreen
      ariaLabel={isExited ? "Exited game" : isHighScores ? "High scores" : isStageSelect ? "Select stage" : "Main menu"}
      onPointerDown={() => void onActivateAudio()}
    >
      <div className={isHighScores || isStageSelect ? "menu-stack high-scores-menu-stack" : "menu-stack"}>
        <p className="menu-kicker">{isExited ? "System Offline" : isHighScores ? "Hall Of Fame" : isStageSelect ? "Mission Select" : "Insert Credit"}</p>
        <h1 className="menu-title">Space Shooter</h1>
        <p className="menu-status">{isExited ? "Game session ended" : isHighScores ? "Top pilots" : isStageSelect ? "Choose insertion point" : "Ready player one"}</p>

        {isExited ? (
          <div className="menu-actions" aria-label="Exited actions">
            <button className="menu-button is-primary" type="button" onClick={onBackToMenu}>
              Back To Menu
            </button>
          </div>
        ) : isHighScores ? (
          <>
            <HighScoreBoard scores={highScores} />
            <div className="menu-actions" aria-label="High score actions">
              <button className="menu-button is-primary" type="button" onClick={onBackToMenu}>
                Back To Menu
              </button>
            </div>
          </>
        ) : isStageSelect ? (
          <div className="menu-actions" aria-label="Stage select actions">
            {stages.map((stage) => (
              <button className="menu-button stage-select-button" key={stage.id} type="button" onClick={() => onStageSelect(stage.id)}>
                <span>Stage {stage.id}</span>
                <span>{stage.title}</span>
                <span>{stage.setting}</span>
              </button>
            ))}
            <button className="menu-button" type="button" onClick={onBackToMenu}>
              Back To Menu
            </button>
          </div>
        ) : (
          <div className="menu-actions" aria-label="Main menu actions">
            <button className="menu-button is-primary" type="button" onClick={onNewGame}>
              New Game
            </button>
            <button className="menu-button" type="button" onClick={onHighScores}>
              High Scores
            </button>
            <button className="menu-button" type="button" onClick={onSelectStage}>
              Select Stage
            </button>
            <button className="menu-button" type="button" disabled>
              Options
            </button>
            <button className="menu-button" type="button" onClick={onExit}>
              Exit
            </button>
          </div>
        )}
      </div>
    </RetroScreen>
  );
}

export function StageBriefingScreen({
  stage,
  stageCount,
  onActivateAudio,
  onStartStage
}: {
  stage: StageBriefing;
  stageCount: number;
  onActivateAudio: () => Promise<void>;
  onStartStage: () => void;
}) {
  return (
    <RetroScreen ariaLabel={`Stage ${stage.id} briefing`} onPointerDown={() => void onActivateAudio()}>
      <div className="menu-stack stage-briefing-stack">
        <p className="menu-kicker">
          Stage {stage.id}/{stageCount}
        </p>
        <h1 className="menu-title stage-briefing-title">{stage.title}</h1>
        <p className="menu-status">{stage.setting}</p>
        <p className="stage-briefing-copy">{stage.briefing}</p>
        <div className="menu-actions" aria-label="Stage briefing actions">
          <button className="menu-button is-primary" type="button" onClick={onStartStage}>
            Start Stage
          </button>
        </div>
      </div>
    </RetroScreen>
  );
}

export function GameOverScreen({
  highScores,
  isVictory = false,
  snapshot,
  onBackToMenu,
  onNewGame,
  onSubmitHighScore
}: {
  highScores: HighScoreEntry[];
  isVictory?: boolean;
  snapshot: Snapshot;
  onBackToMenu: () => void;
  onNewGame: () => void;
  onSubmitHighScore: SubmitHighScore;
}) {
  const [playerName, setPlayerName] = useState("YOU");
  const [submittedScoreId, setSubmittedScoreId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qualifiesForLeaderboard = qualifiesForHighScores(snapshot.score, highScores);
  const playerScore: DisplayHighScoreEntry = {
    id: submittedScoreId ?? "current-player",
    name: playerName.trim() || "YOU",
    score: snapshot.score,
    isPlayer: true
  };
  const survivedTime = formatSurvivalTime(snapshot.elapsedTime);
  const displayedScores: DisplayHighScoreEntry[] = submittedScoreId
    ? highScores.map((entry) => ({
        ...entry,
        isPlayer: entry.id === submittedScoreId
      }))
    : qualifiesForLeaderboard
      ? sortHighScores([...highScores, playerScore])
      : highScores;
  const submittedScoreIsVisible = displayedScores.some((entry) => entry.id === submittedScoreId);

  const handleSubmitScore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || submittedScoreId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await onSubmitHighScore({
        name: playerName,
        score: snapshot.score
      });

      setSubmittedScoreId(result.submittedScore?.id ?? null);
      setPlayerName(result.submittedScore?.name ?? playerName);
    } catch {
      setSubmitError("Score link failed. Static board restored.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RetroScreen ariaLabel={isVictory ? "Mission complete" : "Game over"}>
      <div className="menu-stack game-over-stack">
        <p className="menu-kicker">{isVictory ? "Boss Destroyed" : qualifiesForLeaderboard ? "Mission Complete" : "Signal Lost"}</p>
        <h1 className="menu-title">{isVictory ? "Victory" : "Game Over"}</h1>
        <div className="final-run-stats" aria-label="Final run stats">
          <p>
            Final Score <span>{snapshot.score}</span>
          </p>
          <p>
            Time Survived <span>{survivedTime}</span>
          </p>
        </div>

        <HighScoreBoard
          scores={displayedScores}
          footer={
            <>
              {!qualifiesForLeaderboard ? (
                <p className="player-score-note">
                  Your Score <span>{snapshot.score}</span>
                </p>
              ) : null}
              {submittedScoreId && !submittedScoreIsVisible ? (
                <p className="player-score-note">
                  Score Saved <span>{snapshot.score}</span>
                </p>
              ) : null}
            </>
          }
        />

        {!submittedScoreId ? (
          <form className="score-submit-form" aria-label="Submit high score" onSubmit={handleSubmitScore}>
            <label className="score-submit-label" htmlFor="player-name">
              Pilot Name
            </label>
            <div className="score-submit-row">
              <input
                id="player-name"
                className="score-submit-input"
                type="text"
                value={playerName}
                maxLength={MAX_HIGH_SCORE_NAME_LENGTH}
                autoComplete="off"
                inputMode="text"
                onChange={(event) => setPlayerName(event.target.value)}
              />
              <button className="menu-button is-primary score-submit-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving" : "Submit"}
              </button>
            </div>
            {submitError ? <p className="score-submit-error">{submitError}</p> : null}
          </form>
        ) : null}

        <div className="menu-actions" aria-label="Game over actions">
          <button className="menu-button is-primary" type="button" onClick={onNewGame}>
            New Game
          </button>
          <button className="menu-button" type="button" onClick={onBackToMenu}>
            Back To Menu
          </button>
        </div>
      </div>
    </RetroScreen>
  );
}

function HighScoreBoard({ footer, scores }: { footer?: ReactNode; scores: DisplayHighScoreEntry[] }) {
  return (
    <div className="high-score-board" aria-label="High scores">
      <p className="high-score-heading">High Scores</p>
      <ol className="high-score-list">
        {scores.map((entry, index) => (
          <li className={entry.isPlayer ? "high-score-row is-player" : "high-score-row"} key={entry.id ?? `${entry.name}-${index}`}>
            <span className="high-score-rank">{index + 1}</span>
            <span className="high-score-name">{entry.name}</span>
            <span className="high-score-value">{entry.score}</span>
          </li>
        ))}
      </ol>
      {footer}
    </div>
  );
}

function RetroScreen({
  ariaLabel,
  children,
  onPointerDown
}: {
  ariaLabel: string;
  children: ReactNode;
  onPointerDown?: () => void;
}) {
  return (
    <section className="retro-screen" aria-label={ariaLabel} onPointerDown={onPointerDown}>
      <div className="retro-stars" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-alpha" aria-hidden="true" />
      <div className="pixel-ship pixel-ship-beta" aria-hidden="true" />
      <div className="laser laser-alpha" aria-hidden="true" />
      <div className="laser laser-beta" aria-hidden="true" />
      <div className="pixel-boom boom-alpha" aria-hidden="true" />
      <div className="pixel-boom boom-beta" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      {children}
    </section>
  );
}

function formatSurvivalTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
