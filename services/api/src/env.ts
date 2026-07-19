import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(8080),
  JWT_SECRET: z.string().min(8),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string(),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_BASE: z.string().default("http://localhost:5173/auth/callback"),
  // Public base URL of the web app, used to build links in emails.
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
  // Public base URL of this API, used for one-click unsubscribe links that the
  // API serves directly (no JS, works from any email client).
  API_BASE_URL: z.string().default("http://localhost:8080"),
  // Email is opt-in infrastructure: without RESEND_API_KEY, messages are logged
  // rather than sent, so the app runs fine with no provider configured.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Code Arena <onboarding@resend.dev>"),
  // AI opponent ("Challenge the AI") is opt-in the same way: without an API key
  // the feature is disabled and its endpoints 404, so the app runs anywhere.
  // The wire model id and display name are supplied at deploy — never hardcoded —
  // so the same code can front any provider/model.
  AI_API_KEY: z.string().optional(),
  AI_API_URL: z.string().default("https://api.anthropic.com/v1/messages"),
  AI_API_VERSION: z.string().default("2023-06-01"),
  AI_OPPONENT_MODEL: z.string().optional(),
  AI_OPPONENT_NAME: z.string().default("Arena AI"),
  // Extra opponents for a multi-model roster and AI-vs-AI matches. JSON array of
  // { name, model, apiKey, apiUrl?, apiVersion?, api? }. The single AI_* vars
  // above are always the first ("house") model; these are appended. `api` is
  // "anthropic" (default) or "openai" for OpenAI-shaped endpoints.
  AI_MODELS: z.string().optional(),
  // OpenRouter convenience: one key unlocks a roster of models (GPT, Gemini,
  // DeepSeek, Qwen, Llama, …). OPENROUTER_MODELS is a JSON array of { name, model }
  // — the key and endpoint are filled in automatically, all OpenAI-format.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_URL: z.string().default("https://openrouter.ai/api/v1/chat/completions"),
  OPENROUTER_MODELS: z.string().optional(),
  // AI-vs-AI auto-matches that populate the model-vs-model board. Off by default
  // (they spend real model budget); needs >=2 configured models to do anything.
  AI_VS_AI_ENABLED: z.coerce.boolean().default(false),
  AI_VS_AI_INTERVAL_SEC: z.coerce.number().default(900),
});

export const env = schema.parse(process.env);
