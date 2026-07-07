-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastNudgeDate" DATE,
ADD COLUMN     "notifyToken" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_notifyToken_key" ON "User"("notifyToken");

