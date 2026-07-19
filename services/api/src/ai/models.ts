/**
 * The AI-opponent model registry. A deployment can configure one "house" model
 * (via the single AI_* env vars), any number of extra models (via AI_MODELS
 * JSON), and a whole OpenRouter roster (via OPENROUTER_API_KEY + OPENROUTER_MODELS)
 * — enough for a multi-model roster and model-vs-model matches.
 *
 * A model's wire id is its stable `key` and is stored as `User.botModel`, so an
 * opponent bot is always resolvable back to the credentials it plays under. No
 * model id is ever hardcoded — everything comes from config.
 */

/** Which request/response shape the endpoint speaks. */
export type AiApiFormat = "anthropic" | "openai";

export interface AiModel {
  /** Stable identity (the wire model id); used as User.botModel. */
  key: string;
  /** Display name shown in the UI. */
  name: string;
  /** Wire model id sent to the provider. */
  model: string;
  apiKey: string;
  apiUrl: string;
  apiVersion: string;
  /** anthropic = Messages API; openai = Chat Completions (OpenRouter, etc.). */
  api: AiApiFormat;
}

interface RawEnv {
  AI_API_KEY?: string;
  AI_OPPONENT_MODEL?: string;
  AI_OPPONENT_NAME: string;
  AI_API_URL: string;
  AI_API_VERSION: string;
  AI_MODELS?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_API_URL: string;
  OPENROUTER_MODELS?: string;
}

function asFormat(x: unknown): AiApiFormat {
  return x === "openai" ? "openai" : "anthropic";
}

function parseJsonArray(s: string | undefined): Record<string, unknown>[] {
  if (!s) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(s);
  } catch {
    return [];
  }
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/**
 * Build the model list from config. Pure in `env` so it can be unit-tested.
 * Order: the house model first, then AI_MODELS entries, then the OpenRouter
 * roster. Malformed entries are skipped (never fatal), and duplicate wire ids
 * are dropped (first wins).
 */
export function parseAiModels(env: RawEnv): AiModel[] {
  const out: AiModel[] = [];
  const seen = new Set<string>();

  const push = (m: {
    name?: string;
    model?: string;
    apiKey?: string;
    apiUrl?: string;
    apiVersion?: string;
    api?: AiApiFormat;
  }) => {
    if (!m.model || !m.apiKey) return;
    if (seen.has(m.model)) return;
    seen.add(m.model);
    out.push({
      key: m.model,
      name: m.name?.trim() || m.model,
      model: m.model,
      apiKey: m.apiKey,
      apiUrl: m.apiUrl?.trim() || env.AI_API_URL,
      apiVersion: m.apiVersion?.trim() || env.AI_API_VERSION,
      api: m.api ?? "anthropic",
    });
  };

  // House model from the single-model vars (Anthropic Messages API by default).
  push({ name: env.AI_OPPONENT_NAME, model: env.AI_OPPONENT_MODEL, apiKey: env.AI_API_KEY });

  // Extra models — each may name its own endpoint and format.
  for (const r of parseJsonArray(env.AI_MODELS)) {
    push({
      name: str(r.name),
      model: str(r.model),
      apiKey: str(r.apiKey),
      apiUrl: str(r.apiUrl),
      apiVersion: str(r.apiVersion),
      api: asFormat(r.api),
    });
  }

  // OpenRouter roster — one key, many models, all OpenAI-format. Entries only
  // need { name, model }; the key and endpoint are filled in from env.
  if (env.OPENROUTER_API_KEY) {
    for (const r of parseJsonArray(env.OPENROUTER_MODELS)) {
      push({
        name: str(r.name),
        model: str(r.model),
        apiKey: env.OPENROUTER_API_KEY,
        apiUrl: env.OPENROUTER_API_URL,
        api: "openai",
      });
    }
  }

  return out;
}
