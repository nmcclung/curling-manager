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

type Requirement = { label: string; required: number; actual: number; direction: "min" | "max" };

function passes(req: Requirement): boolean {
  return req.direction === "min" ? req.actual >= req.required : req.actual <= req.required;
}

type PositionKey = "canPlaySkip" | "canPlayVice" | "canPlaySecond" | "canPlayLead";

function eligibilityCount(p: Player): number {
  return [p.canPlaySkip, p.canPlayVice, p.canPlaySecond, p.canPlayLead].filter(Boolean).length;
}

function CycleTeams({ league, cycle }: { league: League; cycle: Cycle }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getPlayers(cycle.seasonId, league.id).then(setPlayers);
  }, [cycle.seasonId, league.id]);

  const loadTeams = () => {
    api
      .getTeams(cycle.id)
      .then(setTeams)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };
  useEffect(loadTeams, [cycle.id]);

  const active = players?.filter((p) => p.active) ?? [];
  const count = (fn: (p: Player) => boolean) => active.filter(fn).length;
  const specialistCount = (key: PositionKey) => active.filter((p) => p[key] && eligibilityCount(p) === 1).length;

  // Invariants from intent doc §4 (min requirements) plus a derived, fully
  // deterministic check (max requirements): single-position specialists for
  // a position compete only against each other for exactly `teamCount`
  // slots, with zero fallback if they lose — Skip can never be a SPARE, and
  // Vice/Second/Lead specialists who miss out aren't retried elsewhere
  // since every slot for their one position is already full. The server
  // re-validates all of this authoritatively before generating.
  const requirements: Requirement[] = players
    ? [
        { label: "Roster size (min)", required: cycle.teamCount * 3, actual: active.length, direction: "min" },
        { label: "Roster size (max)", required: cycle.teamCount * 4, actual: active.length, direction: "max" },
        { label: "Skip-eligible", required: cycle.teamCount, actual: count((p) => p.canPlaySkip), direction: "min" },
        {
          label: "Vice-eligible",
          required: cycle.teamCount - 3,
          actual: count((p) => p.canPlayVice),
          direction: "min",
        },
        {
          label: "Second-eligible",
          required: cycle.teamCount - 3,
          actual: count((p) => p.canPlaySecond),
          direction: "min",
        },
        {
          label: "Lead-eligible",
          required: cycle.teamCount - 3,
          actual: count((p) => p.canPlayLead),
          direction: "min",
        },
        {
          label: "Skip-only specialists",
          required: cycle.teamCount,
          actual: specialistCount("canPlaySkip"),
          direction: "max",
        },
        {
          label: "Vice-only specialists",
          required: cycle.teamCount,
          actual: specialistCount("canPlayVice"),
          direction: "max",
        },
        {
          label: "Second-only specialists",
          required: cycle.teamCount,
          actual: specialistCount("canPlaySecond"),
          direction: "max",
        },
        {
          label: "Lead-only specialists",
          required: cycle.teamCount,
          actual: specialistCount("canPlayLead"),
          direction: "max",
        },
      ]
    : [];

  const readyToGenerate = requirements.length > 0 && requirements.every(passes);

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
                <span className={passes(req) ? "text-green-600" : "text-destructive"}>
                  {passes(req) ? "✓" : "✗"}
                </span>
                <span className="text-muted-foreground">
                  {req.label}: {req.actual} {req.direction === "min" ? `/ ${req.required}` : `(limit ${req.required})`}
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
