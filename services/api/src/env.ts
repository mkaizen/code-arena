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
});

export const env = schema.parse(process.env);
