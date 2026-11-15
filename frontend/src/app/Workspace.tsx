import { useAccount } from "./Account";
import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  NavLink,
  Outlet,
  Link,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
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
  const { project, href } = useWorkspace();
  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <Link to="/projects" className="brand">
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
          {project.name}
          <small>{project.key} &middot; Shared delivery</small>
        </span>
        <PanelLeftClose size={16} />
      </button>
      <Link className="my-projects-link" to="/projects">
        &larr; My Projects
      </Link>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {nav.map(([path, name, Icon]) => (
          <NavLink onClick={close} key={path} to={href(path)}>
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
        <NavLink to={href("/settings")}>
          <Settings size={18} />
          Workspace settings
        </NavLink>
      </div>
    </aside>
  );
}
export function AppHeader({ toggle }: { toggle: () => void }) {
  const { profile, projectId, projects, setProjectId, href } = useWorkspace();
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
          navigate(href(`/backlog?search=${encodeURIComponent(search)}`));
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
        to={href("/reviews")}
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
          <Link to={href("/settings")}>Your profile</Link>
          <SignOutButton>
            <LogOut size={16} /> Sign out
          </SignOutButton>
        </div>
      </details>
    </header>
  );
}
export function Workspace() {
  const { pathname } = useLocation();
  const { profile, projects } = useAccount();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const base = "/projects/" + projectId;
  const query = useQuery({
    queryKey: [base, "/"],
    queryFn: () => api(base),
    refetchInterval: 30000,
  });
  if (query.isPending) return <LoadingSkeleton />;
  if (query.error)
    return (
      <main className="setup">
        <ErrorState error={query.error} retry={() => void query.refetch()} />
        <Link to="/projects">Return to My Projects</Link>
      </main>
    );
  const project = query.data.data;
  const role =
    project.currentRole ||
    profile.memberships.find((m: any) => m.projectId === projectId)?.role ||
    "";
  if (!hasCapability(role, "project:read"))
    return (
      <main className="setup">
        <h1>Project access denied</h1>
        <Link to="/projects">My Projects</Link>
      </main>
    );
  return (
    <Context.Provider
      value={{
        profile,
        projects,
        projectId,
        project,
        role,
        notify: setNotice,
        base,
        href: (path: string) => base + path,
        setProjectId: (id: string) =>
          navigate("/projects/" + id + "/dashboard"),
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
            {notice && (
              <div className="notice" role="status">
                {notice}
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {project.archivedAt && (
              <div className="notice">
                Archived project: History is available. Reactivate it from My
                Projects before making changes.
              </div>
            )}
            <Outlet key={pathname} />
          </main>
          <footer className="app-footer">
            <span>
              <i />
              Shared workspace &middot; refreshes every 30 seconds
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
  const workspace = useWorkspace();
  if (workspace?.project?.archivedAt) return null;
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={17} />
      {children}
    </button>
  );
}
