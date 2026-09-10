import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CyclePicker } from "@/features/cycles/CyclePicker";
import { TeamGrid } from "@/features/teams/TeamGrid";
import { api, type Cycle, type League, type Player, type Team } from "@/lib/api";

export function TeamsPage() {
  const [selection, setSelection] = useState<{ league: League; cycle: Cycle | null } | null>(null);

  return (
    <div className="space-y-6">
      <CyclePicker onChange={setSelection} />

      {!selection && <p className="text-sm text-muted-foreground">Loading...</p>}
      {selection && !selection.cycle && (
        <p className="text-sm text-muted-foreground">
          Select or create a cycle above to generate and manage its teams.
        </p>
      )}
      {selection?.cycle && <CycleTeams league={selection.league} cycle={selection.cycle} />}
    </div>
  );
}

type Requirement = { label: string; required: number; actual: number };

function CycleTeams({ league, cycle }: { league: League; cycle: Cycle }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getPlayers(league.id).then(setPlayers);
  }, [league.id]);

  const loadTeams = () => {
    api
      .getTeams(cycle.id)
      .then(setTeams)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };
  useEffect(loadTeams, [cycle.id]);

  const active = players?.filter((p) => p.active) ?? [];
  const count = (fn: (p: Player) => boolean) => active.filter(fn).length;

  // Invariants from intent doc §4 — always-applicable checks the server
  // re-validates authoritatively before generating.
  const requirements: Requirement[] = players
    ? [
        { label: "Roster size (min)", required: cycle.teamCount * 3, actual: active.length },
        { label: "Roster size (max)", required: cycle.teamCount * 4, actual: active.length },
        { label: "Skip-eligible", required: cycle.teamCount, actual: count((p) => p.canPlaySkip) },
        { label: "Vice-eligible", required: cycle.teamCount - 3, actual: count((p) => p.canPlayVice) },
        { label: "Second-eligible", required: cycle.teamCount - 3, actual: count((p) => p.canPlaySecond) },
        { label: "Lead-eligible", required: cycle.teamCount - 3, actual: count((p) => p.canPlayLead) },
      ]
    : [];

  const sizeOk = active.length >= cycle.teamCount * 3 && active.length <= cycle.teamCount * 4;
  const skipOk = count((p) => p.canPlaySkip) >= cycle.teamCount;
  const viceOk = count((p) => p.canPlayVice) >= cycle.teamCount - 3;
  const secondOk = count((p) => p.canPlaySecond) >= cycle.teamCount - 3;
  const leadOk = count((p) => p.canPlayLead) >= cycle.teamCount - 3;
  const readyToGenerate = sizeOk && skipOk && viceOk && secondOk && leadOk;

  const generate = async () => {
    if (teams && teams.length > 0) {
      const proceed = window.confirm(
        "This cycle already has teams. Regenerating will discard the current assignments (including any manual edits) and, if a schedule was already generated, flag it stale. Continue?",
      );
      if (!proceed) return;
    }
    setGenerating(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await api.generateTeams(cycle.id);
      setTeams(result.teams);
      setWarnings(result.warnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
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
        <Button
          disabled={!readyToGenerate || generating}
          onClick={generate}
          title={readyToGenerate ? undefined : "Roster doesn't yet meet the requirements below"}
        >
          {generating ? "Generating..." : teams && teams.length > 0 ? "Regenerate Teams" : "Generate Teams"}
        </Button>
      </div>

      {players && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Roster readiness for this cycle</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {requirements.map((req) => (
              <li key={req.label} className="flex items-center gap-2">
                <span className={req.actual >= req.required ? "text-green-600" : "text-destructive"}>
                  {req.actual >= req.required ? "✓" : "✗"}
                </span>
                <span className="text-muted-foreground">
                  {req.label}: {req.actual} / {req.required}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="mb-1 font-medium">Generation completed with warnings:</p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {teams && teams.length > 0 && players && (
        <TeamGrid teams={teams} players={players} onChanged={loadTeams} />
      )}
      {teams && teams.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No teams generated yet for this cycle.
        </p>
      )}
    </div>
  );
}
