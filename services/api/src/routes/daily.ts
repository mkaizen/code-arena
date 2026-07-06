import type { FastifyInstance } from "fastify";
import { getDailyProblem, streakFor, calendarFor, utcDate } from "../daily.js";

export async function dailyRoutes(app: FastifyInstance) {
  // Today's featured problem plus, if the caller is authenticated, their streak
  // and a short solve calendar. Auth is optional so logged-out visitors (and
  // crawlers) still see the daily problem.
  app.get("/daily", async (req) => {
    const today = utcDate();
    const problem = await getDailyProblem(today);

    let userId: string | undefined;
    try {
      await req.jwtVerify();
      userId = req.user.sub;
    } catch {
      userId = undefined;
    }

    const [streak, calendar] = userId
      ? await Promise.all([streakFor(userId), calendarFor(userId)])
      : [null, null];

    return {
      date: today.toISOString().slice(0, 10),
      problem,
      streak,
      calendar,
    };
  });
}
