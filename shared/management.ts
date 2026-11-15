import { z } from "zod";
export const projectStatuses = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
] as const;
export const teamStatuses = ["ACTIVE", "ON_HOLD"] as const;
const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9-]{1,39}$/,
    "Use 2–40 uppercase letters, numbers or hyphens; start with a letter",
  );
const projectFields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(3000),
  status: z.enum(projectStatuses),
  startDate: z.string().date().nullable(),
  targetDate: z.string().date().nullable(),
  ownerId: z.string().uuid(),
});
const dates = (x: { startDate?: string | null; targetDate?: string | null }) =>
  !x.startDate || !x.targetDate || x.targetDate >= x.startDate;
export const projectCreateSchema = projectFields
  .extend({
    description: projectFields.shape.description.default(""),
    status: projectFields.shape.status.default("ACTIVE"),
    startDate: projectFields.shape.startDate.default(null),
    targetDate: projectFields.shape.targetDate.default(null),
    ownerId: projectFields.shape.ownerId.optional(),
    code: code.optional(),
  })
  .refine(dates, {
    path: ["targetDate"],
    message: "Target date must be on or after the start date",
  });
export const projectUpdateSchema = projectFields
  .partial()
  .extend({
    version: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .refine(dates, {
    path: ["targetDate"],
    message: "Target date must be on or after the start date",
  });
const teamFields = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(3000),
  code,
  responsiblePoId: z.string().uuid(),
  status: z.enum(teamStatuses),
});
export const teamCreateSchema = teamFields.extend({
  description: teamFields.shape.description.default(""),
  code: code.optional(),
  status: teamFields.shape.status.default("ACTIVE"),
});
export const teamUpdateSchema = teamFields
  .partial()
  .extend({
    version: z.number().int().positive(),
    archived: z.boolean().optional(),
  });
