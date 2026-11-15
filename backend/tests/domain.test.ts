import { describe, it, expect } from "vitest";
import {
  ticketSchema,
  ticketUpdateSchema,
  sprintSchema,
  canTransition,
  wouldCycle,
  reviewIndicators,
} from "../../shared/schemas.js";
describe("Ticket integrity rules", () => {
  it("never applies creation defaults to a partial update", () => {
    expect(
      ticketUpdateSchema.parse({ version: 2, status: "IN_PROGRESS" }),
    ).toEqual({ version: 2, status: "IN_PROGRESS" });
  });
  it("requires a responsible PO and valid title", () => {
    expect(ticketSchema.safeParse({ title: "Valid title" }).success).toBe(
      false,
    );
    expect(ticketSchema.safeParse({ title: "Ok", ownerId: "a" }).success).toBe(
      false,
    );
  });
  it("accepts a canonical ticket with optional team and sprint", () => {
    const t = ticketSchema.parse({
      title: "Implement shared backlog",
      ownerId: "00000000-0000-4000-8000-000000000001",
    });
    expect(t.status).toBe("BACKLOG");
    expect(t.sprintId).toBeNull();
  });
  it("rejects skipped transitions and supports review reconciliation", () => {
    expect(canTransition("BACKLOG", "DONE")).toBe(false);
    expect(canTransition("IN_PROGRESS", "IN_REVIEW")).toBe(true);
    expect(canTransition("DONE", "IN_REVIEW")).toBe(true);
  });
  it("rejects self and transitive dependency cycles", () => {
    expect(wouldCycle([], "a", "a")).toBe(true);
    expect(
      wouldCycle(
        [
          { ticketId: "b", dependsOnId: "c" },
          { ticketId: "c", dependsOnId: "a" },
        ],
        "a",
        "b",
      ),
    ).toBe(true);
    expect(wouldCycle([{ ticketId: "b", dependsOnId: "c" }], "a", "b")).toBe(
      false,
    );
  });
  it("derives stable review indicators without creating records", () => {
    const ticket = {
      id: "a",
      identifier: "PO-1",
      description: "",
      acceptanceCriteria: "",
      status: "IN_REVIEW",
    };
    expect(reviewIndicators(ticket)).toHaveLength(3);
    expect(reviewIndicators(ticket)).toEqual(reviewIndicators(ticket));
  });
  it("rejects reversed sprint dates", () =>
    expect(
      sprintSchema.safeParse({
        name: "Sprint 1",
        goal: "",
        startDate: "2026-11-20T00:00:00Z",
        endDate: "2026-11-10T00:00:00Z",
      }).success,
    ).toBe(false));
});
