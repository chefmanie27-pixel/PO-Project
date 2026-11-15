import { useEffect, useRef, useContext, type ReactNode } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router-dom";
import { Inbox, AlertCircle, X } from "lucide-react";
import { label } from "../services/api";
import { SignOutButton } from "../features/auth/Auth";
import { draftSavedEvent } from "../services/drafts";
export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <i />
      {label(value)}
    </span>
  );
}
export const PriorityBadge = StatusBadge;
export function PageHeader({
  eyebrow = "WORKSPACE",
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function EmptyState({
  text = "No items yet. Create the first one to get started.",
  action,
}: {
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>A little room for what’s next</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading workspace" className="skeleton">
      <div />
      <div />
      <div />
      <span>Loading workspace…</span>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle />
      <div>
        <strong>We couldn’t complete this request</strong>
        <p>{error.message}</p>
        {(error as any).status === 401 && (
          <SignOutButton>Sign out and reconnect</SignOutButton>
        )}
        {retry && <button onClick={retry}>Try again</button>}
      </div>
    </div>
  );
}
export function MetricCard({
  title,
  value,
  note,
  icon,
}: {
  title: string;
  value: number;
  note: string;
  icon: ReactNode;
}) {
  return (
    <article className="metric">
      <div className="metric-label">
        {title}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  hasUnsavedChanges,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  hasUnsavedChanges?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const dirty = useRef(false);
  const dirtyOverride = useRef(hasUnsavedChanges);
  dirtyOverride.current = hasUnsavedChanges;
  const isDirty = () => dirtyOverride.current ?? dirty.current;
  const close = () => {
    if (!isDirty() || window.confirm("Discard your unsaved changes?"))
      onClose();
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog
      ?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]), select:not([disabled])',
      )
      ?.focus();
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (isDirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    const saved = () => {
      dirty.current = false;
      dirtyOverride.current = false;
    };
    window.addEventListener(draftSavedEvent, saved);
    return () => {
      dialog?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      window.removeEventListener("beforeunload", preventLoss);
      window.removeEventListener(draftSavedEvent, saved);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onInputCapture={() => {
        dirty.current = true;
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusable = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0 && el.tabIndex >= 0);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      aria-label={title}
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest("button");
        if (
          button?.textContent?.trim() === "Cancel" &&
          isDirty() &&
          !window.confirm("Discard your unsaved changes?")
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {dataRouter && <DraftNavigationGuard isDirty={isDirty} />}
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function DraftNavigationGuard({ isDirty }: { isDirty: () => boolean }) {
  const blocker = useBlocker(() => isDirty());
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Discard your unsaved changes and leave this page?"))
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  return null;
}
export function ConfirmationDialog({
  title,
  onConfirm,
  onClose,
  pending = false,
  error,
}: {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  error?: Error | null;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>This record will be archived and kept in activity history.</p>
      <div className="form-actions">
        <button disabled={pending} onClick={onClose}>
          Cancel
        </button>
        <button disabled={pending} className="primary" onClick={onConfirm}>
          Archive
        </button>
      </div>
      {error && <ErrorState error={error} />}
    </Dialog>
  );
}
export function ActivityTimeline({ events }: { events: any[] }) {
  return (
    <div className="timeline">
      {events.length ? (
        events.map((event) => (
          <div key={event.id}>
            <i />
            <div className="timeline-body">
              <strong>{event.actor?.name || "Product Owner"}</strong>{" "}
              {label(
                event.action
                  .replaceAll(".", " ")
                  .replace(/([a-z])([A-Z])/g, "$1 $2"),
              )}
              <small>{new Date(event.createdAt).toLocaleString()}</small>
              {event.changes?.body && (
                <p className="preserve">{event.changes.body}</p>
              )}
              {event.changes?.after && (
                <details className="audit-changes">
                  <summary>View changes</summary>
                  <dl>
                    {Object.entries(event.changes.after)
                      .filter(([key]) =>
                        [
                          "title",
                          "description",
                          "name",
                          "code",
                          "status",
                          "priority",
                          "severity",
                          "notes",
                          "resolutionNotes",
                          "rationale",
                          "impact",
                          "goal",
                          "startDate",
                          "endDate",
                          "targetDate",
                          "acceptanceCriteria",
                          "userStory",
                        ].includes(key),
                      )
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>{label(key.replace(/([A-Z])/g, " $1"))}</dt>
                          <dd className="preserve">
                            {event.changes.before?.[key] != null && (
                              <del>
                                {String(event.changes.before[key]) || "Empty"}
                              </del>
                            )}
                            <span>{String(value ?? "") || "Empty"}</span>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </details>
              )}
            </div>
          </div>
        ))
      ) : (
        <p className="muted">No activity recorded yet.</p>
      )}
    </div>
  );
}
