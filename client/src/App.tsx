import { Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { PrintSchedulePage } from "@/features/schedule/PrintSchedulePage";
import { RosterPage } from "@/features/roster/RosterPage";
import { SchedulePage } from "@/features/schedule/SchedulePage";
import { TeamsPage } from "@/features/teams/TeamsPage";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";

const NAV_LINKS = [
  { to: "/roster", label: "Roster" },
  { to: "/teams", label: "Teams" },
  { to: "/schedule", label: "Schedule" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="ml-auto"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-6 px-8 py-4">
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
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl p-8">{children}</main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/roster" replace />} />
        <Route
          path="/roster"
          element={
            <Layout>
              <RosterPage />
            </Layout>
          }
        />
        <Route
          path="/teams"
          element={
            <Layout>
              <TeamsPage />
            </Layout>
          }
        />
        <Route
          path="/schedule"
          element={
            <Layout>
              <SchedulePage />
            </Layout>
          }
        />
        {/* No Layout — this is a standalone printable page (no app nav/chrome). */}
        <Route path="/print/:cycleId" element={<PrintSchedulePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
