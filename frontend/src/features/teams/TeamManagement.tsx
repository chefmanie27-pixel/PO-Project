import { useState } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Users, Search, ArrowLeft } from "lucide-react";
import { teamCreateSchema, teamStatuses } from "../../../../shared/management";
import { hasCapability } from "../../../../shared/permissions";
import { useWorkspace, NewButton } from "../../app/Workspace";
import { useProjectQuery, useProjectMutation } from "../../hooks/useProject";
import { ProjectLink as Link } from "../../components/ProjectLink";
import {
  Dialog,
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../../components/ui";
import { TicketTable } from "../tickets/Tickets";
import { label } from "../../services/api";

export function TeamEditor({
  team,
  onClose,
  onSaved,
}: {
  team?: any;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { profile } = useWorkspace(),
    members = useProjectQuery("/memberships"),
    mutation = useProjectMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(teamCreateSchema),
    defaultValues: team
      ? { ...team, responsiblePoId: team.responsiblePoId || profile.id }
      : {
          name: "",
          description: "",
          responsiblePoId: profile.id,
          status: "ACTIVE",
        },
  });
  return (
    <Dialog title={team ? "Edit team" : "Create team"} onClose={onClose}>
      <form
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            {
              path: team ? `/teams/${team.id}` : "/teams",
              method: team ? "PATCH" : "POST",
              data: { ...data, ...(team ? { version: team.version } : {}) },
            },
            {
              onSuccess: () => {
                onSaved?.();
                onClose();
              },
            },
          ),
        )}
      >
        <label>
          Team name
          <input autoFocus {...register("name")} />
        </label>
        <label>
          Description
          <textarea rows={3} {...register("description")} />
        </label>
        <div className="form-grid">
          <label>
            Team code
            <input
              placeholder="Leave blank to generate"
              {...register("code", {
                setValueAs: (v) => v?.trim() || undefined,
              })}
            />
          </label>
          <label>
            Status
            <select {...register("status")}>
              {teamStatuses.map((s) => (
                <option value={s} key={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Responsible Product Owner
          <select {...register("responsiblePoId")}>
            {members.data?.data
              .filter((m: any) => ["ADMIN", "PRODUCT_OWNER"].includes(m.role))
              .map((m: any) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
          </select>
        </label>
        {members.error && <ErrorState error={members.error} />}{" "}
        {Object.entries(errors).map(([key, error]) => (
          <p key={key} role="alert" className="error-text">
            {label(key)}: {String(error?.message || "Check this field")}
          </p>
        ))}
        {mutation.error && <ErrorState error={mutation.error} />}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              mutation.isPending || members.isPending || !!members.error
            }
          >
            Save team
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function TeamArchiveDialog({
  team,
  onClose,
  onSaved,
}: {
  team: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useProjectMutation();
  return (
    <Dialog
      title={team.archivedAt ? "Reactivate team?" : "Archive team?"}
      onClose={onClose}
    >
      <p>
        {team.archivedAt
          ? "This team will become available for new ticket assignments."
          : "Keep existing tickets and history. This team will no longer accept new assignments until reactivated."}
      </p>
      {mutation.error && <ErrorState error={mutation.error} />}
      <div className="form-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              {
                path: `/teams/${team.id}`,
                method: "PATCH",
                data: { version: team.version, archived: !team.archivedAt },
              },
              {
                onSuccess: () => {
                  onSaved();
                  onClose();
                },
              },
            )
          }
        >
          {team.archivedAt ? "Reactivate team" : "Archive team"}
        </button>
      </div>
    </Dialog>
  );
}
export function Teams() {
  const { role, project } = useWorkspace();
  const query = useProjectQuery("/teams?includeArchived=true");
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [editor, setEditor] = useState<any>(false),
    [archive, setArchive] = useState<any>(null),
    [notice, setNotice] = useState("");
  const allowed = hasCapability(role, "teams:manage") && !project.archivedAt;
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const teams = query.data.data.filter(
    (t: any) =>
      (status ? t.status === status : !t.archivedAt) &&
      `${t.name} ${t.code} ${t.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & OWNERSHIP"
        title="Development teams"
        description={`Build the right teams for ${project.name}. Keep ownership and delivery connected.`}
        action={
          allowed ? (
            <NewButton onClick={() => setEditor({})}>Create Team</NewButton>
          ) : undefined
        }
      />
      <div className="portfolio-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search teams"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams by name, code or description…"
          />
        </div>
        <select
          aria-label="Filter teams by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Current teams</option>
          {[...teamStatuses, "ARCHIVED"].map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <span className="muted">{teams.length} teams</span>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="cards-grid">
        {teams.map((team: any) => {
          const active = team.tickets.filter(
              (t: any) => t.status !== "DONE",
            ).length,
            done = team.tickets.filter((t: any) => t.status === "DONE").length,
            blockers = team.tickets.reduce(
              (n: number, t: any) => n + t.blockers.length,
              0,
            );
          return (
            <article className="panel team-card" key={team.id}>
              <div className="record-top">
                <span className="team-icon">
                  <Users size={24} />
                </span>
                <StatusBadge value={team.status} />
              </div>
              <span className="eyebrow team-code">{team.code}</span>
              <Link to={`/teams/${team.id}`}>
                <h2>{team.name}</h2>
              </Link>
              <p className="muted">
                {team.description || "No description provided."}
              </p>
              <div className="team-stats">
                <div>
                  <strong>{team.tickets.length}</strong>
                  <small>Tickets</small>
                </div>
                <div>
                  <strong>{active}</strong>
                  <small>Active</small>
                </div>
                <div>
                  <strong>{done}</strong>
                  <small>Completed</small>
                </div>
                <div>
                  <strong>{blockers}</strong>
                  <small>Open blockers</small>
                </div>
              </div>
              <div className="team-contacts">
                Responsible PO:{" "}
                {team.responsiblePo ? (
                  <a href={`mailto:${team.responsiblePo.email}`}>
                    {team.responsiblePo.name}
                  </a>
                ) : (
                  <span>Unassigned legacy team</span>
                )}
              </div>
              <div className="project-actions">
                <Link to={`/teams/${team.id}`} className="project-open">
                  View team →
                </Link>
                {allowed && (
                  <>
                    <button
                      disabled={!!team.archivedAt}
                      onClick={() => setEditor(team)}
                    >
                      Edit team
                    </button>
                    <button onClick={() => setArchive(team)}>
                      {team.archivedAt ? "Reactivate" : "Archive"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!teams.length && (
        <EmptyState
          text={
            query.data.data.length
              ? "No teams match these filters."
              : "Create your first team for this project."
          }
          action={
            allowed ? (
              <NewButton onClick={() => setEditor({})}>Create a team</NewButton>
            ) : undefined
          }
        />
      )}{" "}
      {editor && (
        <TeamEditor
          team={editor.id ? editor : undefined}
          onClose={() => {
            setEditor(false);
          }}
          onSaved={() => setNotice("Team saved.")}
        />
      )}
      {archive && (
        <TeamArchiveDialog
          team={archive}
          onClose={() => setArchive(null)}
          onSaved={() =>
            setNotice("Team status saved. Ticket history preserved.")
          }
        />
      )}
    </>
  );
}
export function TeamDetails() {
  const { teamId } = useParams();
  const { role, project } = useWorkspace();
  const query = useProjectQuery(`/teams/${teamId}`);
  const [edit, setEdit] = useState(false),
    [archive, setArchive] = useState(false),
    [notice, setNotice] = useState("");
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const team = query.data.data,
    allowed = hasCapability(role, "teams:manage") && !project.archivedAt;
  const current = team.tickets.filter(
    (t: any) => t.sprint?.status === "ACTIVE",
  );
  const blockers = team.tickets.flatMap((t: any) =>
    t.blockers.map((b: any) => ({ ...b, ticket: t })),
  );
  return (
    <>
      <Link className="back-link" to="/teams">
        <ArrowLeft size={16} />
        Development teams
      </Link>
      <PageHeader
        eyebrow={team.code}
        title={team.name}
        description={team.description || "Team workspace"}
        action={
          allowed ? (
            <div className="button-row">
              <button
                disabled={!!team.archivedAt}
                onClick={() => setEdit(true)}
              >
                Edit Team
              </button>
              <button onClick={() => setArchive(true)}>
                {team.archivedAt ? "Reactivate" : "Archive"}
              </button>
            </div>
          ) : undefined
        }
      />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {team.archivedAt && (
        <p className="notice">
          Archived team · Existing tickets and history are preserved. Reactivate
          before assigning new work.
        </p>
      )}
      <div className="team-detail-summary panel">
        <div>
          <span className="muted">Responsible PO</span>
          <strong>{team.responsiblePo?.name || "Unassigned"}</strong>
        </div>
        <div>
          <span className="muted">Status</span>
          <StatusBadge value={team.status} />
        </div>
        <div>
          <span className="muted">Current sprint workload</span>
          <strong>{current.length} tickets</strong>
        </div>
        <div>
          <span className="muted">Completed work</span>
          <strong>
            {team.tickets.filter((t: any) => t.status === "DONE").length}{" "}
            tickets
          </strong>
        </div>
      </div>
      <div className="team-breakdown">
        {["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE"].map(
          (status) => (
            <div className="panel" key={status}>
              <StatusBadge value={status} />
              <strong>
                {team.tickets.filter((t: any) => t.status === status).length}
              </strong>
            </div>
          ),
        )}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Assigned tickets</h2>
          <Link to={`/backlog?teamId=${team.id}`}>Open filtered backlog →</Link>
        </div>
        <TicketTable tickets={team.tickets} />
      </section>
      <section className="panel team-blockers">
        <div className="panel-heading">
          <h2>
            Open blockers <span className="count">{blockers.length}</span>
          </h2>
        </div>
        {blockers.map((b: any) => (
          <div className="mini-record" key={b.id}>
            <StatusBadge value={b.severity} />
            <strong>{b.title}</strong>
            <Link to={`/tickets/${b.ticket.id}`}>
              {b.ticket.identifier} · {b.ticket.title}
            </Link>
          </div>
        ))}
        {!blockers.length && (
          <EmptyState text="No unresolved blockers for this team." />
        )}
      </section>
      {edit && (
        <TeamEditor
          team={team}
          onClose={() => {
            setEdit(false);
          }}
          onSaved={() => setNotice("Team saved.")}
        />
      )}
      {archive && (
        <TeamArchiveDialog
          team={team}
          onClose={() => setArchive(false)}
          onSaved={() => setNotice("Team status saved.")}
        />
      )}
    </>
  );
}
