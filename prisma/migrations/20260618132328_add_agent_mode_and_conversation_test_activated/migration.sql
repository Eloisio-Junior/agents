-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'production';

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "test_activated_at" TIMESTAMP(3);
