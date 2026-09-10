import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Player, type Position, type Team } from "@/lib/api";

const POSITION_LABELS: Record<Position, string> = {
  SKIP: "Skip",
  VICE: "Vice",
  SECOND: "Second",
  LEAD: "Lead",
};

const SPARE = "__SPARE__";

export function TeamGrid({
  teams,
  players,
  onChanged,
}: {
  teams: Team[];
  players: Player[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const activePlayers = players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));

  const updateSlot = async (slotId: string, value: string) => {
    setError(null);
    try {
      await api.updateTeamSlot(slotId, value === SPARE ? null : value);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="rounded-lg border p-4">
            <h3 className="mb-2 font-medium">Team {team.teamNumber}</h3>
            <div className="space-y-2">
              {(["SKIP", "VICE", "SECOND", "LEAD"] as Position[]).map((position) => {
                const slot = team.slots.find((s) => s.position === position);
                if (!slot) return null;
                const isSpare = slot.playerId === null;

                // Make sure the currently-assigned player always appears as an
                // option, even if they've since been deactivated.
                const options =
                  slot.player && !activePlayers.some((p) => p.id === slot.player!.id)
                    ? [...activePlayers, slot.player]
                    : activePlayers;

                return (
                  <div key={slot.id} className="flex items-center justify-between gap-2">
                    <span className="w-14 shrink-0 text-sm text-muted-foreground">
                      {POSITION_LABELS[position]}
                    </span>
                    <Select value={isSpare ? SPARE : slot.playerId!} onValueChange={(v) => updateSlot(slot.id, v)}>
                      <SelectTrigger className="h-8 flex-1 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {position !== "SKIP" && (
                          <SelectItem value={SPARE}>
                            <Badge variant="outline">SPARE</Badge>
                          </SelectItem>
                        )}
                        {options.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
