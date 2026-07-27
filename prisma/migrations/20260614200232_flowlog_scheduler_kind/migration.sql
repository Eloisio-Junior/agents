-- AlterEnum
-- NOTE: ADD VALUE is non-transactional in older Postgres and the value cannot be USED in the same
-- transaction it is added; kept in its own migration step (precedent: add_heartbeat_scheduler_kind).
ALTER TYPE "SchedulerJobKind" ADD VALUE 'FLOWLOG_SWEEP';
