import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type Player, type Position, type Team } from "@/lib/api";

const POSITION_LABELS: Record<Position, string> = {
  SKIP: "Skip",
  VICE: "Vice",
  SECOND: "Second",
  LEAD: "Lead",
};

const SPARE = "__SPARE__";
const SWAP_PREFIX = "__SWAP__:";

function isEligibleForPosition(player: Player, position: Position): boolean {
  switch (position) {
    case "SKIP":
      return player.canPlaySkip;
    case "VICE":
      return player.canPlayVice;
    case "SECOND":
      return player.canPlaySecond;
    case "LEAD":
      return player.canPlayLead;
  }
}

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

  // Anyone already on a team in this cycle — excluded from *other* slots'
  // dropdowns (a player can only be on one team), but never from their own
  // current slot.
  const assignedElsewhere = new Set<string>();
  for (const t of teams) for (const s of t.slots) if (s.playerId) assignedElsewhere.add(s.playerId);

  const updateSlot = async (slotId: string, value: string) => {
    setError(null);
    try {
      if (value.startsWith(SWAP_PREFIX)) {
        await api.swapTeamSlots(slotId, value.slice(SWAP_PREFIX.length));
      } else {
        await api.updateTeamSlot(slotId, value === SPARE ? null : value);
      }
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

                // Eligible for this position, and either free or already the
                // current occupant of *this* slot.
                const eligible = activePlayers.filter(
                  (p) =>
                    isEligibleForPosition(p, position) && (p.id === slot.playerId || !assignedElsewhere.has(p.id)),
                );

                // A manual override can place someone regardless of eligibility
                // (intentional escape hatch — see generation warnings), and the
                // current occupant might since have been deactivated. Either
                // way, make sure they still appear so the dropdown reflects
                // reality instead of silently hiding the current value.
                const options =
                  slot.player && !eligible.some((p) => p.id === slot.player!.id) ? [...eligible, slot.player] : eligible;

                // Swap candidates: the same position's occupant on every
                // *other* team. This is the only way to move a Skip between
                // teams (Skip can never pass through SPARE), and works the
                // same way for any other position as a one-step alternative
                // to "mark this one SPARE, then pick them from the other
                // slot" — trading two same-position occupants directly is
                // always eligibility-safe, since both already qualified to
                // be assigned there.
                const swapCandidates = teams
                  .filter((t) => t.id !== team.id)
                  .flatMap((t) =>
                    t.slots
                      .filter((s) => s.position === position && s.player)
                      .map((s) => ({ slotId: s.id, player: s.player!, teamNumber: t.teamNumber })),
                  );

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
                        {swapCandidates.length > 0 && (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Swap with</SelectLabel>
                              {swapCandidates
                                .sort((a, b) => a.teamNumber - b.teamNumber)
                                .map((c) => (
                                  <SelectItem key={c.slotId} value={`${SWAP_PREFIX}${c.slotId}`}>
                                    {c.player.name} (Team {c.teamNumber})
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </>
                        )}
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
