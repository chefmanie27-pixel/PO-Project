import { useState } from "react";
import { Link } from "react-router-dom";
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
}: {
  kind: Kind;
  record?: any;
  onClose: () => void;
}) {
  const { profile } = useWorkspace(),
    members = useProjectQuery("/memberships");
  const mutation = useProjectMutation();
  const settings = config[kind];
  const {
    register,
    handleSubmit,
    formState: { errors },
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
            { onSuccess: onClose },
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
            <label>
              Related ticket UUIDs (comma separated)
              <input
                defaultValue={record?.tickets
                  ?.map((t: any) => t.ticketId)
                  .join(", ")}
                {...register("ticketIds", {
                  setValueAs: (v) =>
                    Array.isArray(v)
                      ? v
                      : String(v)
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                })}
              />
            </label>
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
            <label>
              Related ticket UUID (optional)
              <input
                {...register("ticketId", { setValueAs: (v) => v || null })}
              />
            </label>
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
        {mutation.error && <ErrorState error={mutation.error} />}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={mutation.isPending}>
            Save record
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
    [editor, setEditor] = useState<any>(false);
  const query = useProjectQuery(`/${kind}?page=${page}`),
    indicators = useProjectQuery("/review-indicators");
  const settings = config[kind];
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  const records = query.data.data.filter(
    (r: any) => !filter || r.status === filter,
  );
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
      <div className="dashboard-toolbar">
        <span className="muted">{query.data.meta.total} persisted records</span>
        <select
          aria-label="Filter records by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All statuses on this page</option>
          {settings.statuses.map((s) => (
            <option value={s} key={s}>
              {label(s)}
            </option>
          ))}
        </select>
      </div>
      <ReviewQueue records={records} onEdit={setEditor} />
      {!records.length && <EmptyState />}
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
      {editor && (
        <RecordEditor
          kind={kind}
          record={editor.id ? editor : undefined}
          onClose={() => setEditor(false)}
        />
      )}
    </>
  );
}
