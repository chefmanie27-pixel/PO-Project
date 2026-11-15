import { useId, useState } from "react";
import { useProjectQuery } from "../hooks/useProject";
import { ErrorState } from "./ui";

export function TicketPicker({
  label,
  value,
  onChange,
  multiple = false,
  exclude = [],
  selected = [],
}: {
  label: string;
  value: string | string[] | null | undefined;
  onChange: (value: any, records?: any[]) => void;
  multiple?: boolean;
  exclude?: string[];
  selected?: any[];
}) {
  const [search, setSearch] = useState("");
  const [remembered, setRemembered] = useState<any[]>([]);
  const id = useId();
  const query = useProjectQuery(
    `/tickets?limit=100&search=${encodeURIComponent(search)}`,
  );
  const rows = [
    ...new Map(
      [...remembered, ...selected, ...(query.data?.data || [])]
        .filter((t) => t && !exclude.includes(t.id))
        .map((t) => [t.id, t]),
    ).values(),
  ];
  return (
    <fieldset className="ticket-picker">
      <legend>{label}</legend>
      <label htmlFor={`${id}-search`}>
        Search by ticket title or identifier
      </label>
      <input
        id={`${id}-search`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Type a title or ticket identifier"
      />
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        multiple={multiple}
        value={value || (multiple ? [] : "")}
        onChange={(e) => {
          const ids = Array.from(e.target.selectedOptions, (o) => o.value);
          setRemembered(rows.filter((t) => ids.includes(t.id)));
          onChange(multiple ? ids : e.target.value || null, rows);
        }}
        disabled={query.isPending || !!query.error}
      >
        {!multiple && <option value="">No linked ticket</option>}
        {rows.map((t) => (
          <option key={t.id} value={t.id}>
            {t.identifier} - {t.title}
          </option>
        ))}
      </select>
      {query.isPending && <small role="status">Loading tickets...</small>}
      {query.error && (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      )}
      {multiple && (
        <small>
          Hold Ctrl (Command on Mac) to select multiple tickets. On mobile, use
          the selection menu.
        </small>
      )}
      {!!query.data?.meta && query.data.meta.total > 100 && (
        <small>
          Showing 100 matches. Refine your search to find another ticket.
        </small>
      )}
    </fieldset>
  );
}
