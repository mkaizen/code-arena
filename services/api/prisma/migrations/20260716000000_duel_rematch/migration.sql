-- Track a player's intent to rematch a finished duel. When both humans have
-- opted in, a fresh match with the same two players is opened.
ALTER TABLE "MatchPlayer" ADD COLUMN "wantsRematch" BOOLEAN NOT NULL DEFAULT false;
