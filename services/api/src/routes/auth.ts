import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { exchangeOAuthCode } from "../auth/oauth.js";
import { sendReferralWelcome } from "../mail/notifications.js";

const registerBody = z.object({
  handle: z.string().min(2).max(24),
  email: z.string().email(),
  password: z.string().min(8),
  // Referral growth loop: the referring user's handle, e.g. from ?ref=<handle>.
  ref: z.string().max(24).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

const oauthBody = z.object({
  provider: z.enum(["github", "google"]),
  code: z.string(),
});

// Credential endpoints are brute-forceable — throttle per IP.
const authLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export async function authRoutes(app: FastifyInstance) {
  // FR-1: email/password registration.
  app.post("/auth/register", { config: authLimit }, async (req, reply) => {
    const b = registerBody.parse(req.body);
    const passwordHash = await hashPassword(b.password);

    // Referral is best-effort: an unknown/self handle is silently ignored
    // rather than failing registration over it.
    let referredById: string | undefined;
    if (b.ref && b.ref.toLowerCase() !== b.handle.toLowerCase()) {
      const referrer = await prisma.user.findUnique({ where: { handle: b.ref }, select: { id: true } });
      referredById = referrer?.id;
    }

    const user = await prisma.user.create({
      data: { handle: b.handle, email: b.email, passwordHash, referredById },
    });
    // Fire-and-forget: tell the referrer their invite landed. Never blocks or
    // fails registration over a mail hiccup.
    if (referredById) {
      sendReferralWelcome(referredById, user.handle).catch((err) => req.log.error(err, "referral email failed"));
    }
    return reply.send({ id: user.id, token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating, role: user.role });
  });

  app.post("/auth/login", { config: authLimit }, async (req, reply) => {
    const b = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: b.email } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, b.password))) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    return reply.send({ id: user.id, token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating, role: user.role });
  });

  // FR-1: OAuth login — exchange code, upsert identity, mint our own JWT.
  app.post("/auth/oauth", { config: authLimit }, async (req, reply) => {
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
    return reply.send({ id: user.id, token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating, role: user.role });
  });

  // Mint a throwaway guest account so a logged-out visitor can play a
  // "Challenge the AI" duel with no signup. Capped per IP so it can't be used
  // to mass-create accounts. Guests are unrated and excluded from leaderboards.
  app.post("/auth/guest", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (_req, reply) => {
    // Retry on the vanishingly rare handle/email collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 8);
      try {
        const user = await prisma.user.create({
          data: { handle: `guest-${suffix}`, email: `guest+${suffix}@codearena.local`, guest: true },
        });
        return reply.send({
          id: user.id, token: app.jwt.sign({ sub: user.id }),
          handle: user.handle, rating: user.rating, role: user.role, guest: true,
        });
      } catch {
        // handle/email uniqueness clash — try a fresh suffix.
      }
    }
    return reply.code(503).send({ error: "could not create a guest session, please retry" });
  });

  // Exchange a valid (unexpired) token for a fresh one. The web app calls
  // this on boot, so sessions slide forward while stale tokens age out.
  app.post("/auth/refresh", { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ id: user.id, token: app.jwt.sign({ sub: user.id }), handle: user.handle, rating: user.rating, role: user.role, guest: user.guest });
  });
}

function uniqueish(base: string): string {
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}
