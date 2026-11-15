import { useEffect, useRef, type ReactNode } from "react";
import { Inbox, AlertCircle, X } from "lucide-react";
import { label } from "../services/api";
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
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>A little room for what’s next</h3>
      <p>{text}</p>
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
        <strong>We couldn’t load this workspace</strong>
        <p>{error.message}</p>
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function ConfirmationDialog({
  title,
  onConfirm,
  onClose,
}: {
  title: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>This record will be archived and kept in activity history.</p>
      <div className="form-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={onConfirm}>
          Archive
        </button>
      </div>
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
            <p>
              <strong>{event.actor?.name || "Product Owner"}</strong>{" "}
              {label(event.action.replaceAll(".", " "))}
              <small>{new Date(event.createdAt).toLocaleString()}</small>
            </p>
          </div>
        ))
      ) : (
        <p className="muted">No activity recorded yet.</p>
      )}
    </div>
  );
}
