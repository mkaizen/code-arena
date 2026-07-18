-- AlterTable: mark an AI-opponent bot with the wire model it plays as.
ALTER TABLE "User" ADD COLUMN     "botModel" TEXT;

-- AlterTable: flag human-vs-AI duels and record the opponent's effort setting.
ALTER TABLE "Match" ADD COLUMN     "aiDuel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Match" ADD COLUMN     "aiDifficulty" TEXT;
