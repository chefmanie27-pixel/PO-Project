// Workload views use canonical ticket IDs and lightweight fields. Full requirements
// remain available through the protected ticket detail endpoint.
export const workloadTicketSelect = {
  id: true,
  projectId: true,
  identifier: true,
  title: true,
  type: true,
  priority: true,
  status: true,
  ownerId: true,
  teamId: true,
  sprintId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true } },
  team: { select: { id: true, name: true, status: true, archivedAt: true } },
  blockers: {
    where: { status: { not: "RESOLVED" } },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      ticketId: true,
    },
  },
} as const;
