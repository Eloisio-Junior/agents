-- outOfHoursBehavior was stored/edited but never consumed by any runtime path; dropped by decision.
ALTER TABLE "business_hours" DROP COLUMN "out_of_hours_behavior";
