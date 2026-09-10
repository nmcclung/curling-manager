import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type Season } from "@/lib/api";

// Shared by RosterPage (season + league only) and CyclePicker (season +
// league + cycle) — rosters are season-scoped now, same as cycles/teams/
// schedules, so both pages need "pick or create a season" as their first
// step. Owns the season list end-to-end (select, create, delete) so that
// logic — and the delete-confirmation impact summary, which now spans
// players/pairs as well as cycles — lives in exactly one place.
export function SeasonPicker({
  seasonId,
  onSeasonIdChange,
}: {
  seasonId: string;
  onSeasonIdChange: (seasonId: string) => void;
}) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSeasons().then((data) => {
      setSeasons(data);
      if (!seasonId && data[0]) onSeasonIdChange(data[0].id);
    });
    // Only on mount — seasonId/onSeasonIdChange changing shouldn't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteSeason = async () => {
    if (!seasons) return;
    const season = seasons.find((s) => s.id === seasonId);
    if (!season) return;

    setError(null);
    setDeleting(true);
    try {
      const leagues = await api.getLeagues();
      const [cyclesByLeague, playersByLeague] = await Promise.all([
        Promise.all(leagues.map((l) => api.getCycles(seasonId, l.id))),
        Promise.all(leagues.map((l) => api.getPlayers(seasonId, l.id))),
      ]);
      const totalCycles = cyclesByLeague.reduce((sum, c) => sum + c.length, 0);
      const totalPlayers = playersByLeague.reduce((sum, p) => sum + p.length, 0);

      const parts: string[] = [];
      if (totalPlayers > 0) parts.push(`${totalPlayers} player${totalPlayers === 1 ? "" : "s"} (and their pairs)`);
      if (totalCycles > 0)
        parts.push(`${totalCycles} cycle${totalCycles === 1 ? "" : "s"} (their teams, matches, and schedules)`);

      const proceed = window.confirm(
        parts.length > 0
          ? `Delete season "${season.name}"? This permanently deletes ${parts.join(" and ")}. This cannot be undone.`
          : `Delete season "${season.name}"? It has no roster or cycles yet. This cannot be undone.`,
      );
      if (!proceed) return;

      await api.deleteSeason(seasonId);
      const remaining = seasons.filter((s) => s.id !== seasonId);
      setSeasons(remaining);
      onSeasonIdChange(remaining[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  if (!seasons) return <p className="text-sm text-muted-foreground">Loading seasons...</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={seasonId} onValueChange={onSeasonIdChange}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a season" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          New Season
        </Button>
        {seasonId && (
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={deleting}
            onClick={deleteSeason}
          >
            Delete Season
          </Button>
        )}
      </div>

      <NewSeasonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(season) => {
          setSeasons((prev) => [season, ...(prev ?? [])]);
          onSeasonIdChange(season.id);
        }}
      />
    </div>
  );
}

function NewSeasonDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (season: Season) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const season = await api.createSeason(name.trim());
      onCreated(season);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Season</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A season is a complete fresh start shared across both leagues — no history, roster, or cycles
          carry over, and cycle numbers restart at 1.
        </p>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2026 Fall" autoFocus />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
