import { prisma } from "./db.js";
import { RECRUITER_THRESHOLD } from "@arena/shared";

export { RECRUITER_THRESHOLD };

export async function referralCount(userId: string): Promise<number> {
  return prisma.user.count({ where: { referredById: userId } });
}

export async function isRecruiter(userId: string): Promise<boolean> {
  return (await referralCount(userId)) >= RECRUITER_THRESHOLD;
}
