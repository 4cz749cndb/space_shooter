"use client";

import { useCallback, useEffect, useState } from "react";
import { sortHighScores, staticHighScores, type HighScoreEntry } from "@/lib/highScores";

type HighScoresResponse = {
  scores?: unknown;
  submittedScore?: unknown;
};

type SubmitHighScoreInput = {
  name: string;
  score: number;
};

type SubmitHighScoreResult = {
  scores: HighScoreEntry[];
  submittedScore: HighScoreEntry | null;
};

export function useHighScores() {
  const [highScores, setHighScores] = useState<HighScoreEntry[]>(staticHighScores);

  const refreshHighScores = useCallback(async () => {
    if (process.env.NODE_ENV !== "production") {
      setHighScores(staticHighScores);
      return staticHighScores;
    }

    const scores = await fetchHighScores();
    setHighScores(scores);
    return scores;
  }, []);

  const submitHighScore = useCallback(async ({ name, score }: SubmitHighScoreInput): Promise<SubmitHighScoreResult> => {
    try {
      const response = await fetch("/api/high-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name, score })
      });

      if (!response.ok) {
        throw new Error("Score submission failed");
      }

      const result = (await response.json()) as HighScoresResponse;
      const scores = parseHighScoresResponse(result.scores);
      const submittedScore = parseSubmittedScore(result.submittedScore);

      setHighScores(scores);
      return { scores, submittedScore };
    } catch (error) {
      setHighScores(staticHighScores);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let isMounted = true;

    void fetchHighScores().then((scores) => {
      if (isMounted) {
        setHighScores(scores);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return { highScores, refreshHighScores, submitHighScore };
}

async function fetchHighScores() {
  try {
    const response = await fetch("/api/high-scores");

    if (!response.ok) {
      return staticHighScores;
    }

    const result = (await response.json()) as HighScoresResponse;

    return parseHighScoresResponse(result.scores);
  } catch {
    return staticHighScores;
  }
}

function parseHighScoresResponse(scores: unknown) {
  if (!Array.isArray(scores)) return staticHighScores;

  const parsedScores = scores
    .map(parseSubmittedScore)
    .filter((score): score is HighScoreEntry => Boolean(score));

  return parsedScores.length > 0 ? sortHighScores(parsedScores) : staticHighScores;
}

function parseSubmittedScore(score: unknown): HighScoreEntry | null {
  if (!score || typeof score !== "object") return null;

  const entry = score as { id?: unknown; name?: unknown; score?: unknown };

  if (typeof entry.name !== "string" || typeof entry.score !== "number" || !Number.isFinite(entry.score)) {
    return null;
  }

  return {
    id: typeof entry.id === "string" ? entry.id : undefined,
    name: entry.name,
    score: Math.max(0, Math.floor(entry.score))
  };
}
