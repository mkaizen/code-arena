import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { problemRoutes } from "./routes/problems.js";
import { contestRoutes } from "./routes/contests.js";
import { submissionRoutes } from "./routes/submissions.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { adminRoutes } from "./routes/admin.js";
import { matchRoutes } from "./routes/matches.js";
import { wsRoutes } from "./ws.js";
import { startVerdictSubscriber } from "./leaderboard/verdictSub.js";
import { sweepOverdueMatches } from "./match/engine.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  // Tokens expire; the web app renews on boot via POST /auth/refresh.
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: "7d" } });
  await app.register(websocket);
  await app.register(rateLimit, { global: false });

  app.decorate("authenticate", async (req: any, reply: any) => {
    try { await req.jwtVerify(); }
    catch { reply.code(401).send({ error: "unauthorized" }); }
  });

  app.get("/health", async () => ({ ok: true }));

  await app.register(authRoutes);
  await app.register(problemRoutes);
  await app.register(contestRoutes);
  await app.register(submissionRoutes);
  await app.register(leaderboardRoutes);
  await app.register(adminRoutes);
  await app.register(matchRoutes);
  await app.register(wsRoutes);

  startVerdictSubscriber();
  // Self-heals stuck Battle Royale rounds if a setTimeout was lost (e.g. API restart).
  setInterval(() => {
    sweepOverdueMatches().catch((err) => app.log.error(err, "match sweep failed"));
  }, 15_000);
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
