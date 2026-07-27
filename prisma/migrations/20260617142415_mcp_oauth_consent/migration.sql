-- AlterTable
ALTER TABLE "mcp_oauth_clients" ADD COLUMN     "first_party" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "mcp_oauth_pending_authorizations" (
    "id" BIGSERIAL NOT NULL,
    "request_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT,
    "client_id" TEXT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "tenant_id" BIGINT,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT[],
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" TEXT NOT NULL,
    "resource" TEXT,
    "state" TEXT,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_oauth_pending_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_oauth_client_approvals" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "client_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_oauth_client_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_pending_authorizations_request_hash_key" ON "mcp_oauth_pending_authorizations"("request_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_oauth_client_approvals_user_id_client_id_key" ON "mcp_oauth_client_approvals"("user_id", "client_id");
