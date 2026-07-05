-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referredById" TEXT;

-- AlterTable
ALTER TABLE "MatchQueueEntry" ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

