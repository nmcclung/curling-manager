import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CyclePicker } from "@/features/cycles/CyclePicker";
import { api, type Cycle, type DrawTime, type League, type Match, type ScheduleWithMatches, type Team } from "@/lib/api";

export function SchedulePage() {
  const [selection, setSelection] = useState<{ league: League; cycle: Cycle | null } | null>(null);

  return (
    <div className="space-y-6">
      <CyclePicker onChange={setSelection} />

      {!selection && <p className="text-sm text-muted-foreground">Loading...</p>}
      {selection && !selection.cycle && (
        <p className="text-sm text-muted-foreground">
          Select or create a cycle above to generate and view its schedule.
        </p>
      )}
      {selection?.cycle && <CycleSchedule league={selection.league} cycle={selection.cycle} />}
    </div>
  );
}

function CycleSchedule({ league, cycle }: { league: League; cycle: Cycle }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [data, setData] = useState<ScheduleWithMatches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getTeams(cycle.id).then(setTeams);
  }, [cycle.id]);

  const loadSchedule = () => {
    api
      .getSchedule(cycle.id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };
  useEffect(loadSchedule, [cycle.id]);

  const teamsReady = teams !== null && teams.length === cycle.teamCount;

  const generate = async () => {
    if (data && data.matches.length > 0) {
      const proceed = window.confirm(
        "This cycle already has a schedule. Regenerating will replace it. Continue?",
      );
      if (!proceed) return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await api.generateSchedule(cycle.id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const markReviewed = async () => {
    setError(null);
    try {
      const schedule = await api.markScheduleReviewed(cycle.id);
      setData((prev) => (prev ? { ...prev, schedule } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">
            {league.name} — Cycle {cycle.cycleNumber}
          </h2>
          <p className="text-sm text-muted-foreground">{cycle.teamCount} teams</p>
        </div>
        <div className="flex gap-2">
          {data && data.matches.length > 0 && (
            <Button variant="outline" asChild>
              <a href={`/print/${cycle.id}`} target="_blank" rel="noreferrer">
                Print / Export PDF
              </a>
            </Button>
          )}
          <Button
            disabled={!teamsReady || generating}
            onClick={generate}
            title={teamsReady ? undefined : "Generate this cycle's teams first"}
          >
            {generating ? "Generating..." : data && data.matches.length > 0 ? "Regenerate Schedule" : "Generate Schedule"}
          </Button>
        </div>
      </div>

      {teams !== null && !teamsReady && (
        <p className="text-sm text-muted-foreground">
          This cycle doesn't have generated teams yet — go to the Teams page first.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data?.schedule?.isStale && (
        <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>
            <span className="font-medium">Stale:</span> teams changed since this schedule was generated.
          </p>
          <Button variant="outline" size="sm" onClick={markReviewed}>
            Mark Reviewed
          </Button>
        </div>
      )}

      {data && data.matches.length > 0 && <ScheduleGrid matches={data.matches} />}
      {data && data.matches.length === 0 && teamsReady && (
        <p className="text-sm text-muted-foreground">No schedule generated yet for this cycle.</p>
      )}
    </div>
  );
}

function ScheduleGrid({ matches }: { matches: Match[] }) {
  const weekNumbers = [...new Set(matches.map((m) => m.weekNumber))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {weekNumbers.map((week) => (
        <div key={week} className="rounded-lg border">
          <div className="border-b bg-muted/50 px-4 py-2 font-medium">Week {week}</div>
          <div className="divide-y">
            {(["EARLY", "LATE"] as DrawTime[]).map((drawTime) => (
              <DrawRow key={drawTime} label={drawTime === "EARLY" ? "6:45 PM" : "8:45 PM"} matches={matches.filter((m) => m.weekNumber === week && m.drawTime === drawTime)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DrawRow({ label, matches }: { label: string; matches: Match[] }) {
  const bySheet = [...matches].sort((a, b) => a.sheetNumber - b.sheetNumber);

  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <span className="w-20 shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
        {bySheet.map((match) => (
          <div key={match.id} className="rounded-md border p-2 text-sm">
            <div className="mb-1 text-xs text-muted-foreground">Sheet {match.sheetNumber}</div>
            {match.isGhost ? (
              <Badge variant="outline">open</Badge>
            ) : (
              <div className="space-y-0.5">
                <TeamLine team={match.homeTeam} />
                <div className="text-xs text-muted-foreground">vs</div>
                <TeamLine team={match.awayTeam} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamLine({ team }: { team: Match["homeTeam"] }) {
  if (!team) return <span className="text-muted-foreground">—</span>;
  const skip = team.slots[0]?.player;
  return (
    <div>
      <span className="font-medium">Team {team.teamNumber}</span>
      {skip && <span className="text-muted-foreground"> ({skip.name})</span>}
    </div>
  );
}
