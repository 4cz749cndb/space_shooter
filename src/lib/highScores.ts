export type HighScoreEntry = {
  id?: string;
  name: string;
  score: number;
};

export const HIGH_SCORE_LIMIT = 3;
export const HIGH_SCORE_STORAGE_LIMIT = 100;
export const HIGH_SCORE_KEY = "space-shooter:high-scores";
export const MAX_HIGH_SCORE_NAME_LENGTH = 12;

export const staticHighScores: HighScoreEntry[] = [
  { id: "static-ace", name: "ACE", score: 24 },
  { id: "static-nova", name: "NOVA", score: 15 },
  { id: "static-zed", name: "ZED", score: 8 }
];

export function sanitizeHighScoreName(name: unknown) {
  if (typeof name !== "string") return "YOU";

  const cleaned = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_HIGH_SCORE_NAME_LENGTH);

  return cleaned || "YOU";
}

export function normalizeHighScore(score: unknown) {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;

  return Math.max(0, Math.floor(score));
}

export function sortHighScores(scores: HighScoreEntry[]) {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, HIGH_SCORE_LIMIT);
}

export function qualifiesForHighScores(score: number, scores: HighScoreEntry[]) {
  const leaderboard = sortHighScores(scores);
  const lowestVisibleScore = leaderboard.at(-1)?.score ?? 0;

  return leaderboard.length < HIGH_SCORE_LIMIT || score > lowestVisibleScore;
}
