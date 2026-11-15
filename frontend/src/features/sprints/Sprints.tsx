import { useState } from "react";
import { useParams } from "react-router-dom";
import { ProjectLink as Link } from "../../components/ProjectLink";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  sprintSchema,
  statuses,
  transitions,
} from "../../../../shared/schemas";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import { NewButton, useWorkspace } from "../../app/Workspace";
import {
  Dialog,
  PageHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "../../components/ui";
import { TicketCard, TicketTable } from "../tickets/Tickets";
import { TicketPicker } from "../../components/TicketPicker";
import { label } from "../../services/api";
function SprintEditor({
  sprint,
  onClose,
}: {
  sprint?: any;
  onClose: () => void;
}) {
  const mutation = useProjectMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(
      z.preprocess(
        (input: any) => ({
          ...input,
          startDate:
            input.startDate && !isNaN(Date.parse(input.startDate))
              ? new Date(input.startDate).toISOString()
              : "",
          endDate:
            input.endDate && !isNaN(Date.parse(input.endDate))
              ? new Date(input.endDate).toISOString()
              : "",
        }),
        sprintSchema,
      ),
    ),
    defaultValues: sprint
      ? {
          ...sprint,
          startDate: localDateTime(sprint.startDate),
          endDate: localDateTime(sprint.endDate),
        }
      : {},
  });
  return (
    <Dialog title={sprint ? "Edit sprint" : "Create sprint"} onClose={onClose}>
      <form
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            {
              path: sprint ? `/sprints/${sprint.id}` : "/sprints",
              method: sprint ? "PATCH" : "POST",
              data: { ...data, ...(sprint ? { version: sprint.version } : {}) },
            },
            { onSuccess: onClose },
          ),
        )}
      >
        <label>
          Sprint name
          <input {...register("name")} />
          {errors.name && (
            <small role="alert">{String(errors.name.message)}</small>
          )}
        </label>
        <label>
          Sprint goal
          <textarea {...register("goal")} />
        </label>
        <label>
          Start date
          <input type="datetime-local" {...register("startDate")} />
          {errors.startDate && (
            <small role="alert">Choose a valid start date</small>
          )}
        </label>
        <label>
          End date
          <input type="datetime-local" {...register("endDate")} />
          {errors.endDate && (
            <small role="alert">{String(errors.endDate.message)}</small>
          )}
        </label>
        {mutation.error && <ErrorState error={mutation.error} />}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={mutation.isPending}>
            Save sprint
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function SprintBoard({
  tickets,
  readOnly = false,
}: {
  tickets: any[];
  readOnly?: boolean;
}) {
  const mutation = useProjectMutation();
  const move = (ticket: any, status: string) =>
    mutation.mutate({
      path: `/tickets/${ticket.id}`,
      method: "PATCH",
      data: { version: ticket.version, status },
    });
  return (
    <>
      {mutation.error && <ErrorState error={mutation.error} />}
      {tickets.some((t) => t.status === "BACKLOG") && (
        <section className="panel detail-panel">
          <h2>Selected backlog tickets</h2>
          <p className="muted">
            These tickets are selected for this sprint. Starting the sprint
            makes them Ready; you can also prepare them individually.
          </p>
          {tickets
            .filter((t) => t.status === "BACKLOG")
            .map((t) => (
              <div className="mini-record" key={t.id}>
                <Link to={`/tickets/${t.id}`}>
                  {t.identifier} - {t.title}
                </Link>
                <button
                  disabled={readOnly || mutation.isPending}
                  onClick={() => move(t, "READY")}
                >
                  Move {t.identifier} to Ready
                </button>
              </div>
            ))}
        </section>
      )}
      <div className="board">
        {statuses
          .filter((s) => s !== "BACKLOG")
          .map((status) => (
            <section
              className="board-column"
              key={status}
              aria-label={label(status)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const ticket = tickets.find(
                  (t) => t.id === e.dataTransfer.getData("text/plain"),
                );
                if (
                  ticket &&
                  !readOnly &&
                  !mutation.isPending &&
                  transitions[ticket.status]?.includes(status)
                )
                  move(ticket, status);
              }}
            >
              <h2>
                {label(status)}{" "}
                <span className="count">
                  {tickets.filter((t) => t.status === status).length}
                </span>
              </h2>
              {tickets
                .filter((t) => t.status === status)
                .map((t) => (
                  <div
                    key={t.id}
                    draggable={!readOnly && !mutation.isPending}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", t.id)
                    }
                  >
                    <TicketCard ticket={t} />
                    <select
                      aria-label={`Move ${t.identifier}`}
                      value={t.status}
                      onChange={(e) => move(t, e.target.value)}
                      disabled={mutation.isPending || readOnly}
                    >
                      <option value={t.status}>{label(t.status)}</option>
                      {transitions[t.status]?.map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
            </section>
          ))}
      </div>
    </>
  );
}
export function Sprints() {
  const query = useProjectQuery("/sprints");
  const { sprintId: id } = useParams();
  const [editor, setEditor] = useState<any>(false),
    [view, setView] = useState("board"),
    [transition, setTransition] = useState(false),
    [notice, setNotice] = useState("");
  const { project } = useWorkspace();
  const mutation = useProjectMutation();
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const sprint = id ? query.data.data.find((s: any) => s.id === id) : null;
  return (
    <>
      <PageHeader
        eyebrow="ALIGN & DELIVER"
        title={sprint ? sprint.name : "Sprint management"}
        description={
          sprint
            ? sprint.goal
            : "Turn a shared goal into focused team delivery."
        }
        action={
          sprint?.status !== "COMPLETED" ? (
            <NewButton onClick={() => setEditor(sprint || {})}>
              {sprint ? "Edit sprint" : "New sprint"}
            </NewButton>
          ) : undefined
        }
      />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {id && !sprint ? (
        <EmptyState text="Sprint not found." />
      ) : sprint ? (
        <>
          <div className="dashboard-toolbar">
            <StatusBadge value={sprint.status || "PLANNED"} />
            {!project?.archivedAt && sprint.status !== "COMPLETED" && (
              <button className="primary" onClick={() => setTransition(true)}>
                {sprint.status === "ACTIVE"
                  ? "Complete sprint"
                  : "Start sprint"}
              </button>
            )}
          </div>
          {sprint.status !== "COMPLETED" && !project?.archivedAt && (
            <SprintPlanning sprint={sprint} />
          )}
          <div className="dashboard-toolbar">
            <p>
              {new Date(sprint.startDate).toLocaleDateString()} —{" "}
              {new Date(sprint.endDate).toLocaleDateString()} ·{" "}
              {sprint.tickets.filter((t: any) => t.status === "DONE").length}/
              {sprint.tickets.length} tickets complete ·{" "}
              {sprint.tickets.filter((t: any) => t.blockers?.length).length}{" "}
              blocked
            </p>
            <div className="button-row">
              <button
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                Board
              </button>
              <button
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                List
              </button>
            </div>
          </div>
          {view === "board" ? (
            <SprintBoard
              tickets={sprint.tickets}
              readOnly={sprint.status === "COMPLETED" || !!project?.archivedAt}
            />
          ) : (
            <TicketTable tickets={sprint.tickets} />
          )}
          <p className="muted small">
            Drag a ticket or use its status selector. Assign tickets from the
            backlog editor. Ticket completion does not measure business value.
          </p>
        </>
      ) : (
        <div className="cards-grid">
          {query.data.data.map((s: any) => {
            const done = s.tickets.filter(
              (t: any) => t.status === "DONE",
            ).length;
            return (
              <Link
                to={`/sprints/${s.id}`}
                className="panel sprint-card"
                key={s.id}
              >
                <StatusBadge value={s.status || "PLANNED"} />
                <h2>{s.name}</h2>
                <p>{s.goal || "No goal set"}</p>
                <small>
                  {new Date(s.startDate).toLocaleDateString()} —{" "}
                  {new Date(s.endDate).toLocaleDateString()}
                </small>
                <div className="progress">
                  <span
                    style={{
                      width: `${s.tickets.length ? (done / s.tickets.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="card-footer">
                  {done} / {s.tickets.length} complete <span>Open board →</span>
                </div>
              </Link>
            );
          })}
          {!query.data.data.length && (
            <EmptyState
              text="Create a sprint when your team is ready to plan work."
              action={
                <NewButton onClick={() => setEditor({})}>
                  Create your first sprint
                </NewButton>
              }
            />
          )}
        </div>
      )}
      {transition && sprint && (
        <Dialog
          title={
            sprint.status === "ACTIVE" ? "Complete sprint?" : "Start sprint?"
          }
          onClose={() => setTransition(false)}
        >
          <p>
            {sprint.status === "ACTIVE"
              ? "Completed tickets stay in this sprint. Any unfinished tickets will return to the product backlog; their requirements, comments and history are preserved."
              : "Selected backlog tickets will become Ready. Only one sprint can be active in a project."}
          </p>
          <div className="form-actions">
            <button onClick={() => setTransition(false)}>Cancel</button>
            <button
              className="primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate(
                  {
                    path: `/sprints/${sprint.id}/transition`,
                    data: {
                      version: sprint.version,
                      action: sprint.status === "ACTIVE" ? "COMPLETE" : "START",
                      returnUnfinishedToBacklog: true,
                    },
                  },
                  {
                    onSuccess: () => {
                      setTransition(false);
                      setNotice("Sprint updated.");
                    },
                  },
                )
              }
            >
              Confirm {sprint.status === "ACTIVE" ? "completion" : "start"}
            </button>
          </div>
          {mutation.error && <ErrorState error={mutation.error} />}
        </Dialog>
      )}
      {editor && (
        <SprintEditor
          sprint={editor.id ? editor : undefined}
          onClose={() => setEditor(false)}
        />
      )}
    </>
  );
}

function SprintPlanning({ sprint }: { sprint: any }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const mutation = useProjectMutation();
  const [chosen, setChosen] = useState<any>(null);
  return (
    <details className="panel detail-panel">
      <summary>Plan sprint tickets</summary>
      <p className="muted">
        Select a ticket from this project to assign it. Removing unfinished work
        returns it to the backlog without deleting it.
      </p>
      <TicketPicker
        label="Ticket to add"
        value={selected}
        onChange={(value, rows) => {
          setSelected(value);
          setChosen(rows?.find((t) => t.id === value));
        }}
        exclude={sprint.tickets.map((t: any) => t.id)}
      />

      <button
        className="primary"
        disabled={!chosen || mutation.isPending}
        onClick={() =>
          mutation.mutate(
            {
              path: `/tickets/${chosen.id}`,
              method: "PATCH",
              data: { version: chosen.version, sprintId: sprint.id },
            },
            {
              onSuccess: () => {
                setSelected(null);
                setNotice("Ticket assigned to sprint.");
              },
            },
          )
        }
      >
        Add to sprint
      </button>
      {notice && <p role="status">{notice}</p>}
      <ul className="planning-list">
        {sprint.tickets.map((t: any) => (
          <li key={t.id}>
            <Link to={`/tickets/${t.id}`}>
              {t.identifier} - {t.title}
            </Link>
            <StatusBadge value={t.status} />
            <button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate(
                  {
                    path: `/tickets/${t.id}`,
                    method: "PATCH",
                    data: { version: t.version, sprintId: null },
                  },
                  { onSuccess: () => setNotice("Ticket removed from sprint.") },
                )
              }
            >
              Remove from sprint
            </button>
          </li>
        ))}
      </ul>
      {mutation.error && <ErrorState error={mutation.error} />}
    </details>
  );
}

function localDateTime(value: string) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
