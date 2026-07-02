-- AlterTable
ALTER TABLE "MatchPlayer" ADD COLUMN     "forfeited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "ratingAfter" INTEGER,
ADD COLUMN     "ratingBefore" INTEGER;

