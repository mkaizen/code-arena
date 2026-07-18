/**
 * The AI-opponent model registry. A deployment can configure one "house" model
 * (via the single AI_* env vars) and any number of extra models (via AI_MODELS
 * JSON) — enough for a multi-model roster and model-vs-model matches.
 *
 * A model's wire id is its stable `key` and is stored as `User.botModel`, so an
 * opponent bot is always resolvable back to the credentials it plays under. No
 * model id is ever hardcoded — everything comes from config.
 */

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
}

interface RawEnv {
  AI_API_KEY?: string;
  AI_OPPONENT_MODEL?: string;
  AI_OPPONENT_NAME: string;
  AI_API_URL: string;
  AI_API_VERSION: string;
  AI_MODELS?: string;
}

/**
 * Build the model list from config. Pure in `env` so it can be unit-tested.
 * The house model (single AI_* vars) is always first when present; AI_MODELS
 * entries follow. Malformed AI_MODELS entries are skipped, not fatal, and
 * duplicate wire ids are dropped (first wins).
 */
export function parseAiModels(env: RawEnv): AiModel[] {
  const out: AiModel[] = [];
  const seen = new Set<string>();

  const push = (m: Partial<AiModel> & { model?: string; apiKey?: string }) => {
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
    });
  };

  // House model from the single-model vars.
  push({ name: env.AI_OPPONENT_NAME, model: env.AI_OPPONENT_MODEL, apiKey: env.AI_API_KEY });

  // Extra models.
  if (env.AI_MODELS) {
    let arr: unknown;
    try {
      arr = JSON.parse(env.AI_MODELS);
    } catch {
      arr = null;
    }
    if (Array.isArray(arr)) {
      for (const raw of arr) {
        if (raw && typeof raw === "object") {
          const r = raw as Record<string, unknown>;
          push({
            name: typeof r.name === "string" ? r.name : undefined,
            model: typeof r.model === "string" ? r.model : undefined,
            apiKey: typeof r.apiKey === "string" ? r.apiKey : undefined,
            apiUrl: typeof r.apiUrl === "string" ? r.apiUrl : undefined,
            apiVersion: typeof r.apiVersion === "string" ? r.apiVersion : undefined,
          });
        }
      }
    }
  }

  return out;
}
