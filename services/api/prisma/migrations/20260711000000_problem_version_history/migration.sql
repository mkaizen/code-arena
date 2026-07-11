-- CreateTable
CREATE TABLE "ProblemVersion" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "editorial" TEXT,
    "difficulty" "Difficulty" NOT NULL,
    "ratingValue" INTEGER NOT NULL,
    "tags" TEXT[],
    "timeMs" INTEGER NOT NULL,
    "memoryKb" INTEGER NOT NULL,
    "samples" JSONB NOT NULL,
    "testCount" INTEGER NOT NULL,
    "editorHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVersion_problemId_version_key" ON "ProblemVersion"("problemId", "version");

-- CreateIndex
CREATE INDEX "ProblemVersion_problemId_createdAt_idx" ON "ProblemVersion"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProblemVersion" ADD CONSTRAINT "ProblemVersion_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
