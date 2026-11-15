import { useState } from "react";
import { useProjectQuery } from "../hooks/useProject";
import { ActivityTimeline, ErrorState, LoadingSkeleton } from "./ui";
export function EntityHistory({ entityId }: { entityId: string }) {
  const [page, setPage] = useState(1);
  const query = useProjectQuery(
    `/audit-events?entityId=${entityId}&page=${page}`,
  );
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <>
      <ActivityTimeline events={query.data.data} />
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Newer history
        </button>
        <span>History page {page}</span>
        <button
          disabled={
            page * 30 >= (query.data.meta?.total ?? query.data.data.length)
          }
          onClick={() => setPage(page + 1)}
        >
          Older history
        </button>
      </div>
    </>
  );
}
