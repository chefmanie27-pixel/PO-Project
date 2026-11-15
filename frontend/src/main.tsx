import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, Login, Protected } from "./features/auth/Auth";
import { Workspace } from "./app/Workspace";
import { Dashboard } from "./features/dashboard/Dashboard";
import { Backlog, TicketDetails } from "./features/tickets/Tickets";
import { Sprints } from "./features/sprints/Sprints";
import { Teams } from "./features/teams/Teams";
import { Records } from "./features/productivity/Records";
import { Settings } from "./features/settings/Settings";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10000 },
    mutations: { retry: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login />} />
            <Route
              element={
                <Protected>
                  <Workspace />
                </Protected>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/backlog" element={<Backlog />} />
              <Route path="/tickets/:id" element={<TicketDetails />} />
              <Route path="/sprints" element={<Sprints />} />
              <Route path="/sprints/:id" element={<Sprints />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/reviews" element={<Records kind="reviews" />} />
              <Route path="/blockers" element={<Records kind="blockers" />} />
              <Route path="/decisions" element={<Records kind="decisions" />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
