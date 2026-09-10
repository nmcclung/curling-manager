import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Cycle, type League, type TeamCount } from "@/lib/api";
import { SeasonPicker } from "@/features/seasons/SeasonPicker";
import { cn } from "cn";

const TEAM_COUNTS: TeamCount[] = [12, 14, 16];

export function CyclePicker({
  onChange,
}: {
  onChange: (selection: { league: League; cycle: Cycle | null } | null) => void;
}) {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [cycles, setCycles] = useState<Cycle[] | null>(null);

  const [leagueId, setLeagueId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");
  const [cycleId, setCycleId] = useState<string>("");

  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [deletingCycle, setDeletingCycle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getLeagues().then((data) => {
      setLeagues(data);
      setLeagueId((current) => current || data[0]?.id || "");
    });
  }, []);

  const loadCycles = () => {
    if (!seasonId || !leagueId) return;
    api.getCycles(seasonId, leagueId).then((data) => {
      setCycles(data);
      setCycleId((current) => (data.some((c) => c.id === current) ? current : ""));
    });
  };

  useEffect(loadCycles, [seasonId, leagueId]);

  const league = leagues?.find((l) => l.id === leagueId) ?? null;
  const cycle = cycles?.find((c) => c.id === cycleId) ?? null;

  const deleteCycle = async () => {
    if (!cycle) return;
    const proceed = window.confirm(
      `Delete Cycle ${cycle.cycleNumber} (${cycle.teamCount} teams)? This also deletes any teams, matches, and schedule generated for it. This cannot be undone.`,
    );
    if (!proceed) return;

    setError(null);
    setDeletingCycle(true);
    try {
      await api.deleteCycle(cycle.id);
      setCycles((prev) => (prev ?? []).filter((c) => c.id !== cycle.id));
      setCycleId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingCycle(false);
    }
  };

  // Deliberately keyed on id, not on `league`/`cycle`/`onChange` object identity —
  // those are new references every render and would cause a notify loop.
  useEffect(() => {
    onChange(league ? { league, cycle } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id, cycle?.id]);

  if (!leagues) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <SeasonPicker seasonId={seasonId} onSeasonIdChange={setSeasonId} />

        <Tabs value={leagueId} onValueChange={setLeagueId}>
          <TabsList>
            {leagues.map((l) => (
              <TabsTrigger key={l.id} value={l.id}>
                {l.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {seasonId && league && (
        <div className="flex flex-wrap items-center gap-2">
          {cycles?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCycleId(c.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                c.id === cycleId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Cycle {c.cycleNumber} <span className="opacity-70">({c.teamCount} teams)</span>
            </button>
          ))}
          {cycles?.length === 0 && (
            <p className="text-sm text-muted-foreground">No cycles yet for {league.name}.</p>
          )}
          <Button variant="outline" size="sm" onClick={() => setCycleDialogOpen(true)}>
            New Cycle
          </Button>
          {cycle && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deletingCycle}
              onClick={deleteCycle}
            >
              Delete Cycle
            </Button>
          )}
        </div>
      )}

      {league && (
        <NewCycleDialog
          open={cycleDialogOpen}
          onOpenChange={setCycleDialogOpen}
          seasonId={seasonId}
          league={league}
          nextCycleNumber={(cycles?.at(-1)?.cycleNumber ?? 0) + 1}
          onCreated={(created) => {
            setCycles((prev) => [...(prev ?? []), created]);
            setCycleId(created.id);
          }}
        />
      )}
    </div>
  );
}

function NewCycleDialog({
  open,
  onOpenChange,
  seasonId,
  league,
  nextCycleNumber,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seasonId: string;
  league: League;
  nextCycleNumber: number;
  onCreated: (cycle: Cycle) => void;
}) {
  const [teamCount, setTeamCount] = useState<string>("12");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTeamCount("12");
      setError(null);
    }
  }, [open]);

  const create = async () => {
    try {
      const cycle = await api.createCycle({
        seasonId,
        leagueId: league.id,
        teamCount: Number(teamCount) as TeamCount,
      });
      onCreated(cycle);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            New Cycle — {league.name}, Cycle {nextCycleNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Number of teams for this cycle</p>
          <div className="flex gap-2">
            {TEAM_COUNTS.map((count) => (
              <Badge
                key={count}
                variant={String(count) === teamCount ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-sm"
                onClick={() => setTeamCount(String(count))}
              >
                {count} teams
              </Badge>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
