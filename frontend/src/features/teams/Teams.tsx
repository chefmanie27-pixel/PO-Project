import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { useProjectQuery } from "../../hooks/useProject";
import {
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
} from "../../components/ui";
export function Teams() {
  const query = useProjectQuery("/teams"),
    sprints = useProjectQuery("/sprints");
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error) return <ErrorState error={query.error} />;
  const now = new Date();
  const currentIds = new Set(
    (sprints.data?.data || [])
      .filter(
        (s: any) => new Date(s.startDate) <= now && new Date(s.endDate) >= now,
      )
      .map((s: any) => s.id),
  );
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & OWNERSHIP"
        title="Development teams"
        description="Six teams. A shared direction. A clear view of every workload."
      />
      <div className="cards-grid">
        {query.data.data.map((team: any) => {
          const contacts = [
            ...new Map(
              team.tickets.map((t: any) => [t.owner.id, t.owner]),
            ).values(),
          ] as any[];
          return (
            <article key={team.id} className="panel team-card">
              <div className="team-icon">
                <Users size={24} />
              </div>
              <h2>{team.name}</h2>
              <p className="muted">{team.description}</p>
              <div className="team-stats">
                <div>
                  <strong>
                    {
                      team.tickets.filter((t: any) =>
                        currentIds.has(t.sprintId),
                      ).length
                    }
                  </strong>
                  <small>Current sprint</small>
                </div>
                <div>
                  <strong>
                    {
                      team.tickets.filter(
                        (t: any) => t.status === "IN_PROGRESS",
                      ).length
                    }
                  </strong>
                  <small>In progress</small>
                </div>
                <div>
                  <strong>
                    {
                      team.tickets.filter((t: any) => t.status === "DONE")
                        .length
                    }
                  </strong>
                  <small>Done</small>
                </div>
                <div>
                  <strong>
                    {team.tickets.filter((t: any) => t.blockers.length).length}
                  </strong>
                  <small>Blocked</small>
                </div>
              </div>
              <div className="team-contacts">
                {contacts.map((u) => (
                  <a key={u.id} href={`mailto:${u.email}`}>
                    {u.name}
                  </a>
                ))}
                {!contacts.length && <small>No ticket owners assigned.</small>}
              </div>
              <Link className="card-footer" to={`/backlog?teamId=${team.id}`}>
                {team.tickets.length} associated tickets{" "}
                <span>View backlog →</span>
              </Link>
            </article>
          );
        })}
        {!query.data.data.length && (
          <EmptyState text="Ask your administrator to configure teams." />
        )}
      </div>
    </>
  );
}
