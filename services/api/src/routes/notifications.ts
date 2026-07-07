import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { unsubscribeByToken } from "../mail/notifications.js";

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head>
  <body style="margin:0;background:#0E1116;color:#E6EDF3;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
    <div style="max-width:420px;text-align:center;padding:32px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:16px;">Code<span style="color:#3FB950;">Arena</span></div>
      ${body}
    </div>
  </body></html>`;
}

export async function notificationRoutes(app: FastifyInstance) {
  // One-click unsubscribe — public, no JS, works from any email client. An
  // optional ?resub=1 re-subscribes so the confirmation page can offer an undo.
  app.get("/notifications/unsubscribe", async (req, reply) => {
    const { token, resub } = req.query as { token?: string; resub?: string };
    reply.type("text/html");
    if (!token) return reply.code(400).send(page("Invalid link", "<p>This unsubscribe link is missing its token.</p>"));

    if (resub === "1") {
      const user = await prisma.user.findUnique({ where: { notifyToken: token }, select: { id: true } });
      if (!user) return reply.code(404).send(page("Not found", "<p>This link is no longer valid.</p>"));
      await prisma.user.update({ where: { id: user.id }, data: { emailOptOut: false } });
      return reply.send(page("Re-subscribed", "<p style='color:#8b949e'>You're back on the list — we'll email you about contests, streaks and invites again.</p>"));
    }

    const handle = await unsubscribeByToken(token);
    if (!handle) return reply.code(404).send(page("Not found", "<p>This link is no longer valid.</p>"));
    const resubUrl = `/notifications/unsubscribe?token=${encodeURIComponent(token)}&resub=1`;
    return reply.send(page(
      "Unsubscribed",
      `<p style="color:#8b949e">You've been unsubscribed from Code Arena emails.</p>
       <p style="margin-top:20px"><a href="${resubUrl}" style="color:#3FB950">Changed your mind? Re-subscribe</a></p>`,
    ));
  });

  // Authenticated preference toggle, for a future settings UI.
  app.get("/notifications/prefs", { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { emailOptOut: true } });
    return { emailOptOut: user?.emailOptOut ?? false };
  });

  app.put("/notifications/prefs", { onRequest: [app.authenticate] }, async (req) => {
    const body = z.object({ emailOptOut: z.boolean() }).parse(req.body);
    await prisma.user.update({ where: { id: req.user.sub }, data: { emailOptOut: body.emailOptOut } });
    return { emailOptOut: body.emailOptOut };
  });
}
