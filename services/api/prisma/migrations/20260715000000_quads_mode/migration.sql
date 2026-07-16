-- Add the 4-player elimination mode. Postgres 12+ allows ADD VALUE inside the
-- migration transaction as long as the new value isn't used in the same one.
ALTER TYPE "MatchMode" ADD VALUE 'QUADS';
