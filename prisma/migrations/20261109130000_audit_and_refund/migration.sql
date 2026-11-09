-- Hoàn tiền (refund) + Nhật ký quản trị (audit log) — 2026-11-09.

ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT,
  "entityId" TEXT,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
