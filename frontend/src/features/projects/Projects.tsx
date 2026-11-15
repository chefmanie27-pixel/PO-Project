import { useState, useId } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FolderKanban,
  Search,
  Users,
  ListTodo,
  ShieldAlert,
  ArrowUpRight,
  CalendarDays,
} from "lucide-react";
import {
  projectCreateSchema,
  projectStatuses,
} from "../../../../shared/management";
import { hasCapability } from "../../../../shared/permissions";
import { useAccount } from "../../app/Account";
import { api, send, label } from "../../services/api";
import {
  Dialog,
  PageHeader,
  StatusBadge,
  EmptyState,
  ErrorState,
} from "../../components/ui";
import { SignOutButton } from "../auth/Auth";
import { markDraftSaved } from "../../services/drafts";

export function ProjectEditor({
  project,
  profile,
  onClose,
  onSaved,
}: {
  project?: any;
  profile: any;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const codeHelpId = useId();
  const cache = useQueryClient(),
    navigate = useNavigate();
  const members = useQuery({
    queryKey: ["project-members", project?.id],
    queryFn: () => api(`/projects/${project.id}/memberships`),
    enabled: !!project,
  });
  const mutation = useMutation({
    mutationFn: (data: any) =>
      api(
        `/projects${project ? "/" + project.id : ""}`,
        send(project ? "PATCH" : "POST", data),
      ),
    onSuccess: async (result) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["projects"] }),
        cache.invalidateQueries({ queryKey: ["profile"] }),
        ...(project
          ? [cache.invalidateQueries({ queryKey: [`/projects/${project.id}`] })]
          : []),
      ]);
      markDraftSaved();
      onSaved?.();
      onClose();
      if (!project) navigate(`/projects/${result.data.id}/dashboard`);
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: project
      ? {
          ...project,
          code: project.key,
          startDate: project.startDate?.slice(0, 10) || null,
          targetDate: project.targetDate?.slice(0, 10) || null,
          ownerId: project.ownerId || profile.id,
        }
      : {
          name: "",
          description: "",
          status: "ACTIVE",
          ownerId: profile.id,
          startDate: null,
          targetDate: null,
        },
  });
  return (
    <Dialog
      title={project ? "Edit project" : "Create new project"}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit((values) => {
          const { code, ...data } = values;
          mutation.mutate(
            project
              ? { ...data, version: project.version }
              : { ...data, code: code || undefined },
          );
        })}
      >
        <p className="muted small">
          Project name is required. You can add or update the other details
          later.
        </p>
        <label>
          Project name
          <input autoFocus {...register("name")} />
        </label>
        <label>
          Description
          <textarea rows={3} {...register("description")} />
        </label>
        <div className="form-grid">
          <label>
            Project code
            <input
              aria-label="Project code"
              aria-describedby={codeHelpId}
              readOnly={!!project}
              placeholder="Leave blank to generate"
              {...register("code", {
                setValueAs: (v) => v?.trim() || undefined,
              })}
            />
            <small id={codeHelpId} className="field-help">
              {project
                ? "Ticket prefixes are permanent to preserve historical identifiers."
                : "A unique code will be generated if omitted."}
            </small>
          </label>
          <label style={!project ? { display: "none" } : undefined}>
            Status
            <select {...register("status")}>
              {projectStatuses.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input
              type="date"
              {...register("startDate", { setValueAs: (v) => v || null })}
            />
          </label>
          <label>
            Target completion date
            <input
              type="date"
              {...register("targetDate", { setValueAs: (v) => v || null })}
            />
          </label>
        </div>
        <label style={!project ? { display: "none" } : undefined}>
          Project owner
          <select {...register("ownerId")} disabled={!project}>
            {project ? (
              (members.data?.data || [])
                .filter((m: any) => ["ADMIN", "PRODUCT_OWNER"].includes(m.role))
                .map((m: any) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))
            ) : (
              <option value={profile.id}>{profile.name}</option>
            )}
          </select>
        </label>
        {Object.entries(errors).map(([key, error]) => (
          <p role="alert" className="error-text" key={key}>
            {label(key)}: {String(error?.message || "Check this field")}
          </p>
        ))}
        {mutation.error && <ErrorState error={mutation.error} />}
        {members.error && <ErrorState error={members.error} />}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              mutation.isPending ||
              (!!project && (members.isPending || !!members.error))
            }
          >
            Save project
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function Projects() {
  const { profile, projects } = useAccount();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [editor, setEditor] = useState<any>(false),
    [confirm, setConfirm] = useState<any>(null),
    [notice, setNotice] = useState("");
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (p: any) =>
      api(
        `/projects/${p.id}`,
        send("PATCH", { version: p.version, archived: !p.archivedAt }),
      ),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["projects"] }),
        cache.invalidateQueries({ queryKey: ["profile"] }),
      ]);
      setConfirm(null);
      setNotice("Project status saved.");
    },
  });
  const canCreate = profile.memberships.some((m: any) =>
    hasCapability(m.role, "project:create"),
  );
  const rows = projects.filter(
    (p: any) =>
      (status ? p.status === status : !p.archivedAt) &&
      `${p.name} ${p.key} ${p.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="projects-shell">
      <header className="projects-topbar">
        <Link className="brand" to="/projects">
          <div className="brand-mark">
            P<span>O</span>
          </div>
          <div>
            Command Center<small>PRODUCT OWNER WORKSPACE</small>
          </div>
        </Link>
        <span className="muted">{profile.name}</span>
        <SignOutButton />
      </header>
      <main className="projects-content">
        <PageHeader
          eyebrow="YOUR PRODUCT PORTFOLIO"
          title="My Projects"
          description="Choose a project. Bring its people, priorities and decisions into focus."
          action={
            canCreate ? (
              <button className="primary" onClick={() => setEditor({})}>
                ＋ Create New Project
              </button>
            ) : undefined
          }
        />
        <div className="portfolio-toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search projects"
              placeholder="Search projects by name, code or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter projects by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Current projects</option>
            {[...projectStatuses, "ARCHIVED"].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <span className="muted">{rows.length} projects</span>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {mutation.error && <ErrorState error={mutation.error} />}
        <div className="project-grid">
          {rows.map((p: any) => {
            const canEdit = hasCapability(
              p.memberships?.[0]?.role ||
                profile.memberships.find((m: any) => m.projectId === p.id)
                  ?.role ||
                "",
              "project:edit",
            );
            return (
              <article className="panel project-card" key={p.id}>
                <div className="record-top">
                  <span className="project-glyph">
                    <FolderKanban size={24} />
                  </span>
                  <StatusBadge value={p.status} />
                </div>
                <span className="eyebrow">{p.key}</span>
                <Link to={`/projects/${p.id}/dashboard`}>
                  <h2>{p.name}</h2>
                </Link>
                <p className="muted project-description">
                  {p.description ||
                    "A shared workspace for your next product goal."}
                </p>
                <div className="project-card-stats">
                  <span>
                    <Users size={15} />
                    <strong>{p._count?.teams ?? 0}</strong> teams
                  </span>
                  <span>
                    <ListTodo size={15} />
                    <strong>{p._count?.tickets ?? 0}</strong> tickets
                  </span>
                  <span>
                    <ShieldAlert size={15} />
                    <strong>{p._count?.blockers ?? 0}</strong> open blockers
                  </span>
                </div>
                <div className="project-sprint">
                  <CalendarDays size={15} />
                  {p.sprints?.[0]?.name || "No current sprint"}
                </div>
                <small>
                  Updated {new Date(p.updatedAt).toLocaleDateString()}
                </small>
                <div className="project-actions">
                  <Link
                    className="project-open"
                    to={`/projects/${p.id}/dashboard`}
                  >
                    Open project <ArrowUpRight size={16} />
                  </Link>
                  {canEdit && (
                    <>
                      <button
                        disabled={!!p.archivedAt}
                        onClick={() => setEditor(p)}
                      >
                        Edit
                      </button>
                      <button onClick={() => setConfirm(p)}>
                        {p.archivedAt ? "Reactivate" : "Archive"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {!rows.length && (
          <EmptyState
            text={
              projects.length
                ? "No projects match these filters."
                : "No projects yet. Create a project or ask an administrator for membership."
            }
            action={
              canCreate ? (
                <button className="primary" onClick={() => setEditor({})}>
                  Create your first project
                </button>
              ) : undefined
            }
          />
        )}
      </main>
      {editor && (
        <ProjectEditor
          project={editor.id ? editor : undefined}
          profile={profile}
          onClose={() => {
            setEditor(false);
          }}
          onSaved={() => setNotice("Project saved.")}
        />
      )}
      {confirm && (
        <Dialog
          title={
            confirm.archivedAt ? "Reactivate project?" : "Archive project?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.archivedAt
              ? "Restore this project to active work."
              : "Keep the full project history and stop new work until it is reactivated."}
          </p>
          <div className="form-actions">
            <button onClick={() => setConfirm(null)}>Cancel</button>
            <button
              className="primary"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(confirm)}
            >
              {confirm.archivedAt ? "Reactivate project" : "Archive project"}
            </button>
          </div>
          {mutation.error && <ErrorState error={mutation.error} />}
        </Dialog>
      )}
    </div>
  );
}
