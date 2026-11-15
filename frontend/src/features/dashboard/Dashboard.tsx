import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  Clock3,
  CheckCircle2,
  ShieldAlert,
  ArrowUpRight,
  ClipboardCheck,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useProjectQuery } from "../../hooks/useProject";
import { useWorkspace, NewButton } from "../../app/Workspace";
import {
  MetricCard,
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../../components/ui";
import {
  TicketEditor,
  TicketTable,
  POSelector,
  TeamSelector,
} from "../tickets/Tickets";
export function Dashboard() {
  const { profile, projects, projectId } = useWorkspace();
  const [create, setCreate] = useState(false),
    [sprintId, setSprint] = useState(""),
    [teamId, setTeam] = useState(""),
    [ownerId, setOwner] = useState("");
  const filters = new URLSearchParams();
  if (sprintId) filters.set("sprintId", sprintId);
  if (teamId) filters.set("teamId", teamId);
  if (ownerId) filters.set("ownerId", ownerId);
  const query = useProjectQuery(`/dashboard?${filters}`),
    teams = useProjectQuery("/teams"),
    members = useProjectQuery("/memberships"),
    sprints = useProjectQuery("/sprints");
  const project = projects.find((p: any) => p.id === projectId);
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const d = query.data.data;
  const now = new Date();
  const current = d.sprints.find(
    (s: any) => new Date(s.startDate) <= now && new Date(s.endDate) >= now,
  );
  const total = d.total;
  const done = d.counts.DONE;
  const summarySprint = (sprints.data?.data || []).find(
    (s: any) => s.id === (sprintId || current?.id),
  );
  const summaryTickets = summarySprint?.tickets.filter(
    (t: any) =>
      (!teamId || t.teamId === teamId) && (!ownerId || t.ownerId === ownerId),
  );
  const summaryTotal = summaryTickets ? summaryTickets.length : total;
  const summaryDone = summaryTickets
    ? summaryTickets.filter((t: any) => t.status === "DONE").length
    : done;
  const summaryCounts = summaryTickets
    ? Object.fromEntries(
        ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE"].map(
          (status) => [
            status,
            summaryTickets.filter((t: any) => t.status === status).length,
          ],
        ),
      )
    : d.counts;
  const percent = summaryTotal
    ? Math.round((summaryDone / summaryTotal) * 100)
    : 0;
  const attention = d.reviews.length + d.indicators.length;
  return (
    <>
      {project.demo && (
        <div className="demo-banner">
          DEMONSTRATION PROJECT · Sample records for learning and testing
        </div>
      )}
      <PageHeader
        eyebrow="YOUR PRODUCT, AT A GLANCE"
        title={`Good to see you, ${profile.name.split(" ")[0]}.`}
        description="A clear view of your backlog, your teams, and what needs you next."
        action={<NewButton onClick={() => setCreate(true)} />}
      />
      <div className="dashboard-toolbar">
        <div className="context-pill">
          <span className="live-dot" />
          {current ? current.name : "No active sprint"}{" "}
          <span className="muted">/ {project.name}</span>
        </div>
        <div className="filters">
          <select
            aria-label="Dashboard sprint"
            value={sprintId}
            onChange={(e) => setSprint(e.target.value)}
          >
            <option value="">All sprints</option>
            {sprints.data?.data.map((s: any) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <TeamSelector
            teams={teams.data?.data || []}
            value={teamId}
            onChange={setTeam}
          />
          <POSelector
            members={members.data?.data || []}
            value={ownerId}
            onChange={setOwner}
          />
        </div>
      </div>
      <div className="metrics">
        <MetricCard
          title="Total tickets"
          value={total}
          note={`${d.counts.BACKLOG} in backlog · ${d.counts.READY} ready`}
          icon={<Layers size={20} />}
        />
        <MetricCard
          title="In progress"
          value={d.counts.IN_PROGRESS}
          note={`${d.counts.IN_REVIEW} awaiting review`}
          icon={<Clock3 size={20} />}
        />
        <MetricCard
          title="Completed"
          value={done}
          note="Tickets with Done status"
          icon={<CheckCircle2 size={20} />}
        />
        <MetricCard
          title="Blocked tickets"
          value={d.blocked}
          note="One or more unresolved blockers"
          icon={<ShieldAlert size={20} />}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <div className="panel-heading">
            <h2>
              <span className="gold">
                <ClipboardCheck size={19} />
              </span>
              Needs your attention{" "}
              <span className="count gold">{attention}</span>
            </h2>
            <Link to="/reviews">
              Review queue <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="panel-subtitle">
            A few decisions today. Less friction for your teams tomorrow.
          </p>
          {[...d.reviews, ...d.indicators].slice(0, 4).map((r: any) => (
            <Link
              key={r.id}
              className="attention-row"
              to={r.ticketId ? `/tickets/${r.ticketId}` : "/reviews"}
            >
              <span className="attention-icon">
                <ClipboardCheck size={17} />
              </span>
              <span>
                <strong>{r.title}</strong>
                <small>
                  {r.automatic
                    ? "Automatic requirement check"
                    : "Explicit review request"}
                </small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
          {!attention && (
            <EmptyState text="No review requests or requirement gaps in this view." />
          )}
        </section>
        <section className="panel sprint-summary">
          <div className="panel-heading">
            <h2>
              <CalendarDays size={18} />
              Sprint progress
            </h2>
            <Link to="/sprints">
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <span className="eyebrow">
            {summarySprint ? summarySprint.name : "SELECTED TICKETS"}
          </span>
          <div className="progress-head">
            <strong>
              {percent}
              <span>%</span>
            </strong>
            <span>
              {summaryDone} of {summaryTotal}
              <small>tickets complete</small>
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="muted small">
            Completion counts tickets, not business value.
          </p>
          <div className="status-distribution">
            {Object.entries(summaryCounts).map(([status, count]) => (
              <div key={status}>
                <StatusBadge value={status} />
                <strong>{String(count)}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading">
            <h2>Recently updated</h2>
            <Link to="/backlog">
              View backlog <ArrowUpRight size={16} />
            </Link>
          </div>
          <TicketTable tickets={d.recent} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Open blockers</h2>
            <Link to="/blockers">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {d.blockers.slice(0, 3).map((b: any) => (
            <div className="mini-record" key={b.id}>
              <StatusBadge value={b.severity} />
              <Link to="/blockers">{b.title}</Link>
              <small>{b.ticket?.identifier || "Project blocker"}</small>
            </div>
          ))}
          {!d.blockers.length && <EmptyState text="No unresolved blockers." />}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Upcoming milestones</h2>
            <Link to="/sprints">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {d.sprints
            .filter((s: any) => new Date(s.endDate) >= now)
            .slice(0, 3)
            .map((s: any) => (
              <div className="mini-record" key={s.id}>
                <small>
                  {new Date(s.endDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </small>
                <Link to={`/sprints/${s.id}`}>{s.name} closes</Link>
                <span className="muted small">{s.goal}</span>
              </div>
            ))}
          {!d.sprints.some((s: any) => new Date(s.endDate) >= now) && (
            <EmptyState text="No upcoming sprint milestones." />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Recent decisions</h2>
            <Link to="/decisions">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          {d.decisions.map((decision: any) => (
            <div className="mini-record" key={decision.id}>
              <StatusBadge value={decision.status} />
              <Link to="/decisions">{decision.title}</Link>
              <small>
                {new Date(decision.decisionDate).toLocaleDateString()}
              </small>
            </div>
          ))}
          {!d.decisions.length && (
            <EmptyState text="Product decisions will appear here." />
          )}
        </section>
      </div>
      {create && <TicketEditor onClose={() => setCreate(false)} />}
    </>
  );
}
