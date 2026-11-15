import { createContext, useContext } from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { ErrorState, LoadingSkeleton } from "../components/ui";
import { SignOutButton } from "../features/auth/Auth";
const AccountContext = createContext<any>(null);
export function useAccount() {
  return useContext(AccountContext);
}
export function Account() {
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => api("/profile"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api("/projects?includeArchived=true"),
    enabled: !!profile.data,
    refetchInterval: 30000,
  });
  if (profile.isPending || (projects.isPending && !profile.error))
    return <LoadingSkeleton />;
  const error = profile.error || projects.error;
  if (error)
    return (
      <main className="setup">
        <ErrorState
          error={error}
          retry={() => {
            void profile.refetch();
            void projects.refetch();
          }}
        />
        <SignOutButton />
      </main>
    );
  return (
    <AccountContext.Provider
      value={{
        profile: profile.data.data,
        projects: projects.data?.data || [],
      }}
    >
      <Outlet />
    </AccountContext.Provider>
  );
}
