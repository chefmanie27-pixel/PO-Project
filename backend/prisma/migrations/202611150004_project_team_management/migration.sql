-- Additive migration: existing UUIDs, ticket prefixes and relationships remain intact.
ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 ADD COLUMN "startDate" TIMESTAMP(3), ADD COLUMN "targetDate" TIMESTAMP(3),
 ADD COLUMN "ownerId" UUID, ADD COLUMN "archivedAt" TIMESTAMP(3),
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
UPDATE "Project" p SET "ownerId"=(SELECT m."userId" FROM "ProjectMembership" m
 WHERE m."projectId"=p.id AND m.role IN ('ADMIN','PRODUCT_OWNER')
 ORDER BY CASE WHEN m.role='ADMIN' THEN 0 ELSE 1 END,m."createdAt",m.id LIMIT 1);
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_status_check" CHECK (status IN ('PLANNED','ACTIVE','ON_HOLD','COMPLETED','ARCHIVED')),
 ADD CONSTRAINT "Project_archive_check" CHECK ((status='ARCHIVED')=("archivedAt" IS NOT NULL)),
 ADD CONSTRAINT "Project_dates_check" CHECK ("startDate" IS NULL OR "targetDate" IS NULL OR "targetDate">="startDate"),
 ADD CONSTRAINT "Project_version_check" CHECK (version>0);
ALTER TABLE "Team" ADD COLUMN code TEXT, ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE',
 ADD COLUMN "responsiblePoId" UUID, ADD COLUMN "archivedAt" TIMESTAMP(3),
 ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
-- UUID-derived legacy codes are deterministic and collision-free; no team is recreated.
UPDATE "Team" t SET code='T-'||upper(replace(t.id::text,'-','')),
 "responsiblePoId"=p."ownerId" FROM "Project" p WHERE p.id=t."projectId";
ALTER TABLE "Team" ALTER COLUMN code SET NOT NULL;
ALTER TABLE "Team" ADD CONSTRAINT "Team_responsiblePoId_fkey" FOREIGN KEY ("responsiblePoId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "Team_projectId_responsiblePoId_fkey" FOREIGN KEY ("projectId","responsiblePoId") REFERENCES "ProjectMembership"("projectId","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT "Team_status_check" CHECK (status IN ('ACTIVE','ON_HOLD','ARCHIVED')),
 ADD CONSTRAINT "Team_archive_check" CHECK ((status='ARCHIVED')=("archivedAt" IS NOT NULL)),
 ADD CONSTRAINT "Team_version_check" CHECK (version>0);
CREATE UNIQUE INDEX "Team_projectId_code_key" ON "Team"("projectId",code);
CREATE INDEX "Team_projectId_status_archivedAt_idx" ON "Team"("projectId",status,"archivedAt");
CREATE INDEX "Project_archivedAt_status_idx" ON "Project"("archivedAt",status);
