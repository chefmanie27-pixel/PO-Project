-- Defense in depth for operators and future write paths.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_workflow_check" CHECK ("status" IN ('BACKLOG','READY','IN_PROGRESS','IN_REVIEW','DONE'));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_priority_check" CHECK ("priority" IN ('CRITICAL','HIGH','MEDIUM','LOW'));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_type_check" CHECK ("type" IN ('EPIC','FEATURE','USER_STORY','TASK','BUG'));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_version_check" CHECK ("version" > 0);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_self_check" CHECK ("ticketId" <> "dependsOnId");
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_dates_check" CHECK ("endDate" > "startDate");
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_role_check" CHECK ("role" IN ('ADMIN','PRODUCT_OWNER','SCRUM_MASTER','DEVELOPER','DESIGNER','QA'));
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_status_check" CHECK ("status" IN ('OPEN','INVESTIGATING','RESOLVED'));
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_resolution_check" CHECK (("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND LENGTH(TRIM("resolutionNotes")) > 0) OR ("status" <> 'RESOLVED' AND "resolvedAt" IS NULL));
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_status_check" CHECK ("status" IN ('PROPOSED','APPROVED','SUPERSEDED'));
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_status_check" CHECK ("status" IN ('OPEN','RESOLVED'));
