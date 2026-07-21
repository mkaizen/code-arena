-- One-time repair: ratings should never be negative (the lowest tier, "Newbie",
-- floors at 0). Rated bot matches previously lacked a floor, so heavily-losing
-- competitors could be dragged below zero. Lift any such rows back to the floor.
-- Going forward, recomputeRatings() clamps to RATING_FLOOR so this can't recur.
UPDATE "User" SET "rating" = 0 WHERE "rating" < 0;

-- Keep the per-match audit trail consistent with the repaired User rows.
UPDATE "MatchPlayer" SET "ratingAfter" = 0 WHERE "ratingAfter" < 0;
UPDATE "RatingChange" SET "after" = 0 WHERE "after" < 0;
