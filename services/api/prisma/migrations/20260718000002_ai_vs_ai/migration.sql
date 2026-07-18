-- AlterTable: model-vs-model exhibition matches (two AIs, no human).
ALTER TABLE "Match" ADD COLUMN     "aiVsAi" BOOLEAN NOT NULL DEFAULT false;
