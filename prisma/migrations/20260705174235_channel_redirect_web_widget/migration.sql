-- AlterEnum
ALTER TYPE "SchedulerJobKind" ADD VALUE 'REDIRECT_FOLLOWUP';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "redirect_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redirect_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inboxes" ADD COLUMN     "web_widget" TEXT;
