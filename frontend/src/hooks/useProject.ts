import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "../app/Workspace";
import { api, send } from "../services/api";
export function useProjectQuery(path: string) {
  const { base } = useWorkspace();
  return useQuery({
    queryKey: [base, path],
    queryFn: () => api(base + path),
    refetchInterval: 30000,
  });
}
export function useProjectMutation() {
  const { base } = useWorkspace();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      data,
    }: {
      path: string;
      method?: string;
      data: unknown;
    }) => api(base + path, send(method, data)),
    onSuccess: () => client.invalidateQueries({ queryKey: [base] }),
  });
}
