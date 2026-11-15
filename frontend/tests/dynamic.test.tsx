import React from "react";
import { transferableAbortController } from "node:util";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { Dialog } from "../src/components/ui";
import { TicketPicker } from "../src/components/TicketPicker";
import { EntityHistory } from "../src/components/EntityHistory";
import { markDraftSaved } from "../src/services/drafts";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/hooks/useProject", () => ({
  useProjectQuery: (path: string) => query(path),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Guided data entry", () => {
  it("blocks route changes while an unsaved modal draft is retained", async () => {
    // React Router uses Node's Request in jsdom; pair it with a Node-compatible signal.
    vi.stubGlobal("AbortController", function () {
      return transferableAbortController();
    });
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <Dialog title="Unsaved ticket" onClose={() => {}}>
            <input aria-label="Requirement draft" />
          </Dialog>
        ),
      },
      { path: "/next", element: <h1>Next page</h1> },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.input(screen.getByLabelText("Requirement draft"), {
      target: { value: "Retain this work" },
    });
    await act(async () => {
      await router.navigate("/next");
    });
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByLabelText("Requirement draft")).toHaveValue(
      "Retain this work",
    );
    await act(async () => {
      markDraftSaved();
      await router.navigate("/next");
    });
    expect(router.state.location.pathname).toBe("/next");
  });
  it("exposes older audit pages and persistent comment bodies", () => {
    query.mockReturnValue({
      data: {
        data: [
          {
            id: "event",
            action: "reviewItem.commented",
            actor: { name: "A Product Owner" },
            changes: { body: "Confirmed requirement" },
            createdAt: new Date().toISOString(),
          },
        ],
        meta: { total: 31 },
      },
      isPending: false,
      error: null,
    });
    render(<EntityHistory entityId="record" />);
    expect(screen.getByText("Confirmed requirement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Older history" }));
    expect(query).toHaveBeenLastCalledWith(
      "/audit-events?entityId=record&page=2",
    );
  });
  it("keeps an unsaved draft when discard is declined", () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = vi.fn();
    const close = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <Dialog title="Edit requirements" onClose={close}>
        <input aria-label="Draft" />
        <button type="button" onClick={close}>
          Cancel
        </button>
      </Dialog>,
    );
    fireEvent.input(screen.getByLabelText("Draft"), {
      target: { value: "Keep this requirement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Draft")).toHaveValue("Keep this requirement");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(close).not.toHaveBeenCalled();
  });
  it("loads project-scoped matches by title and returns the selected record", () => {
    query.mockReturnValue({
      data: {
        data: [
          { id: "ticket-a", identifier: "APP-1", title: "Readable title" },
        ],
        meta: { total: 1 },
      },
      isPending: false,
      error: null,
    });
    const change = vi.fn();
    render(
      <TicketPicker label="Parent ticket" value={null} onChange={change} />,
    );
    fireEvent.change(
      screen.getByLabelText("Search by ticket title or identifier"),
      { target: { value: "Readable" } },
    );
    expect(query).toHaveBeenLastCalledWith(
      "/tickets?limit=100&search=Readable",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Parent ticket" }), {
      target: { value: "ticket-a" },
    });
    expect(change).toHaveBeenCalledWith(
      "ticket-a",
      expect.arrayContaining([
        expect.objectContaining({ title: "Readable title" }),
      ]),
    );
  });
  it("shows a recoverable selector error instead of pretending the project has no tickets", () => {
    const retry = vi.fn();
    query.mockReturnValue({
      error: new Error("Network unavailable"),
      isPending: false,
      refetch: retry,
    });
    render(
      <TicketPicker label="Related ticket" value={null} onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
