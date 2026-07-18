-- AlterTable: throwaway guest accounts for no-signup "Challenge the AI" duels.
ALTER TABLE "User" ADD COLUMN     "guest" BOOLEAN NOT NULL DEFAULT false;
