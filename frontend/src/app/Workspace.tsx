import { createContext, useContext, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Columns3,
  Users,
  ClipboardCheck,
  ShieldAlert,
  BookOpen,
  Settings,
  Search,
  Bell,
  PanelLeftClose,
  Menu,
  LogOut,
  ChevronDown,
  Plus,
} from "lucide-react";
import { api } from "../services/api";
import { SignOutButton } from "../features/auth/Auth";
import { ErrorState, LoadingSkeleton } from "../components/ui";
import { hasCapability } from "../../../shared/permissions";
const Context = createContext<any>(null);
export const useWorkspace = () => useContext(Context);
const nav = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/backlog", "Product backlog", ListTodo],
  ["/sprints", "Sprints", Columns3],
  ["/teams", "Teams", Users],
  ["/reviews", "PO review queue", ClipboardCheck],
  ["/blockers", "Blocker tracker", ShieldAlert],
  ["/decisions", "Decision log", BookOpen],
] as const;
export function AppSidebar({
  open,
  close,
}: {
  open: boolean;
  close: () => void;
}) {
  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <Link to="/dashboard" className="brand">
        <div className="brand-mark">
          P<span>O</span>
        </div>
        <div>
          Command Center<small>PRODUCT OWNER WORKSPACE</small>
        </div>
      </Link>
      <button className="workspace-button" onClick={close}>
        <span className="project-icon">P</span>
        <span>
          Product workspace<small>Shared product delivery</small>
        </span>
        <PanelLeftClose size={16} />
      </button>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {nav.map(([path, name, Icon]) => (
          <NavLink onClick={close} key={path} to={path}>
            <Icon size={19} />
            {name}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <span className="gold">✦</span>
          <strong>Clarity drives delivery.</strong>
          <p>Keep requirements, decisions and people moving together.</p>
        </div>
        <NavLink to="/settings">
          <Settings size={18} />
          Workspace settings
        </NavLink>
      </div>
    </aside>
  );
}
export function AppHeader({ toggle }: { toggle: () => void }) {
  const { profile, projectId, projects, setProjectId } = useWorkspace();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <button
        className="icon-button"
        aria-label="Toggle navigation"
        onClick={toggle}
      >
        <Menu size={20} />
      </button>
      <div className="breadcrumb">
        Workspace <span>/</span>
        <select
          aria-label="Select project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <form
        className="global-search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/backlog?search=${encodeURIComponent(search)}`);
        }}
      >
        <Search size={17} />
        <input
          aria-label="Search workspace tickets"
          placeholder="Search tickets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd>↵</kbd>
      </form>
      <Link
        className="icon-button"
        aria-label="View items requiring attention"
        to="/reviews"
      >
        <Bell size={20} />
      </Link>
      <details className="profile-menu">
        <summary>
          <span className="avatar">
            {profile.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            {profile.name}
            <small>Product workspace</small>
          </span>
          <ChevronDown size={15} />
        </summary>
        <div>
          <Link to="/settings">Your profile</Link>
          <SignOutButton>
            <LogOut size={16} /> Sign out
          </SignOutButton>
        </div>
      </details>
    </header>
  );
}
export function Workspace() {
  const query = useQuery({
    queryKey: ["profile"],
    queryFn: () => api("/profile"),
  });
  const [selected, setSelected] = useState(""),
    [open, setOpen] = useState(false);
  const cache = useQueryClient();
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <main className="setup">
        <ErrorState error={query.error} retry={() => void query.refetch()} />
        <SignOutButton />
      </main>
    );
  const profile = query.data.data;
  const projects = profile.memberships
    .filter((m: any) => hasCapability(m.role, "project:read"))
    .map((m: any) => m.project);
  if (!projects.length)
    return (
      <main className="setup">
        <h1>Your account is awaiting project access</h1>
        <p>Ask an administrator to add your Firebase account to a project.</p>
        <SignOutButton />
      </main>
    );
  const projectId = projects.some((p: any) => p.id === selected)
    ? selected
    : projects[0].id;
  const member = profile.memberships.find(
    (m: any) => m.projectId === projectId,
  );
  return (
    <Context.Provider
      value={{
        profile,
        projectId,
        projects,
        role: member.role,
        base: `/projects/${projectId}`,
        setProjectId: (id: string) => {
          setSelected(id);
          cache.clear();
        },
      }}
    >
      <div className={open ? "app-shell nav-open" : "app-shell"}>
        <AppSidebar open={open} close={() => setOpen(false)} />
        {open && (
          <button
            className="nav-scrim"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <div className="workspace">
          <AppHeader toggle={() => setOpen(!open)} />
          <main className="content">
            <Outlet key={projectId} />
          </main>
          <footer className="app-footer">
            <span>
              <i /> Shared workspace · refreshes every 30 seconds
            </span>
            <span>PO Command Center</span>
          </footer>
        </div>
      </div>
    </Context.Provider>
  );
}
export function NewButton({
  onClick,
  children = "New ticket",
}: {
  onClick: () => void;
  children?: string;
}) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
