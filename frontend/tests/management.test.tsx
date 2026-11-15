import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Projects } from "../src/features/projects/Projects";
import { Teams } from "../src/features/teams/Teams";
import { TicketTable } from "../src/features/tickets/Tickets";
const { mutate, projects, profile, query } = vi.hoisted(() => ({
  mutate: vi.fn(),
  projects: [
    {
      id: "p",
      name: "Aurora",
      description: "Product A",
      key: "AUR",
      status: "ACTIVE",
      version: 1,
      updatedAt: "2026-11-15T00:00:00Z",
      memberships: [{ role: "PRODUCT_OWNER" }],
      _count: { teams: 2, tickets: 3, blockers: 1 },
      sprints: [],
    },
    {
      id: "b",
      name: "Archived product",
      key: "OLD",
      status: "ARCHIVED",
      archivedAt: "2026-11-15",
      updatedAt: "2026-11-15",
      memberships: [{ role: "PRODUCT_OWNER" }],
    },
  ],
  profile: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Ada",
    memberships: [{ projectId: "p", role: "PRODUCT_OWNER" }],
  },
  query: vi.fn(),
}));
vi.mock("../src/app/Account", () => ({
  useAccount: () => ({ profile, projects }),
}));
vi.mock("../src/app/Workspace", () => ({
  useWorkspace: () => ({
    profile,
    role: "PRODUCT_OWNER",
    project: projects[0],
  }),
  NewButton: ({ onClick, children }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));
vi.mock("../src/hooks/useProject", () => ({
  useProjectQuery: (path: string) => query(path),
  useProjectMutation: () => ({ mutate, isPending: false }),
}));
beforeEach(() => {
  mutate.mockReset();
  query.mockImplementation((path: string) => ({
    data: {
      data: path.startsWith("/teams")
        ? [
            {
              id: "t",
              name: "Custom team",
              description: "Own team",
              code: "CUSTOM",
              status: "ACTIVE",
              version: 4,
              responsiblePoId: profile.id,
              responsiblePo: { name: "Ada", email: "ada@example.invalid" },
              tickets: [],
            },
          ]
        : [{ user: profile, role: "PRODUCT_OWNER" }],
    },
    isPending: false,
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(cleanup);
const renderApp = (element: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
describe("Project and custom team interface", () => {
  it("shows project-specific metrics and supports search and archive filtering", () => {
    renderApp(<Projects />);
    expect(screen.getByRole("heading", { name: "Aurora" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Archived product" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search projects"), {
      target: { value: "Missing" },
    });
    expect(
      screen.queryByRole("heading", { name: "Aurora" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search projects"), {
      target: { value: "" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter projects by status" }),
      { target: { value: "ARCHIVED" } },
    );
    expect(
      screen.getByRole("heading", { name: "Archived product" }),
    ).toBeInTheDocument();
  });
  it("lets a PO open and validate project creation", async () => {
    renderApp(<Projects />);
    fireEvent.click(screen.getByRole("button", { name: /Create New Project/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save project" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Name"),
    );
  });
  it("requires confirmation before archiving a team", () => {
    renderApp(<Teams />);
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive team", exact: true }),
    );
    expect(mutate.mock.calls[0][0]).toMatchObject({
      path: "/teams/t",
      method: "PATCH",
      data: { version: 4, archived: true },
    });
  });
  it("edits an existing custom team using its record version", async () => {
    renderApp(<Teams />);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit team", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Renamed team" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save team" }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({
      path: "/teams/t",
      method: "PATCH",
      data: { name: "Renamed team", version: 4 },
    });
  });
  it("includes the URL project in ticket detail links", () => {
    render(
      <MemoryRouter initialEntries={["/projects/project-a/backlog"]}>
        <Routes>
          <Route
            path="/projects/:projectId/backlog"
            element={
              <TicketTable
                tickets={[
                  {
                    id: "ticket",
                    identifier: "A-1",
                    title: "Scoped ticket",
                    status: "READY",
                    priority: "HIGH",
                    type: "TASK",
                    owner: { name: "Ada" },
                  },
                ]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Scoped ticket" })).toHaveAttribute(
      "href",
      "/projects/project-a/tickets/ticket",
    );
  });
});
