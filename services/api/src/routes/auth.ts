import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { exchangeOAuthCode } from "../auth/oauth.js";

const registerBody = z.object({
  handle: z.string().min(2).max(24),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const oauthBody = z.object({
  provider: z.enum(["github", "google"]),
  code: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // FR-1: email/password registration.
  app.post("/auth/register", async (req, reply) => {
    const b = registerBody.parse(req.body);
    const passwordHash = await hashPassword(b.password);
    const user = await prisma.user.create({
      data: { handle: b.handle, email: b.email, passwordHash },
    });
    return reply.send({ token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating });
  });

  app.post("/auth/login", async (req, reply) => {
    const b = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: b.email } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, b.password))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    return reply.send({ token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating });
  });

  // FR-1: OAuth login — exchange code, upsert identity, mint our own JWT.
  app.post("/auth/oauth", async (req, reply) => {
    const b = oauthBody.parse(req.body);
    const id = await exchangeOAuthCode(b.provider, b.code);

    const account = await prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider: id.provider, providerId: id.providerId } },
      include: { user: true },
    });

    let user = account?.user ?? (await prisma.user.findUnique({ where: { email: id.email } }));
    if (!user) {
      user = await prisma.user.create({
        data: { handle: uniqueish(id.suggestedHandle), email: id.email },
      });
    }
    if (!account) {
      await prisma.oAuthAccount.create({
        data: { provider: id.provider, providerId: id.providerId, userId: user.id },
      });
    }
    return reply.send({ token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating });
  });
}

function uniqueish(base: string): string {
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}
