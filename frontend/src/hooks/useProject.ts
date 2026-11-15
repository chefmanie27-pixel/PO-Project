import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../app/Workspace";
import { api, send } from "../services/api";
import { markDraftSaved } from "../services/drafts";
export function useProjectQuery(path: string) {
  const { base } = useWorkspace();
  return useQuery({
    queryKey: [base, path],
    queryFn: () => api(base + path),
    refetchInterval: 30000,
  });
}
export function useProjectMutation() {
  const { base, notify } = useWorkspace();
  const client = useQueryClient();
  return useMutation({
    onMutate: () => {
      notify?.("");
    },
    mutationFn: ({
      path,
      method = "POST",
      data,
    }: {
      path: string;
      method?: string;
      data: unknown;
    }) => api(base + path, send(method, data)),
    onSuccess: () => {
      markDraftSaved();
      notify?.("Changes saved.");
      return Promise.all([
        client.invalidateQueries({ queryKey: [base] }),
        client.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });
}
