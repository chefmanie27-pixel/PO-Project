import React from "react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "../src/features/dashboard/Dashboard";
import { TicketEditor, Backlog } from "../src/features/tickets/Tickets";
import { SprintBoard } from "../src/features/sprints/Sprints";
import { ReviewQueue } from "../src/features/productivity/Records";
const { mutate, query } = vi.hoisted(() => ({
  mutate: vi.fn(),
  query: vi.fn(),
}));
vi.mock("../src/hooks/useProject", () => ({
  useProjectQuery: (path: string) => query(path),
  useProjectMutation: () => ({ mutate, isPending: false, error: null }),
}));
vi.mock("../src/app/Workspace", () => ({
  useWorkspace: () => ({
    profile: { id: "00000000-0000-4000-8000-000000000001", name: "Ada Owner" },
    projects: [{ id: "p", name: "Project" }],
    projectId: "p",
  }),
  NewButton: ({ onClick, children }: any) => (
    <button onClick={onClick}>{children || "New ticket"}</button>
  ),
}));
const ticket = {
  id: "t",
  identifier: "PO-1",
  title: "Build clear requirements",
  type: "TASK",
  priority: "HIGH",
  status: "READY",
  owner: { name: "Ada" },
  team: { name: "Platform" },
  blockers: [],
  version: 2,
};
beforeEach(() => {
  mutate.mockReset();
  query.mockImplementation((path: string) => ({
    data: {
      data:
        path === "/memberships"
          ? [
              {
                user: {
                  id: "00000000-0000-4000-8000-000000000001",
                  name: "Ada Owner",
                },
              },
            ]
          : [],
      meta: { total: 0 },
    },
    isPending: false,
    error: null,
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(cleanup);
describe("Product Owner workflows", () => {
  it("renders actual dashboard response counts", () => {
    query.mockImplementation((path: string) => ({
      data: {
        data: path.startsWith("/dashboard")
          ? {
              total: 7,
              counts: {
                BACKLOG: 1,
                READY: 2,
                IN_PROGRESS: 2,
                IN_REVIEW: 1,
                DONE: 1,
              },
              blocked: 0,
              sprints: [],
              decisions: [],
              reviews: [],
              blockers: [],
              indicators: [],
              recent: [],
            }
          : [],
      },
      isPending: false,
    }));
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText("Good to see you, Ada.")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Tickets with Done status")).toBeInTheDocument();
  });
  it("validates ticket title before calling the API", async () => {
    render(<TicketEditor onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("at least 3"),
    );
    expect(mutate).not.toHaveBeenCalled();
  });
  it("submits a ticket with required PO ownership", async () => {
    render(<TicketEditor onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "A new shared requirement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({
      path: "/tickets",
      data: {
        title: "A new shared requirement",
        ownerId: "00000000-0000-4000-8000-000000000001",
      },
    });
  });
  it("preserves ticket version during board status changes", () => {
    render(
      <MemoryRouter>
        <SprintBoard tickets={[ticket]} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Move PO-1" }), {
      target: { value: "IN_PROGRESS" },
    });
    expect(mutate).toHaveBeenCalledWith({
      path: "/tickets/t",
      method: "PATCH",
      data: { version: 2, status: "IN_PROGRESS" },
    });
  });
  it("presents review ownership and opens management", () => {
    const edit = vi.fn();
    render(
      <MemoryRouter>
        <ReviewQueue
          records={[
            {
              id: "r",
              title: "Confirm acceptance criteria",
              status: "OPEN",
              priority: "HIGH",
              owner: { name: "Ada" },
              updatedAt: "2026-11-15T00:00:00Z",
            },
          ]}
          onEdit={edit}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage →" }));
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: "r" }));
  });
  it("passes backlog filters into the query", () => {
    render(
      <MemoryRouter>
        <Backlog />
      </MemoryRouter>,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter priority" }),
      { target: { value: "HIGH" } },
    );
    expect(query).toHaveBeenCalledWith("/tickets?priority=HIGH");
  });
});
