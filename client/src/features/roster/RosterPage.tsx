import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type LastCyclePositions, type League, type Player, type PlayerInput, type Position } from "@/lib/api";
import { ImportRosterDialog } from "@/features/roster/ImportRosterDialog";
import { PairsSection } from "@/features/roster/PairsSection";
import { PlayerFormDialog } from "@/features/roster/PlayerFormDialog";
import { SeasonPicker } from "@/features/seasons/SeasonPicker";

const POSITION_FIELDS: { key: keyof PlayerInput; label: string }[] = [
  { key: "canPlaySkip", label: "Skip" },
  { key: "canPlayVice", label: "Vice" },
  { key: "canPlaySecond", label: "Second" },
  { key: "canPlayLead", label: "Lead" },
];

const POSITION_LABELS: Record<Position, string> = { SKIP: "Skip", VICE: "Vice", SECOND: "Second", LEAD: "Lead" };

type PositionKey = "canPlaySkip" | "canPlayVice" | "canPlaySecond" | "canPlayLead";
type SortKey = "name" | "status" | "experienceYears" | "isNewCurler" | PositionKey;
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection };

// Direction a column starts at the first time it's clicked (switching from
// some other column) — picked per-column for what's most useful to see
// first, not just defaulting everything to ascending.
const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: "asc",
  status: "asc",
  experienceYears: "desc",
  isNewCurler: "desc",
  canPlaySkip: "desc",
  canPlayVice: "desc",
  canPlaySecond: "desc",
  canPlayLead: "desc",
};

function eligibilityCount(p: Player): number {
  return Number(p.canPlaySkip) + Number(p.canPlayVice) + Number(p.canPlaySecond) + Number(p.canPlayLead);
}

// Sorting a position column isn't a plain boolean sort — "descending" means
// specialists for that position first (eligible here and few/no other
// positions), then more versatile eligible players, then everyone
// ineligible. "Ascending" reverses that: ineligible first, then eligible
// ordered from most versatile down to specialist.
function comparePosition(a: Player, b: Player, key: PositionKey, direction: SortDirection): number {
  const aEligible = a[key];
  const bEligible = b[key];
  if (aEligible !== bEligible) {
    const eligibleFirst = direction === "desc";
    return aEligible === eligibleFirst ? -1 : 1;
  }
  if (aEligible) {
    const diff = eligibilityCount(a) - eligibilityCount(b); // fewer total positions = more specialized
    if (diff !== 0) return direction === "desc" ? diff : -diff;
  }
  return a.name.localeCompare(b.name);
}

function EditableNotesCell({ notes, onSave }: { notes: string | null; onSave: (notes: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");

  // Keep the draft in sync with server state while not actively editing —
  // e.g. after a save round-trips, or if notes changed from elsewhere.
  useEffect(() => {
    if (!editing) setDraft(notes ?? "");
  }, [notes, editing]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          if (trimmed !== (notes ?? "")) onSave(trimmed || null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(notes ?? "");
            setEditing(false);
          }
        }}
        className="h-8"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full truncate rounded px-1.5 py-1 text-left hover:bg-accent hover:text-accent-foreground"
    >
      {notes || <span className="text-muted-foreground italic">Add note…</span>}
    </button>
  );
}

function compare(a: Player, b: Player, sort: SortState): number {
  switch (sort.key) {
    case "name":
      return sort.direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    case "status": {
      if (a.active === b.active) return a.name.localeCompare(b.name);
      const activeFirst = sort.direction === "asc";
      return a.active === activeFirst ? -1 : 1;
    }
    case "experienceYears": {
      // Unknown experience (null) always sorts last, regardless of direction
      // — it shouldn't be conflated with "0 years" at either end.
      if (a.experienceYears == null && b.experienceYears == null) return a.name.localeCompare(b.name);
      if (a.experienceYears == null) return 1;
      if (b.experienceYears == null) return -1;
      if (a.experienceYears !== b.experienceYears) {
        return sort.direction === "asc"
          ? a.experienceYears - b.experienceYears
          : b.experienceYears - a.experienceYears;
      }
      return a.name.localeCompare(b.name);
    }
    case "isNewCurler": {
      if (a.isNewCurler === b.isNewCurler) return a.name.localeCompare(b.name);
      const newCurlerFirst = sort.direction === "desc";
      return a.isNewCurler === newCurlerFirst ? -1 : 1;
    }
    case "canPlaySkip":
    case "canPlayVice":
    case "canPlaySecond":
    case "canPlayLead":
      return comparePosition(a, b, sort.key, sort.direction);
  }
}

export function RosterPage() {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [activeLeagueId, setActiveLeagueId] = useState<string>("");
  const [seasonId, setSeasonId] = useState<string>("");
  // Ref, not state — this only needs to be read at tab/season-switch time,
  // and updating it shouldn't itself trigger a RosterPage re-render.
  const dirtyCounts = useRef<Record<string, number>>({});

  useEffect(() => {
    api.getLeagues().then((ls) => {
      setLeagues(ls);
      setActiveLeagueId(ls[0]?.id ?? "");
    });
  }, []);

  if (!leagues) return <p className="p-8 text-muted-foreground">Loading leagues...</p>;

  // Unsaved edits live only in LeagueRoster's local state and are lost when
  // its tab unmounts (Radix Tabs unmounts inactive content) — confirm first
  // rather than silently discarding a batch of staged changes.
  const confirmDiscardIfDirty = () => {
    const currentDirty = dirtyCounts.current[activeLeagueId] ?? 0;
    if (currentDirty === 0) return true;
    return window.confirm(
      `You have ${currentDirty} unsaved change${currentDirty === 1 ? "" : "s"} on this tab. Discard ${currentDirty === 1 ? "it" : "them"}?`,
    );
  };

  const handleTabChange = (next: string) => {
    if (confirmDiscardIfDirty()) setActiveLeagueId(next);
  };

  const handleSeasonChange = (next: string) => {
    if (confirmDiscardIfDirty()) setSeasonId(next);
  };

  return (
    <div className="space-y-4">
      <SeasonPicker seasonId={seasonId} onSeasonIdChange={handleSeasonChange} />

      {!seasonId ? (
        <p className="text-sm text-muted-foreground">Select or create a season to manage its roster.</p>
      ) : (
        <Tabs value={activeLeagueId} onValueChange={handleTabChange} className="w-full">
          <TabsList>
            {leagues.map((league) => (
              <TabsTrigger key={league.id} value={league.id}>
                {league.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {leagues.map((league) => (
            <TabsContent key={league.id} value={league.id}>
              <LeagueRoster
                league={league}
                seasonId={seasonId}
                onDirtyCountChange={(count) => {
                  dirtyCounts.current[league.id] = count;
                }}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function LeagueRoster({
  league,
  seasonId,
  onDirtyCountChange,
}: {
  league: League;
  seasonId: string;
  onDirtyCountChange: (count: number) => void;
}) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [lastCyclePositions, setLastCyclePositions] = useState<LastCyclePositions | null>(null);
  // Checkbox/note edits are staged here (keyed by player id) instead of
  // hitting the API immediately — the "Save Changes" button below commits
  // them all as one batch request. This is what actually fixes the felt
  // lag: firing one PATCH per click was the slow part in practice, not any
  // single request (each measured in the low-ms range once sent).
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<PlayerInput>>>({});
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortState>({ key: "status", direction: "asc" });

  const loadPlayers = () => {
    api
      .getPlayers(seasonId, league.id)
      .then(setPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(loadPlayers, [seasonId, league.id]);

  useEffect(() => {
    api.getLastCyclePositions(seasonId, league.id).then(setLastCyclePositions);
  }, [seasonId, league.id]);

  // This component stays mounted across a season switch (only the league
  // tab remounts it, per TabsContent's key) — without this, stale staged
  // edits keyed by a previous season's player ids would silently linger in
  // state and could get sent along with the next save.
  useEffect(() => {
    setPendingChanges({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  useEffect(() => {
    onDirtyCountChange(Object.keys(pendingChanges).length);
  }, [pendingChanges, onDirtyCountChange]);

  const openCreate = () => {
    setEditingPlayer(undefined);
    setDialogOpen(true);
  };
  const openEdit = (player: Player) => {
    setEditingPlayer(player);
    setDialogOpen(true);
  };

  const stageField = (player: Player, patch: Partial<PlayerInput>) => {
    setPendingChanges((prev) => ({ ...prev, [player.id]: { ...prev[player.id], ...patch } }));
  };

  const clearPending = (playerId: string) => {
    setPendingChanges((prev) => {
      if (!(playerId in prev)) return prev;
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  };

  // Deactivating a player who's in a timeslot pair leaves that pair with an
  // inactive member — offer to remove the pair(s) too rather than leaving
  // them stale (matches the same pair-impact pattern used for delete below).
  // The pair removal itself still happens immediately (it's a separate
  // entity with its own immediate CRUD elsewhere on this page); only the
  // player's own `active` flag gets staged like every other field here.
  const setActive = async (player: Player, active: boolean) => {
    setError(null);
    if (!active) {
      try {
        const pairs = await api.getPairs(seasonId, league.id);
        const involved = pairs.filter((p) => p.playerAId === player.id || p.playerBId === player.id);
        if (involved.length > 0) {
          const partnerNames = involved.map((p) => (p.playerAId === player.id ? p.playerB : p.playerA).name).join(", ");
          const proceed = window.confirm(
            `${player.name} is paired with ${partnerNames}. Deactivating them will also remove ${involved.length === 1 ? "this pair" : "these pairs"}. Continue?`,
          );
          if (!proceed) return;
          await Promise.all(involved.map((p) => api.deletePair(p.id)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    stageField(player, { active });
  };

  const remove = async (player: Player) => {
    setError(null);
    // Once a player has ever been assigned to a team, deleting them isn't
    // safe (their slot would silently go empty — possibly Skip, an
    // otherwise-impossible state — the schedule wouldn't get flagged
    // stale, and season teammate-history for *other* players who played
    // with them would quietly lose those co-occurrences). Deactivating
    // preserves all of that, so block outright rather than warn-and-allow.
    if (player.hasTeamHistory) {
      window.alert(
        `${player.name} has been assigned to a team this season and can no longer be deleted — use the Active checkbox to deactivate them instead, which removes them from future team generation while keeping their history intact.`,
      );
      return;
    }

    let warning = "";
    try {
      const pairs = await api.getPairs(seasonId, league.id);
      const pairCount = pairs.filter((p) => p.playerAId === player.id || p.playerBId === player.id).length;
      if (pairCount > 0) {
        warning = ` They are in ${pairCount} timeslot pair${pairCount === 1 ? "" : "s"}, which will also be deleted.`;
      }
    } catch {
      // Non-fatal — proceed without the pair-impact detail if this lookup fails.
    }

    if (!window.confirm(`Delete ${player.name}?${warning} This cannot be undone.`)) return;
    try {
      await api.deletePlayer(player.id);
      clearPending(player.id);
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveChanges = async () => {
    const ids = Object.keys(pendingChanges);
    if (ids.length === 0) return;
    setError(null);
    setSaving(true);
    const t0 = performance.now();
    try {
      const updates = ids.map((id) => ({ id, patch: pendingChanges[id] }));
      const updated = await api.batchUpdatePlayers(updates);
      const t1 = performance.now();
      const byId = new Map(updated.map((p) => [p.id, p]));
      // Merge, not replace — the batch PATCH response doesn't recompute
      // hasTeamHistory (editing a field can't change it), so spreading
      // over the previous player preserves that field rather than
      // clobbering it with whatever the response happens to have.
      setPlayers((prev) => prev?.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p)) ?? prev);
      setPendingChanges({});
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const t2 = performance.now();
          console.log(
            `[perf] batch save (${ids.length} player${ids.length === 1 ? "" : "s"}): fetch ${(t1 - t0).toFixed(1)}ms, fetch→painted: ${(t2 - t1).toFixed(1)}ms, total: ${(t2 - t0).toFixed(1)}ms`,
          );
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => setPendingChanges({});

  const toggleSort = (key: SortKey) =>
    setSortMode((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: DEFAULT_DIRECTION[key] },
    );
  const sortArrow = (key: SortKey) => (sortMode.key === key ? (sortMode.direction === "asc" ? "▲" : "▼") : "");

  const effectivePlayers = players?.map((p) => (pendingChanges[p.id] ? { ...p, ...pendingChanges[p.id] } : p)) ?? null;
  const sortedPlayers = effectivePlayers ? [...effectivePlayers].sort((a, b) => compare(a, b, sortMode)) : null;
  const activePlayers = effectivePlayers?.filter((p) => p.active) ?? [];
  const activeCount = activePlayers.length;
  const skipCount = activePlayers.filter((p) => p.canPlaySkip).length;
  // "Specialist" = eligible for exactly this one position — the number that
  // actually matters for the oversupply gate (validateRosterForGeneration):
  // specialists for a position compete only against each other for that
  // position's teamCount slots, with no fallback if they miss out.
  const specialistCount = (key: PositionKey) => activePlayers.filter((p) => p[key] && eligibilityCount(p) === 1).length;
  const newCurlerCount = activePlayers.filter((p) => p.isNewCurler).length;
  const dirtyCount = Object.keys(pendingChanges).length;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active player{activeCount === 1 ? "" : "s"} &middot; {skipCount} skip-eligible (
          {specialistCount("canPlaySkip")} skip-only) &middot; {specialistCount("canPlayVice")} vice-only &middot;{" "}
          {specialistCount("canPlaySecond")} second-only &middot; {specialistCount("canPlayLead")} lead-only &middot;{" "}
          {newCurlerCount} new curler{newCurlerCount === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
              </span>
              <Button variant="outline" size="sm" onClick={discardChanges} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={saveChanges} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            Import CSV
          </Button>
          <Button onClick={openCreate}>Add Player</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                Name {sortArrow("name")}
              </TableHead>
              {POSITION_FIELDS.map((f) => (
                <TableHead
                  key={f.key}
                  className="cursor-pointer select-none text-center"
                  onClick={() => toggleSort(f.key as PositionKey)}
                >
                  {f.label} {sortArrow(f.key as PositionKey)}
                </TableHead>
              ))}
              <TableHead
                className="w-24 cursor-pointer select-none text-center"
                onClick={() => toggleSort("experienceYears")}
              >
                Experience {sortArrow("experienceYears")}
              </TableHead>
              <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("isNewCurler")}>
                New Curler {sortArrow("isNewCurler")}
              </TableHead>
              <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("status")}>
                Active {sortArrow("status")}
              </TableHead>
              <TableHead className="text-center">
                Last Cycle
                {lastCyclePositions?.cycleNumber != null && (
                  <span className="ml-1 font-normal text-muted-foreground">({lastCyclePositions.cycleNumber})</span>
                )}
              </TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlayers?.map((player) => {
              const isDirty = player.id in pendingChanges;
              return (
              <TableRow
                key={player.id}
                className={cn(player.active ? undefined : "opacity-50", isDirty && "bg-amber-50 dark:bg-amber-950/40")}
              >
                <TableCell className="font-medium">{player.name}</TableCell>
                {POSITION_FIELDS.map((f) => (
                  <TableCell key={f.key} className="text-center">
                    <Checkbox
                      checked={player[f.key] as boolean}
                      onCheckedChange={(checked) => stageField(player, { [f.key]: !!checked })}
                    />
                  </TableCell>
                ))}
                <TableCell className="text-center">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={player.experienceYears ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v === "" || /^\d+$/.test(v)) {
                        stageField(player, { experienceYears: v === "" ? null : Number(v) });
                      }
                    }}
                    className="mx-auto h-8 w-16 text-center"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={player.isNewCurler}
                    onCheckedChange={(checked) => stageField(player, { isNewCurler: !!checked })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={player.active} onCheckedChange={(checked) => setActive(player, !!checked)} />
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {lastCyclePositions?.positions[player.id]
                    ? POSITION_LABELS[lastCyclePositions.positions[player.id]]
                    : "—"}
                </TableCell>
                <TableCell className="max-w-48">
                  <EditableNotesCell notes={player.notes} onSave={(notes) => stageField(player, { notes })} />
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(player)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={player.hasTeamHistory}
                    title={
                      player.hasTeamHistory
                        ? "Assigned to a team this season — deactivate instead of deleting"
                        : undefined
                    }
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-auto"
                    onClick={() => remove(player)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <PairsSection league={league} seasonId={seasonId} players={activePlayers} />

      <PlayerFormDialog
        league={league}
        seasonId={seasonId}
        player={editingPlayer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          // The dialog submits immediately on its own — clear any staged
          // inline edit for this player so it isn't redundantly resent.
          if (editingPlayer) clearPending(editingPlayer.id);
          loadPlayers();
        }}
      />

      <ImportRosterDialog
        league={league}
        seasonId={seasonId}
        existingPlayers={players ?? []}
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={(created) => setPlayers((prev) => [...(prev ?? []), ...created])}
      />
    </div>
  );
}
