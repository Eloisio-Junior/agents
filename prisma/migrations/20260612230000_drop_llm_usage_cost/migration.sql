-- cost_usd removed from the local pipeline; real cost now comes from Langfuse.
ALTER TABLE "llm_usage" DROP COLUMN "cost_usd";
