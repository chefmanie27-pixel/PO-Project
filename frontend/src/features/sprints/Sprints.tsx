import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  sprintSchema,
  statuses,
  transitions,
} from "../../../../shared/schemas";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import { NewButton } from "../../app/Workspace";
import {
  Dialog,
  PageHeader,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/ui";
import { TicketCard, TicketTable } from "../tickets/Tickets";
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
  } = useForm<
    z.input<typeof sprintSchema>,
    unknown,
    z.output<typeof sprintSchema>
  >({ resolver: zodResolver(sprintSchema), defaultValues: sprint });
  return (
    <Dialog title={sprint ? "Edit sprint" : "Create sprint"} onClose={onClose}>
      <form
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            {
              path: sprint ? `/sprints/${sprint.id}` : "/sprints",
              method: sprint ? "PATCH" : "POST",
              data,
            },
            { onSuccess: onClose },
          ),
        )}
      >
        <label>
          Sprint name
          <input {...register("name")} />
          {errors.name && <small role="alert">{errors.name.message}</small>}
        </label>
        <label>
          Sprint goal
          <textarea {...register("goal")} />
        </label>
        <label>
          Start date
          <input
            type="datetime-local"
            defaultValue={sprint?.startDate.slice(0, 16)}
            {...register("startDate", {
              setValueAs: (v) => (v ? new Date(v).toISOString() : ""),
            })}
          />
          {errors.startDate && (
            <small role="alert">Choose a valid start date</small>
          )}
        </label>
        <label>
          End date
          <input
            type="datetime-local"
            defaultValue={sprint?.endDate.slice(0, 16)}
            {...register("endDate", {
              setValueAs: (v) => (v ? new Date(v).toISOString() : ""),
            })}
          />
          {errors.endDate && (
            <small role="alert">{errors.endDate.message}</small>
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
export function SprintBoard({ tickets }: { tickets: any[] }) {
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
      <div className="board">
        {statuses.map((status) => (
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
              if (ticket) move(ticket, status);
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
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", t.id)
                  }
                >
                  <TicketCard ticket={t} />
                  <select
                    aria-label={`Move ${t.identifier}`}
                    value={t.status}
                    onChange={(e) => move(t, e.target.value)}
                    disabled={mutation.isPending}
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
  const { id } = useParams();
  const [editor, setEditor] = useState<any>(false),
    [view, setView] = useState("board");
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
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
          <NewButton onClick={() => setEditor(sprint || {})}>
            {sprint ? "Edit sprint" : "New sprint"}
          </NewButton>
        }
      />
      {id && !sprint ? (
        <EmptyState text="Sprint not found." />
      ) : sprint ? (
        <>
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
            <SprintBoard tickets={sprint.tickets} />
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
                <span className="eyebrow">SPRINT</span>
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
            <EmptyState text="Create your first sprint." />
          )}
        </div>
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
