-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('ROYALE', 'DUEL');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "mode" "MatchMode" NOT NULL DEFAULT 'ROYALE';

-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "roundWins" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MatchQueueEntry" ADD COLUMN     "mode" "MatchMode" NOT NULL DEFAULT 'ROYALE';

