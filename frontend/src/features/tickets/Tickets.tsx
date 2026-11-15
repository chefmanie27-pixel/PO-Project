import { EntityHistory } from "../../components/EntityHistory";
import { TicketPicker } from "../../components/TicketPicker";
import { useEffect, useState, useId, type ReactNode } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ProjectLink as Link } from "../../components/ProjectLink";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Search,
  ArrowUpRight,
  GripVertical,
  MessageSquare,
  ArrowLeft,
} from "lucide-react";
import {
  ticketSchema,
  statuses,
  priorities,
  types,
  transitions,
} from "../../../../shared/schemas";
import { useWorkspace, NewButton } from "../../app/Workspace";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import { label } from "../../services/api";
import {
  Dialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  StatusBadge,
  PriorityBadge,
  ConfirmationDialog,
} from "../../components/ui";
export function POSelector({
  value,
  onChange,
  members,
}: {
  value: string;
  onChange: (v: string) => void;
  members: any[];
}) {
  return (
    <select
      aria-label="Responsible PO"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All Product Owners</option>
      {members.map((m) => (
        <option key={m.user.id} value={m.user.id}>
          {m.user.name}
        </option>
      ))}
    </select>
  );
}
export function TeamSelector({
  value,
  onChange,
  teams,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: any[];
}) {
  return (
    <select
      aria-label="Team"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All teams</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
export function TicketEditor({
  ticket,
  onClose,
}: {
  ticket?: any;
  onClose: () => void;
}) {
  const formId = useId();
  const { profile } = useWorkspace();
  const members = useProjectQuery("/memberships"),
    teams = useProjectQuery("/teams"),
    sprints = useProjectQuery("/sprints");
  const mutation = useProjectMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<
    z.input<typeof ticketSchema>,
    unknown,
    z.output<typeof ticketSchema>
  >({
    resolver: zodResolver(ticketSchema),
    defaultValues: ticket || {
      title: "",
      ownerId: profile.id,
      status: "BACKLOG",
      priority: "MEDIUM",
      type: "USER_STORY",
      teamId: null,
      sprintId: null,
      parentId: null,
    },
  });
  return (
    <Dialog
      title={ticket ? `Edit ${ticket.identifier}` : "Create a ticket"}
      onClose={onClose}
    >
      <form
        data-draft-form
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            {
              path: ticket ? `/tickets/${ticket.id}` : "/tickets",
              method: ticket ? "PATCH" : "POST",
              data: { ...data, ...(ticket ? { version: ticket.version } : {}) },
            },
            { onSuccess: onClose },
          ),
        )}
      >
        <p className="muted small">
          Start with a title. Requirements can be refined later in the backlog.
        </p>
        <label>
          Title
          <input
            autoFocus
            maxLength={200}
            aria-invalid={!!errors.title}
            aria-describedby={
              errors.title ? `${formId}-title-error` : undefined
            }
            {...register("title")}
          />
          {errors.title && (
            <small id={`${formId}-title-error`} role="alert">
              {errors.title.message}
            </small>
          )}
        </label>
        <div className="form-grid">
          <label>
            Type
            <select {...register("type")}>
              {types.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select {...register("priority")}>
              {priorities.map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsible PO
            <select {...register("ownerId")}>
              <option value="">Choose a PO</option>
              {members.data?.data.map((m: any) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
            {errors.ownerId && (
              <small role="alert">Choose a responsible Product Owner</small>
            )}
          </label>
          <label>
            Team
            <select {...register("teamId", { setValueAs: (v) => v || null })}>
              <option value="">Unassigned</option>
              {[
                ...(teams.data?.data || []),
                ...(ticket?.team?.archivedAt ? [ticket.team] : []),
              ].map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sprint
            <select {...register("sprintId", { setValueAs: (v) => v || null })}>
              <option value="">No sprint</option>
              {sprints.data?.data
                .filter(
                  (s: any) =>
                    s.status !== "COMPLETED" || s.id === ticket?.sprintId,
                )
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Status
            <select {...register("status")} disabled={!ticket}>
              {(ticket
                ? [ticket.status, ...(transitions[ticket.status] || [])]
                : ["BACKLOG"]
              ).map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="advanced-fields" open={!!ticket}>
          <summary>Requirements (optional for a backlog draft)</summary>
          <label>
            Description
            <textarea
              rows={3}
              maxLength={20000}
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? `${formId}-description-error` : undefined
              }
              {...register("description")}
            />
            {errors.description && (
              <small id={`${formId}-description-error`} role="alert">
                {errors.description.message}
              </small>
            )}
          </label>
          <label>
            User story
            <textarea
              maxLength={10000}
              aria-invalid={!!errors.userStory}
              aria-describedby={
                errors.userStory ? `${formId}-story-error` : undefined
              }
              placeholder="As a… I want… so that…"
              {...register("userStory")}
            />
            {errors.userStory && (
              <small id={`${formId}-story-error`} role="alert">
                {errors.userStory.message}
              </small>
            )}
          </label>
          <label>
            Acceptance criteria
            <textarea
              rows={3}
              maxLength={10000}
              aria-invalid={!!errors.acceptanceCriteria}
              aria-describedby={
                errors.acceptanceCriteria
                  ? `${formId}-criteria-error`
                  : undefined
              }
              placeholder="Given… When… Then…"
              {...register("acceptanceCriteria")}
            />
            {errors.acceptanceCriteria && (
              <small id={`${formId}-criteria-error`} role="alert">
                {errors.acceptanceCriteria.message}
              </small>
            )}
          </label>
        </details>
        <details className="advanced-fields">
          <summary>Parent ticket</summary>
          <TicketPicker
            label="Parent ticket"
            value={watch("parentId")}
            onChange={(v) => setValue("parentId", v, { shouldDirty: true })}
            exclude={ticket ? [ticket.id] : []}
            selected={ticket?.parent ? [ticket.parent] : []}
          />
        </details>
        {mutation.error && (
          <div className="notice error" role="alert">
            {mutation.error.message}
            {(mutation.error as any).status === 409 && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Discard draft and refresh
              </button>
            )}
          </div>
        )}
        {[members, teams, sprints].map((q, i) =>
          q.error ? (
            <ErrorState
              key={i}
              error={q.error}
              retry={() => void q.refetch()}
            />
          ) : null,
        )}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              mutation.isPending ||
              members.isPending ||
              !!members.error ||
              teams.isPending ||
              !!teams.error ||
              sprints.isPending ||
              !!sprints.error
            }
          >
            {mutation.isPending ? "Saving..." : "Save ticket"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function TicketCard({ ticket }: { ticket: any }) {
  return (
    <article className="ticket-card">
      <div>
        <span className="ticket-id">{ticket.identifier}</span>
        <PriorityBadge value={ticket.priority} />
      </div>
      <Link to={`/tickets/${ticket.id}`}>{ticket.title}</Link>
      <small>{ticket.team?.name || "Unassigned team"}</small>
      {ticket.blockers?.length > 0 && (
        <span className="error-text">● Blocked</span>
      )}
    </article>
  );
}
export function TicketTable({
  tickets,
  onReorder,
  emptyAction,
}: {
  tickets: any[];
  onReorder?: (t: any, d: number) => void;
  emptyAction?: ReactNode;
}) {
  return tickets.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket / title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Team</th>
            <th>Responsible PO</th>
            <th aria-label="Open ticket" />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="ticket-title">
                  {onReorder && (
                    <button
                      className="icon-button"
                      aria-label={`Move ${t.identifier} up`}
                      onClick={() => onReorder(t, -1)}
                    >
                      <GripVertical size={15} />
                    </button>
                  )}
                  <span>
                    <small className="ticket-id">
                      {t.identifier} · {label(t.type)}
                    </small>
                    <Link to={`/tickets/${t.id}`}>{t.title}</Link>
                  </span>
                </div>
              </td>
              <td>
                <StatusBadge value={t.status} />
                {t.blockers?.length > 0 && (
                  <small className="error-text">Blocked</small>
                )}
              </td>
              <td>
                <PriorityBadge value={t.priority} />
              </td>
              <td>{t.team?.name || "—"}</td>
              <td>
                <span className="owner">
                  <i>{t.owner?.name?.slice(0, 2).toUpperCase()}</i>
                  {t.owner?.name || "—"}
                </span>
              </td>
              <td>
                <Link
                  aria-label={`Open ${t.identifier}`}
                  to={`/tickets/${t.id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState
      text="Add your first ticket to start building your product backlog, or adjust the filters."
      action={emptyAction}
    />
  );
}
export function Backlog() {
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState(false);
  const teams = useProjectQuery("/teams?includeArchived=true"),
    members = useProjectQuery("/memberships"),
    sprints = useProjectQuery("/sprints");
  const query = useProjectQuery(`/tickets?${params}`);
  const mutation = useProjectMutation();
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <>
      <PageHeader
        eyebrow="PLAN & PRIORITIZE"
        title="Product backlog"
        description="One shared source of truth. Every requirement, in its right place."
        action={<NewButton onClick={() => setEditor(true)} />}
      />
      <section className="panel">
        <div className="panel-heading">
          <h2>
            All tickets{" "}
            <span className="count">{query.data?.meta.total ?? "—"}</span>
          </h2>
          <select
            aria-label="Sort tickets"
            value={params.get("sort") || "rank"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="rank">Backlog order</option>
            <option value="updatedAt">Last updated</option>
            <option value="title">Title</option>
            <option value="priority">Priority</option>
          </select>
        </div>
        <div className="filters">
          <select
            aria-label="Sort direction"
            value={params.get("direction") || "asc"}
            onChange={(e) => change("direction", e.target.value)}
          >
            <option value="asc">Ascending / highest priority first</option>
            <option value="desc">Descending / lowest priority first</option>
          </select>
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search tickets"
              placeholder="Search by title or ID…"
              value={params.get("search") || ""}
              onChange={(e) => change("search", e.target.value)}
            />
          </div>
          <select
            aria-label="Filter status"
            value={params.get("status") || ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter priority"
            value={params.get("priority") || ""}
            onChange={(e) => change("priority", e.target.value)}
          >
            <option value="">All priorities</option>
            {priorities.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
          <TeamSelector
            teams={teams.data?.data || []}
            value={params.get("teamId") || ""}
            onChange={(v) => change("teamId", v)}
          />
          <POSelector
            members={members.data?.data || []}
            value={params.get("ownerId") || ""}
            onChange={(v) => change("ownerId", v)}
          />
          <select
            aria-label="Filter sprint"
            value={params.get("sprintId") || ""}
            onChange={(e) => change("sprintId", e.target.value)}
          >
            <option value="">All sprints</option>
            {sprints.data?.data.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <LoadingSkeleton />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <TicketTable
            tickets={query.data.data}
            emptyAction={
              <NewButton onClick={() => setEditor(true)}>
                Add a ticket
              </NewButton>
            }
            onReorder={(t) =>
              mutation.mutate({
                path: `/tickets/${t.id}/reorder`,
                data: { version: t.version, direction: "up" },
              })
            }
          />
        )}
        <div className="pagination">
          <span>
            {query.data?.meta.total ?? 0} tickets · canonical project backlog
          </span>
          <button
            disabled={Number(params.get("page") || 1) <= 1}
            onClick={() =>
              change("page", String(Number(params.get("page") || 1) - 1))
            }
          >
            Previous
          </button>
          <span>Page {params.get("page") || 1}</span>
          <button
            disabled={
              Number(params.get("page") || 1) * 30 >=
              (query.data?.meta.total ?? 0)
            }
            onClick={() =>
              change("page", String(Number(params.get("page") || 1) + 1))
            }
          >
            Next
          </button>
        </div>
        {mutation.error && <p role="alert">{mutation.error.message}</p>}
      </section>
      {editor && <TicketEditor onClose={() => setEditor(false)} />}
    </>
  );
}
export function TicketDetailPanel({ ticket }: { ticket: any }) {
  return (
    <section className="panel detail-panel">
      <h2>Requirements</h2>
      <h3>Description</h3>
      <p className="preserve">
        {ticket.description || "No description provided."}
      </p>
      <h3>User story</h3>
      <p className="preserve">
        {ticket.userStory || "No user story provided."}
      </p>
      <h3>Acceptance criteria</h3>
      <p className="preserve">
        {ticket.acceptanceCriteria || "No acceptance criteria provided."}
      </p>
      <h3>Relationships</h3>
      {ticket.parent && (
        <p>
          Parent:{" "}
          <Link to={`/tickets/${ticket.parent.id}`}>
            {ticket.parent.identifier} {ticket.parent.title}
          </Link>
        </p>
      )}
      {ticket.children.map((t: any) => (
        <p key={t.id}>
          Child:{" "}
          <Link to={`/tickets/${t.id}`}>
            {t.identifier} {t.title}
          </Link>
        </p>
      ))}
      <h3>Dependencies</h3>
      {ticket.dependencies.map((d: any) => (
        <p key={d.id}>
          <Link to={`/tickets/${d.dependsOn.id}`}>
            {d.dependsOn.identifier} {d.dependsOn.title}
          </Link>
        </p>
      ))}
    </section>
  );
}
export function TicketDetails() {
  const { project } = useWorkspace();
  const { ticketId: id, projectId } = useParams();
  const navigate = useNavigate();
  const query = useProjectQuery(`/tickets/${id}`);
  const mutation = useProjectMutation();
  const [edit, setEdit] = useState(false),
    [archive, setArchive] = useState(false),
    [comment, setComment] = useState(""),
    [dependency, setDependency] = useState("");
  useEffect(() => {
    if (!edit) void query.refetch();
  }, [edit]);
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const t = query.data.data;
  const readOnly = !!project?.archivedAt || !!t.archivedAt;
  return (
    <>
      <Link className="back-link" to="/backlog">
        <ArrowLeft size={16} />
        Product backlog
      </Link>
      <PageHeader
        eyebrow={`${t.identifier} · ${label(t.type)} · VERSION ${t.version}`}
        title={t.title}
        description={`Updated ${new Date(t.updatedAt).toLocaleString()}`}
        action={
          !readOnly ? (
            <div className="button-row">
              <button onClick={() => setArchive(true)}>Archive</button>
              <button className="primary" onClick={() => setEdit(true)}>
                Edit ticket
              </button>
            </div>
          ) : undefined
        }
      />
      <div className="detail-layout">
        <div>
          <TicketDetailPanel ticket={t} />
          <section className="panel detail-panel">
            <h2>
              <MessageSquare size={18} /> Conversation
            </h2>
            {t.comments.map((c: any) => (
              <article className="comment" key={c.id}>
                <strong>{c.author.name}</strong>
                <small>{new Date(c.createdAt).toLocaleString()}</small>
                <p className="preserve">{c.body}</p>
              </article>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate(
                  { path: `/tickets/${id}/comments`, data: { body: comment } },
                  { onSuccess: () => setComment("") },
                );
              }}
            >
              <label>
                Add a comment
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  required
                  disabled={readOnly}
                  maxLength={10000}
                />
              </label>
              <button
                className="primary"
                disabled={mutation.isPending || readOnly}
              >
                Post comment
              </button>
            </form>
          </section>
          <section className="panel detail-panel">
            <h2>Activity history</h2>
            <EntityHistory entityId={id!} />
          </section>
        </div>
        <aside className="detail-aside">
          <section className="panel detail-panel">
            <h2>Ticket context</h2>
            <dl>
              <dt>Status</dt>
              <dd>
                <StatusBadge value={t.status} />
              </dd>
              <dt>Priority</dt>
              <dd>
                <PriorityBadge value={t.priority} />
              </dd>
              <dt>Responsible PO</dt>
              <dd>{t.owner.name}</dd>
              <dt>Team</dt>
              <dd>{t.team?.name || "Unassigned"}</dd>
              <dt>Sprint</dt>
              <dd>{t.sprint?.name || "Not scheduled"}</dd>
              <dt>Internal ID</dt>
              <dd className="uuid">{t.id}</dd>
            </dl>
          </section>
          <section className="panel detail-panel">
            <h2>Link dependency</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate(
                  {
                    path: `/tickets/${id}/dependencies`,
                    data: { dependsOnId: dependency },
                  },
                  { onSuccess: () => setDependency("") },
                );
              }}
            >
              <TicketPicker
                label="Depends on ticket"
                value={dependency}
                onChange={(v) => setDependency(v || "")}
                exclude={[
                  t.id,
                  ...t.dependencies.map((d: any) => d.dependsOnId),
                ]}
              />
              <button disabled={mutation.isPending || readOnly || !dependency}>
                Link ticket
              </button>
            </form>
            {t.dependencies.map((d: any) => (
              <p key={d.id}>
                {d.dependsOn.identifier}{" "}
                <button
                  disabled={mutation.isPending || readOnly}
                  onClick={() =>
                    mutation.mutate({
                      path: `/tickets/${id}/dependencies/${d.dependsOnId}`,
                      method: "DELETE",
                      data: {},
                    })
                  }
                >
                  Unlink
                </button>
              </p>
            ))}
          </section>
          <section className="panel detail-panel">
            <h2>Blockers & decisions</h2>
            {t.blockers.map((b: any) => (
              <p key={b.id}>
                <Link to="/blockers">{b.title}</Link>{" "}
                <StatusBadge value={b.status} />
              </p>
            ))}
            {t.decisions.map((d: any) => (
              <p key={d.id}>
                <Link to="/decisions">{d.decision.title}</Link>
              </p>
            ))}
            {!t.blockers.length && !t.decisions.length && (
              <p className="muted">No linked records.</p>
            )}
          </section>
        </aside>
      </div>
      {mutation.error && <ErrorState error={mutation.error} />}{" "}
      {edit && <TicketEditor ticket={t} onClose={() => setEdit(false)} />}{" "}
      {archive && (
        <ConfirmationDialog
          title="Archive this ticket?"
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setArchive(false)}
          onConfirm={() =>
            mutation.mutate(
              {
                path: `/tickets/${id}`,
                method: "PATCH",
                data: { version: t.version, archived: true },
              },
              {
                onSuccess: () => {
                  setArchive(false);
                  navigate(`/projects/${projectId}/backlog`);
                },
              },
            )
          }
        />
      )}
    </>
  );
}
