import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ShortcutsHelp from "./ShortcutsHelp.jsx";

const navItems = [
  { to: "/", label: "Overview", end: true },
  { to: "/employees", label: "Employees" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/team", label: "Team & Succession" },
  { to: "/model-quality", label: "Model Quality" },
  { to: "/disputes", label: "Disputes" },
  { to: "/bias-audit", label: "Bias Audit" },
  { to: "/chat", label: "Ask TalentIQ" },
  { to: "/about", label: "About" },
];

function currentPageTitle(pathname) {
  if (pathname.startsWith("/employees/")) return "Employee Detail";
  if (pathname === "/") return "Overview";
  const match = navItems.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return match?.label || "TalentIQ";
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Below `lg` the sidebar becomes an overlay drawer instead of a permanent
  // column — a fixed 240px rail plus dense tables/charts doesn't fit a
  // tablet-width viewport otherwise.
  const [navOpen, setNavOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const sidebarContent = (
    <>
      <div className="px-5 py-5">
        <span className="text-lg font-semibold tracking-tight">
          Talent<span className="text-brand">IQ</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-surface-2 text-ink border-l-2 border-brand"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink border-l-2 border-transparent"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <p className="truncate text-xs text-ink-muted" title={user?.email}>{user?.email}</p>
        <button
          onClick={handleLogout}
          className="mt-2 w-full rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-brand hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      {/* Permanent sidebar at lg+; hidden entirely below it in favor of the overlay drawer */}
      <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        {sidebarContent}
      </aside>

      {/* Overlay drawer for < lg */}
      {navOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setNavOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="relative flex h-full w-60 flex-col border-r border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main column: its own top bar with the current section name, content scrolls independently below it */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:px-8">
          <button
            onClick={() => setNavOpen(true)}
            className="rounded-md border border-line px-2 py-1 text-ink-muted hover:text-ink lg:hidden"
            aria-label="Open navigation"
          >
            ☰
          </button>
          <h1 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
            {currentPageTitle(location.pathname)}
          </h1>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">{children}</main>
      </div>

      <ShortcutsHelp />
    </div>
  );
}
