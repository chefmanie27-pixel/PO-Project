import { EntityHistory } from "../../components/EntityHistory";
import { TicketPicker } from "../../components/TicketPicker";
import { useState } from "react";
import { ProjectLink as Link } from "../../components/ProjectLink";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  blockerSchema,
  reviewSchema,
  decisionSchema,
  priorities,
} from "../../../../shared/schemas";
import { NewButton, useWorkspace } from "../../app/Workspace";
import { useProjectMutation, useProjectQuery } from "../../hooks/useProject";
import {
  Dialog,
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../../components/ui";
import { label } from "../../services/api";
type Kind = "reviews" | "blockers" | "decisions";
const config = {
  reviews: {
    title: "PO review queue",
    description: "Resolve the questions that keep your teams moving.",
    schema: reviewSchema,
    statuses: ["OPEN", "RESOLVED"],
  },
  blockers: {
    title: "Blocker tracker",
    description: "Make impediments visible. Give every blocker a path forward.",
    schema: blockerSchema,
    statuses: ["OPEN", "INVESTIGATING", "RESOLVED"],
  },
  decisions: {
    title: "Decision log",
    description: "A lasting record of the why behind your product.",
    schema: decisionSchema,
    statuses: ["PROPOSED", "APPROVED", "SUPERSEDED"],
  },
};
function RecordEditor({
  kind,
  record,
  onClose,
  onSaved,
}: {
  kind: Kind;
  record?: any;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { profile } = useWorkspace(),
    members = useProjectQuery("/memberships");
  const mutation = useProjectMutation();
  const settings = config[kind];
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<any>({
    resolver: zodResolver(settings.schema as any),
    defaultValues: record
      ? {
          ...record,
          ticketIds: record.tickets?.map((t: any) => t.ticketId) || [],
        }
      : {
          ownerId: profile.id,
          status: settings.statuses[0],
          priority: "MEDIUM",
          severity: "HIGH",
          category: "QUESTION",
          ticketId: null,
          ticketIds: [],
        },
  });
  return (
    <Dialog
      title={`${record ? "Edit" : "Create"} ${kind === "reviews" ? "review item" : kind === "blockers" ? "blocker" : "decision"}`}
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit((data) =>
          mutation.mutate(
            {
              path: `/${kind}${record ? "/" + record.id : ""}`,
              method: record ? "PATCH" : "POST",
              data: { ...data, ...(record ? { version: record.version } : {}) },
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
          Title
          <input autoFocus {...register("title")} />
        </label>
        {kind !== "reviews" && (
          <label>
            Description
            <textarea rows={3} {...register("description")} />
          </label>
        )}
        {kind === "decisions" ? (
          <>
            <label>
              Rationale
              <textarea {...register("rationale")} />
            </label>
            <label>
              Impact
              <textarea {...register("impact")} />
            </label>
            <TicketPicker
              label="Related tickets"
              multiple
              value={watch("ticketIds")}
              onChange={(v) => setValue("ticketIds", v, { shouldDirty: true })}
              selected={record?.tickets?.map((t: any) => t.ticket) || []}
            />
          </>
        ) : (
          <>
            <label>
              Responsible owner
              <select {...register("ownerId")}>
                {members.data?.data.map((m: any) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </label>
            <TicketPicker
              label="Related ticket"
              value={watch("ticketId")}
              onChange={(v) => setValue("ticketId", v, { shouldDirty: true })}
              selected={record?.ticket ? [record.ticket] : []}
            />
            <label>
              {kind === "blockers" ? "Severity" : "Priority"}
              <select
                {...register(kind === "blockers" ? "severity" : "priority")}
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {label(p)}
                  </option>
                ))}
              </select>
            </label>
            {kind === "reviews" && (
              <label>
                Category
                <select {...register("category")}>
                  {[
                    "MISSING_REQUIREMENTS",
                    "UNCLEAR_CRITERIA",
                    "DECISION_NEEDED",
                    "AWAITING_APPROVAL",
                    "QUESTION",
                    "PO_INPUT",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {kind === "blockers" ? "Resolution notes" : "Notes"}
              <textarea
                {...register(kind === "blockers" ? "resolutionNotes" : "notes")}
              />
            </label>
          </>
        )}
        <label>
          Status
          <select {...register("status")}>
            {settings.statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        {Object.entries(errors).map(([key, e]) => (
          <p role="alert" className="error-text" key={key}>
            {label(key)}: {String(e?.message || "Check this field")}
          </p>
        ))}
        {members.error && (
          <ErrorState
            error={members.error}
            retry={() => void members.refetch()}
          />
        )}
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
            {mutation.isPending ? "Saving..." : "Save record"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function BlockerCard({
  record,
  onEdit,
}: {
  record: any;
  onEdit: () => void;
}) {
  return (
    <article className="panel record-card">
      <div className="record-top">
        <StatusBadge
          value={record.severity || record.priority || record.status}
        />
        {(record.severity || record.priority) && (
          <StatusBadge value={record.status} />
        )}
      </div>
      <h2>{record.title}</h2>
      <p className="preserve muted">
        {record.description || record.notes || label(record.category || "")}
      </p>
      {record.rationale && (
        <p>
          <strong>Rationale</strong>
          <br />
          {record.rationale}
        </p>
      )}
      {record.impact && (
        <p>
          <strong>Impact</strong>
          <br />
          {record.impact}
        </p>
      )}
      {record.resolutionNotes && (
        <p>
          <strong>Resolution</strong>
          <br />
          {record.resolutionNotes}
        </p>
      )}
      {record.resolvedAt && (
        <small>Resolved {new Date(record.resolvedAt).toLocaleString()}</small>
      )}
      <div className="record-links">
        {record.ticket && (
          <Link to={`/tickets/${record.ticket.id}`}>
            {record.ticket.identifier}
          </Link>
        )}
        {record.tickets?.map((t: any) => (
          <Link key={t.id} to={`/tickets/${t.ticketId}`}>
            {t.ticket.identifier}
          </Link>
        ))}
      </div>
      <div className="card-footer">
        <span>
          {record.owner?.name || record.maker?.name} ·{" "}
          {new Date(
            record.decisionDate || record.updatedAt,
          ).toLocaleDateString()}
        </span>
        <button onClick={onEdit}>Manage →</button>
      </div>
    </article>
  );
}
export const DecisionCard = BlockerCard;
export function ReviewQueue({
  records,
  onEdit,
}: {
  records: any[];
  onEdit: (r: any) => void;
}) {
  return (
    <div className="cards-grid">
      {records.map((r) => (
        <BlockerCard record={r} key={r.id} onEdit={() => onEdit(r)} />
      ))}
    </div>
  );
}
export function Records({ kind }: { kind: Kind }) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState(""),
    [editor, setEditor] = useState<any>(false),
    [search, setSearch] = useState(""),
    [history, setHistory] = useState<any>(null),
    [notice, setNotice] = useState("");
  const query = useProjectQuery(
      `/${kind}?page=${page}${filter ? `&status=${filter}` : ""}&search=${encodeURIComponent(search)}`,
    ),
    indicators = useProjectQuery("/review-indicators");
  const settings = config[kind];
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const records = query.data.data;
  return (
    <>
      <PageHeader
        eyebrow="PRODUCT CLARITY"
        title={settings.title}
        description={settings.description}
        action={
          <NewButton
            onClick={() => setEditor({})}
          >{`New ${kind === "reviews" ? "review item" : kind === "blockers" ? "blocker" : "decision"}`}</NewButton>
        }
      />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="dashboard-toolbar">
        <input
          aria-label="Search records"
          placeholder="Search by title"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <span className="muted">{query.data.meta.total} persisted records</span>
        <select
          aria-label="Filter records by status"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {settings.statuses.map((s) => (
            <option value={s} key={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="cards-grid">
        {records.map((record: any) => (
          <div key={record.id}>
            <BlockerCard record={record} onEdit={() => setEditor(record)} />
            <button onClick={() => setHistory(record)}>
              Comments and history: {record.title}
            </button>
          </div>
        ))}
      </div>
      {!records.length && (
        <EmptyState
          text="No records match this view. Create a record or adjust the filters."
          action={
            <NewButton onClick={() => setEditor({})}>Create record</NewButton>
          }
        />
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={page * 30 >= query.data.meta.total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      {kind === "reviews" && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Automatic requirement checks{" "}
              <span className="count">{indicators.data?.data.length ?? 0}</span>
            </h2>
          </div>
          <p className="panel-subtitle">
            Derived from active ticket requirements and review status. Fix the
            ticket to clear a check; these checks do not create duplicate review
            records.
          </p>
          {indicators.error && (
            <ErrorState
              error={indicators.error}
              retry={() => void indicators.refetch()}
            />
          )}
          {indicators.data?.data.map((r: any) => (
            <Link
              key={r.id}
              className="attention-row"
              to={`/tickets/${r.ticketId}`}
            >
              <span>{r.title}</span>
              <span>Review ticket →</span>
            </Link>
          ))}
          {!indicators.data?.data.length && (
            <EmptyState text="No automatic requirement gaps." />
          )}
        </section>
      )}
      {kind === "reviews" && <ReviewAttention />}
      {history && (
        <RecordHistory
          kind={kind}
          record={history}
          onClose={() => setHistory(null)}
        />
      )}
      {editor && (
        <RecordEditor
          kind={kind}
          record={editor.id ? editor : undefined}
          onClose={() => setEditor(false)}
          onSaved={() => setNotice("Record saved.")}
        />
      )}
    </>
  );
}

function RecordHistory({
  kind,
  record,
  onClose,
}: {
  kind: Kind;
  record: any;
  onClose: () => void;
}) {
  const mutation = useProjectMutation();
  const [body, setBody] = useState("");
  const { project } = useWorkspace();
  return (
    <Dialog
      title={`Comments and history: ${record.title}`}
      onClose={onClose}
      hasUnsavedChanges={!!body.trim()}
    >
      <EntityHistory entityId={record.id} />
      {!project?.archivedAt && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(
              { path: `/${kind}/${record.id}/updates`, data: { body } },
              { onSuccess: () => setBody("") },
            );
          }}
        >
          <label>
            Add an update
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              required
            />
          </label>
          <button
            className="primary"
            disabled={mutation.isPending || !body.trim()}
          >
            Post update
          </button>
          {mutation.error && <ErrorState error={mutation.error} />}
        </form>
      )}
    </Dialog>
  );
}

function ReviewAttention() {
  const blockers = useProjectQuery("/blockers?status=OPEN&limit=5"),
    decisions = useProjectQuery("/decisions?status=PROPOSED&limit=5");
  return (
    <div className="cards-grid">
      {[
        {
          query: blockers,
          title: "Blockers requiring input",
          path: "/blockers",
        },
        {
          query: decisions,
          title: "Decisions awaiting approval",
          path: "/decisions",
        },
      ].map(({ query, title, path }) => (
        <section className="panel detail-panel" key={path}>
          <h2>
            {title}{" "}
            <span className="count">{query.data?.meta?.total ?? 0}</span>
          </h2>
          {query.isPending ? (
            <LoadingSkeleton />
          ) : query.error ? (
            <ErrorState
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            (query.data?.data || []).map((r: any) => (
              <p key={r.id}>
                <Link to={path}>{r.title}</Link>
              </p>
            ))
          )}
          <Link to={path}>Open {path.slice(1)}</Link>
        </section>
      ))}
    </div>
  );
}
