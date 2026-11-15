-- Additive: preserve all existing sprint/ticket IDs and dates.
ALTER TABLE "Sprint" ADD COLUMN status TEXT NOT NULL DEFAULT 'PLANNED',
 ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_status_check" CHECK (status IN ('PLANNED','ACTIVE','COMPLETED')),
 ADD CONSTRAINT "Sprint_version_check" CHECK (version > 0),
 ADD CONSTRAINT "Sprint_lifecycle_check" CHECK (
 (status='PLANNED' AND "startedAt" IS NULL AND "completedAt" IS NULL) OR
 (status='ACTIVE' AND "startedAt" IS NOT NULL AND "completedAt" IS NULL) OR
 (status='COMPLETED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL));
CREATE UNIQUE INDEX "Sprint_one_active_per_project" ON "Sprint"("projectId") WHERE status='ACTIVE';
