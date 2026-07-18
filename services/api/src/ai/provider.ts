/**
 * The one impure seam of the AI opponent: the model HTTP call. Kept apart from
 * `opponent.ts` (which is pure and unit-tested) because it reads config and
 * touches the network.
 *
 * The default request shape is the Anthropic Messages API; any
 * Anthropic-compatible endpoint works by overriding AI_API_URL. The wire model
 * id is always supplied via config, never hardcoded.
 */

import { env } from "../env.js";
import {
  EFFORT,
  buildMessages,
  extractSolution,
  type AiDifficulty,
  type AiFeedback,
  type AiProblem,
  type AiSolution,
} from "./opponent.js";

/** Whether the AI opponent is configured — the whole feature is gated on this. */
export function aiConfigured(): boolean {
  return Boolean(env.AI_API_KEY && env.AI_OPPONENT_MODEL);
}

/** The configured opponent's display name, shown in the match UI. */
export function aiOpponentName(): string {
  return env.AI_OPPONENT_NAME;
}

/** The configured wire model id the opponent plays as. */
export function aiOpponentModel(): string {
  return env.AI_OPPONENT_MODEL as string;
}

/**
 * Ask the configured model for a solution. Returns null on any failure or
 * unparseable response — the caller treats that as "the opponent didn't get an
 * answer out this attempt", never a crash.
 */
export async function generateSolution(
  problem: AiProblem,
  difficulty: AiDifficulty,
  feedback?: AiFeedback,
): Promise<AiSolution | null> {
  if (!aiConfigured()) return null;
  const effort = EFFORT[difficulty];
  const { system, user } = buildMessages(problem, feedback);

  try {
    const res = await fetch(env.AI_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.AI_API_KEY as string,
        "anthropic-version": env.AI_API_VERSION,
      },
      body: JSON.stringify({
        model: env.AI_OPPONENT_MODEL,
        max_tokens: effort.maxTokens,
        temperature: effort.temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      console.error("ai opponent http error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");
    return extractSolution(text);
  } catch (err) {
    console.error("ai opponent call failed", err);
    return null;
  }
}
