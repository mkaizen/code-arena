/**
 * The one impure seam of the AI opponent: the model HTTP call. Kept apart from
 * `opponent.ts` (which is pure and unit-tested) because it reads config and
 * touches the network.
 *
 * The default request shape is the Anthropic Messages API; any
 * Anthropic-compatible endpoint works per-model via its `apiUrl`. Which model a
 * call uses is passed in (see `models.ts`), never hardcoded.
 */

import { env } from "../env.js";
import { parseAiModels, type AiModel } from "./models.js";
import {
  EFFORT,
  buildMessages,
  extractSolution,
  type AiDifficulty,
  type AiFeedback,
  type AiProblem,
  type AiSolution,
} from "./opponent.js";

/** The configured model roster (house model first). */
export function aiModels(): AiModel[] {
  return parseAiModels(env);
}

/** Whether any AI opponent is configured — the whole feature is gated on this. */
export function aiConfigured(): boolean {
  return aiModels().length > 0;
}

/** The default ("house") opponent used for human-vs-AI duels, or null. */
export function houseModel(): AiModel | null {
  return aiModels()[0] ?? null;
}

/** Look up a configured model by its key (wire model id / User.botModel). */
export function modelByKey(key: string): AiModel | undefined {
  return aiModels().find((m) => m.key === key);
}

/** The house opponent's display name, shown in the match UI. */
export function aiOpponentName(): string {
  return houseModel()?.name ?? "the AI";
}

/**
 * Ask a specific model for a solution. Returns null on any failure or
 * unparseable response — the caller treats that as "the opponent didn't get an
 * answer out this attempt", never a crash.
 */
export async function generateSolution(
  model: AiModel,
  problem: AiProblem,
  difficulty: AiDifficulty,
  feedback?: AiFeedback,
): Promise<AiSolution | null> {
  const effort = EFFORT[difficulty];
  const { system, user } = buildMessages(problem, feedback);

  try {
    const res = await fetch(model.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": model.apiKey,
        "anthropic-version": model.apiVersion,
      },
      body: JSON.stringify({
        model: model.model,
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
