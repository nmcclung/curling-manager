import type { ReactNode } from "react";
import { NavLink, Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { cn } from "cn";
import { RosterPage } from "@/features/roster/RosterPage";
import { SchedulePage } from "@/features/schedule/SchedulePage";
import { TeamsPage } from "@/features/teams/TeamsPage";

const NAV_LINKS = [
  { to: "/roster", label: "Roster" },
  { to: "/teams", label: "Teams" },
  { to: "/schedule", label: "Schedule" },
];

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-8 py-4">
          <h1 className="text-lg font-semibold">Curling League Manager</h1>
          <nav className="flex gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-8">{children}</main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/roster" replace />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
