import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type League, type Player, type TimeSlotPair } from "@/lib/api";

const PRIORITY_LABELS: Record<number, string> = { 2: "High", 1: "Medium", 0: "Low" };

export function PairsSection({
  league,
  seasonId,
  players,
}: {
  league: League;
  seasonId: string;
  players: Player[];
}) {
  const [pairs, setPairs] = useState<TimeSlotPair[] | null>(null);
  const [playerAId, setPlayerAId] = useState<string>("");
  const [playerBId, setPlayerBId] = useState<string>("");
  const [priority, setPriority] = useState<string>("2");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .getPairs(seasonId, league.id)
      .then(setPairs)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  // Re-fetch only when the roster's active-player membership actually
  // changes (not on every parent re-render, which creates a fresh
  // `players` array reference on every edit elsewhere on the page).
  const playerIdsKey = players.map((p) => p.id).join(",");
  useEffect(load, [seasonId, league.id, playerIdsKey]);

  const addPair = async () => {
    if (!playerAId || !playerBId) return;
    setError(null);
    try {
      const created = await api.createPair({
        leagueId: league.id,
        seasonId,
        playerAId,
        playerBId,
        priority: Number(priority),
      });
      setPairs((prev) => [created, ...(prev ?? [])]);
      setPlayerAId("");
      setPlayerBId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removePair = async (id: string) => {
    setError(null);
    try {
      await api.deletePair(id);
      setPairs((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Timeslot Pairs</h2>
      <p className="text-sm text-muted-foreground">
        Players who want to end up in the same early/late time-slot group each cycle.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={playerAId} onValueChange={setPlayerAId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Player A" />
          </SelectTrigger>
          <SelectContent>
            {players.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={playerBId} onValueChange={setPlayerBId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Player B" />
          </SelectTrigger>
          <SelectContent>
            {players.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">High</SelectItem>
            <SelectItem value="1">Medium</SelectItem>
            <SelectItem value="0">Low</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={addPair} disabled={!playerAId || !playerBId}>
          Add pair
        </Button>
      </div>

      <ul className="divide-y">
        {pairs?.map((pair) => {
          const hasInactiveMember = !pair.playerA.active || !pair.playerB.active;
          return (
            <li key={pair.id} className="flex items-center justify-between py-2">
              <span>
                {pair.playerA.name} &harr; {pair.playerB.name}
                {hasInactiveMember && (
                  <span className="ml-2 text-destructive">
                    ⚠ {!pair.playerA.active && !pair.playerB.active ? "both inactive" : "one player inactive"} — consider removing
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{PRIORITY_LABELS[pair.priority] ?? pair.priority}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => removePair(pair.id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
        {pairs?.length === 0 && <li className="py-2 text-sm text-muted-foreground">No pairs yet.</li>}
      </ul>
    </div>
  );
}
