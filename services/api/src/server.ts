import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { problemRoutes } from "./routes/problems.js";
import { contestRoutes } from "./routes/contests.js";
import { submissionRoutes } from "./routes/submissions.js";
import { leaderboardRoutes } from "./routes/leaderboard.js";
import { wsRoutes } from "./ws.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: any, reply: any) => Promise<void>;
  }
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket);

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
  await app.register(wsRoutes);

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
