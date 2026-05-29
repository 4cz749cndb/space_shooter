import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import {
  HIGH_SCORE_KEY,
  HIGH_SCORE_LIMIT,
  HIGH_SCORE_STORAGE_LIMIT,
  normalizeHighScore,
  sanitizeHighScoreName,
  sortHighScores,
  staticHighScores,
  type HighScoreEntry
} from "@/lib/highScores";

export const dynamic = "force-dynamic";

type StoredHighScore = {
  id: string;
  name: string;
};
let cachedRedis: Redis | null = null;
let cachedRedisSignature: string | null = null;

function canUsePersistentHighScores() {
  const hasUpstashEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasKvEnv = Boolean(process.env.KV_REST_API_URL) && Boolean(process.env.KV_REST_API_TOKEN);

  return process.env.NODE_ENV === "production" && (hasUpstashEnv || hasKvEnv);
}

function getRedisConfig() {
  return (
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? {
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN
        }
      : {
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN
        }
  );
}

function getRedis() {
  if (!canUsePersistentHighScores()) return null;

  const config = getRedisConfig();

  if (!config.url || !config.token) return null;

  const signature = `${config.url}:${config.token}`;

  if (!cachedRedis || cachedRedisSignature !== signature) {
    cachedRedis = new Redis(config);
    cachedRedisSignature = signature;
  }

  return cachedRedis;
}

async function getTopHighScores(): Promise<HighScoreEntry[]> {
  const redis = getRedis();

  if (!redis) return staticHighScores;

  try {
    const entries = await redis.zrange<unknown[]>(HIGH_SCORE_KEY, 0, HIGH_SCORE_LIMIT - 1, {
      rev: true,
      withScores: true
    });

    const scores: HighScoreEntry[] = [];

    for (let index = 0; index < entries.length; index += 2) {
      const entry = entries[index];
      const score = entries[index + 1];

      if (typeof score === "number" && isStoredHighScore(entry)) {
        scores.push({
          id: entry.id,
          name: entry.name,
          score
        });
      }
    }

    return sortHighScores([...staticHighScores, ...scores]);
  } catch (error) {
    console.error("Failed to read high scores", error);
    return staticHighScores;
  }
}

function isStoredHighScore(entry: unknown): entry is StoredHighScore {
  return Boolean(
    entry &&
      typeof entry === "object" &&
      "id" in entry &&
      "name" in entry &&
      typeof entry.id === "string" &&
      typeof entry.name === "string"
  );
}

export async function GET() {
  const scores = await getTopHighScores();

  return NextResponse.json({ scores });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const payload = body as { name?: unknown; score?: unknown };
  const score = normalizeHighScore(payload.score);

  if (score === null) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const name = sanitizeHighScoreName(payload.name);
  const submittedEntry: HighScoreEntry = {
    id: `score-${Date.now()}-${crypto.randomUUID()}`,
    name,
    score
  };
  const redis = getRedis();

  if (!redis) {
    const scores = sortHighScores([...staticHighScores, submittedEntry]);

    return NextResponse.json({ scores, submittedScore: submittedEntry });
  }

  try {
    await redis.zadd(HIGH_SCORE_KEY, {
      member: {
        id: submittedEntry.id,
        name
      },
      score
    });
    await redis.zremrangebyrank(HIGH_SCORE_KEY, 0, -(HIGH_SCORE_STORAGE_LIMIT + 1));

    const scores = await getTopHighScores();

    return NextResponse.json({ scores, submittedScore: submittedEntry });
  } catch (error) {
    console.error("Failed to write high score", error);

    const scores = sortHighScores([...staticHighScores, submittedEntry]);

    return NextResponse.json({ scores, submittedScore: submittedEntry });
  }
}
