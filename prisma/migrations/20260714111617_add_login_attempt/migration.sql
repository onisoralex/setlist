-- CreateTable
CREATE TABLE "login_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ip_address" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempt_ip_address_created_at_idx" ON "login_attempt"("ip_address", "created_at");
