-- CreateTable
CREATE TABLE "GhostRun" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalMs" INTEGER NOT NULL,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GhostRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GhostRun_problemId_totalMs_idx" ON "GhostRun"("problemId", "totalMs");

-- AddForeignKey
ALTER TABLE "GhostRun" ADD CONSTRAINT "GhostRun_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GhostRun" ADD CONSTRAINT "GhostRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
