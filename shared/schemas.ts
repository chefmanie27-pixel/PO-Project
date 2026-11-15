import { z } from "zod";
export const statuses = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
] as const;
export const priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const types = ["EPIC", "FEATURE", "USER_STORY", "TASK", "BUG"] as const;
const id = z.string().uuid();
export const ticketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters for the title")
    .max(200),
  description: z.string().max(20000).default(""),
  type: z.enum(types).default("USER_STORY"),
  userStory: z.string().max(10000).default(""),
  acceptanceCriteria: z.string().max(10000).default(""),
  priority: z.enum(priorities).default("MEDIUM"),
  status: z.enum(statuses).default("BACKLOG"),
  ownerId: id,
  teamId: id.nullable().default(null),
  sprintId: id.nullable().default(null),
  parentId: id.nullable().default(null),
  rank: z.number().int().min(0).default(0),
});
export const ticketUpdateSchema = ticketSchema.partial().extend({
  description: ticketSchema.shape.description.removeDefault().optional(),
  type: ticketSchema.shape.type.removeDefault().optional(),
  userStory: ticketSchema.shape.userStory.removeDefault().optional(),
  acceptanceCriteria: ticketSchema.shape.acceptanceCriteria
    .removeDefault()
    .optional(),
  priority: ticketSchema.shape.priority.removeDefault().optional(),
  status: ticketSchema.shape.status.removeDefault().optional(),
  teamId: ticketSchema.shape.teamId.removeDefault().optional(),
  sprintId: ticketSchema.shape.sprintId.removeDefault().optional(),
  parentId: ticketSchema.shape.parentId.removeDefault().optional(),
  rank: ticketSchema.shape.rank.removeDefault().optional(),
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
});
export const sprintSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    goal: z.string().max(3000).default(""),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  })
  .refine((x) => x.endDate > x.startDate, {
    message: "End date must follow start date",
    path: ["endDate"],
  });
export const blockerSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(10000),
  ticketId: id.nullable().default(null),
  ownerId: id,
  severity: z.enum(priorities).default("HIGH"),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED"]).default("OPEN"),
  resolutionNotes: z.string().max(10000).default(""),
});
export const reviewSchema = z.object({
  title: z.string().trim().min(3).max(200),
  ticketId: id.nullable().default(null),
  ownerId: id,
  category: z.enum([
    "MISSING_REQUIREMENTS",
    "UNCLEAR_CRITERIA",
    "DECISION_NEEDED",
    "AWAITING_APPROVAL",
    "QUESTION",
    "PO_INPUT",
  ]),
  priority: z.enum(priorities).default("MEDIUM"),
  notes: z.string().max(10000).default(""),
  status: z.enum(["OPEN", "RESOLVED"]).default("OPEN"),
});
export const decisionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(10000),
  rationale: z.string().trim().min(3).max(10000),
  impact: z.string().max(10000).default(""),
  status: z.enum(["PROPOSED", "APPROVED", "SUPERSEDED"]).default("PROPOSED"),
  ticketIds: z.array(id).max(100).default([]),
  decisionDate: z.string().datetime().optional(),
});
export const transitions: Record<string, readonly string[]> = {
  BACKLOG: ["READY"],
  READY: ["BACKLOG", "IN_PROGRESS"],
  IN_PROGRESS: ["READY", "IN_REVIEW"],
  IN_REVIEW: ["IN_PROGRESS", "DONE"],
  DONE: ["IN_REVIEW"],
};
export function canTransition(from: string, to: string) {
  return from === to || !!transitions[from]?.includes(to);
}
export function wouldCycle(
  edges: { ticketId: string; dependsOnId: string }[],
  source: string,
  target: string,
) {
  const seen = new Set<string>();
  const visit = (node: string): boolean => {
    if (node === source) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    return edges
      .filter((e) => e.ticketId === node)
      .some((e) => visit(e.dependsOnId));
  };
  return visit(target);
}
export function reviewIndicators(ticket: {
  description: string;
  acceptanceCriteria: string;
  status: string;
  id: string;
  identifier: string;
}) {
  return [
    !ticket.description.trim() ? "Missing requirements" : null,
    !ticket.acceptanceCriteria.trim() ? "Unclear acceptance criteria" : null,
    ticket.status === "IN_REVIEW" ? "Awaiting approval" : null,
  ]
    .filter((x): x is string => !!x)
    .map((category) => ({
      id: `${ticket.id}:${category}`,
      ticketId: ticket.id,
      title: `${ticket.identifier}: ${category}`,
      category,
      automatic: true,
    }));
}
