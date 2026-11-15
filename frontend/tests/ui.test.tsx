import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../src/components/ui";
import { TicketTable } from "../src/features/tickets/Tickets";
afterEach(cleanup);
describe("Workspace components", () => {
  it("announces loading", () => {
    render(<LoadingSkeleton />);
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Loading workspace",
    );
  });
  it("shows a useful empty state", () => {
    render(<EmptyState text="No unresolved blockers." />);
    expect(screen.getByText("No unresolved blockers.")).toBeInTheDocument();
  });
  it("renders status as text, not color alone", () => {
    render(<StatusBadge value="IN_REVIEW" />);
    expect(screen.getByText("In Review")).toBeInTheDocument();
  });
  it("renders canonical ticket links and ownership", () => {
    render(
      <MemoryRouter>
        <TicketTable
          tickets={[
            {
              id: "ticket",
              identifier: "PO-1",
              title: "Shared requirements",
              status: "READY",
              priority: "HIGH",
              type: "TASK",
              owner: { name: "Ada" },
              team: { name: "Platform" },
              blockers: [],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Shared requirements" }),
    ).toHaveAttribute("href", "/tickets/ticket");
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });
});
