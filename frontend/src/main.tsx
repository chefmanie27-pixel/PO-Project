import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Route,
  Navigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, Login, Protected } from "./features/auth/Auth";
import { Workspace } from "./app/Workspace";
import { Account } from "./app/Account";
import { Projects } from "./features/projects/Projects";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Backlog, TicketDetails } from "./features/tickets/Tickets";
import { Sprints } from "./features/sprints/Sprints";
import { Teams, TeamDetails } from "./features/teams/Teams";
import { Records } from "./features/productivity/Records";
import { Settings } from "./features/settings/Settings";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000 },
    mutations: { retry: false },
  },
});
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login />} />
      <Route
        element={
          <Protected>
            <Account />
          </Protected>
        }
      >
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<Workspace />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="backlog" element={<Backlog />} />
          <Route path="tickets/:ticketId" element={<TicketDetails />} />
          <Route path="sprints" element={<Sprints />} />
          <Route path="sprints/:sprintId" element={<Sprints />} />
          <Route path="teams" element={<Teams />} />
          <Route path="teams/:teamId" element={<TeamDetails />} />
          <Route path="reviews" element={<Records kind="reviews" />} />
          <Route path="blockers" element={<Records kind="blockers" />} />
          <Route path="decisions" element={<Records kind="decisions" />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </>,
  ),
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
