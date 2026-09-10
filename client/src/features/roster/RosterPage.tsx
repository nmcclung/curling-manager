import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type League, type Player, type PlayerInput } from "@/lib/api";
import { PairsSection } from "@/features/roster/PairsSection";
import { PlayerFormDialog } from "@/features/roster/PlayerFormDialog";

const POSITION_FIELDS: { key: keyof PlayerInput; label: string }[] = [
  { key: "canPlaySkip", label: "Skip" },
  { key: "canPlayVice", label: "Vice" },
  { key: "canPlaySecond", label: "Second" },
  { key: "canPlayLead", label: "Lead" },
];

type SortMode = "status-asc" | "status-desc" | "name-asc" | "name-desc";

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

function compare(a: Player, b: Player, mode: SortMode): number {
  switch (mode) {
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "name-desc":
      return b.name.localeCompare(a.name);
    case "status-asc":
      return a.active !== b.active ? (a.active ? -1 : 1) : a.name.localeCompare(b.name);
    case "status-desc":
      return a.active !== b.active ? (a.active ? 1 : -1) : a.name.localeCompare(b.name);
  }
}

export function RosterPage() {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [activeLeagueId, setActiveLeagueId] = useState<string>("");
  // Ref, not state — this only needs to be read at tab-switch time, and
  // updating it shouldn't itself trigger a RosterPage re-render.
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
  const handleTabChange = (next: string) => {
    const currentDirty = dirtyCounts.current[activeLeagueId] ?? 0;
    if (currentDirty > 0) {
      const proceed = window.confirm(
        `You have ${currentDirty} unsaved change${currentDirty === 1 ? "" : "s"} on this tab. Switch tabs and discard ${currentDirty === 1 ? "it" : "them"}?`,
      );
      if (!proceed) return;
    }
    setActiveLeagueId(next);
  };

  return (
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
            onDirtyCountChange={(count) => {
              dirtyCounts.current[league.id] = count;
            }}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function LeagueRoster({ league, onDirtyCountChange }: { league: League; onDirtyCountChange: (count: number) => void }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  // Checkbox/note edits are staged here (keyed by player id) instead of
  // hitting the API immediately — the "Save Changes" button below commits
  // them all as one batch request. This is what actually fixes the felt
  // lag: firing one PATCH per click was the slow part in practice, not any
  // single request (each measured in the low-ms range once sent).
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<PlayerInput>>>({});
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("status-asc");

  const loadPlayers = () => {
    api
      .getPlayers(league.id)
      .then(setPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(loadPlayers, [league.id]);

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
        const pairs = await api.getPairs(league.id);
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
    let warning = "";
    try {
      const pairs = await api.getPairs(league.id);
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
      setPlayers((prev) => prev?.map((p) => byId.get(p.id) ?? p) ?? prev);
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

  const toggleNameSort = () => setSortMode((m) => (m === "name-asc" ? "name-desc" : "name-asc"));
  const toggleStatusSort = () => setSortMode((m) => (m === "status-asc" ? "status-desc" : "status-asc"));
  const sortArrow = (asc: SortMode, desc: SortMode) => (sortMode === asc ? "▲" : sortMode === desc ? "▼" : "");

  const effectivePlayers = players?.map((p) => (pendingChanges[p.id] ? { ...p, ...pendingChanges[p.id] } : p)) ?? null;
  const sortedPlayers = effectivePlayers ? [...effectivePlayers].sort((a, b) => compare(a, b, sortMode)) : null;
  const activePlayers = effectivePlayers?.filter((p) => p.active) ?? [];
  const activeCount = activePlayers.length;
  const skipCount = activePlayers.filter((p) => p.canPlaySkip).length;
  const dirtyCount = Object.keys(pendingChanges).length;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active player{activeCount === 1 ? "" : "s"} &middot; {skipCount} skip-eligible
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
          <Button onClick={openCreate}>Add Player</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={toggleNameSort}>
                Name {sortArrow("name-asc", "name-desc")}
              </TableHead>
              {POSITION_FIELDS.map((f) => (
                <TableHead key={f.key} className="text-center">
                  {f.label}
                </TableHead>
              ))}
              <TableHead className="text-center">New Curler</TableHead>
              <TableHead className="cursor-pointer select-none text-center" onClick={toggleStatusSort}>
                Active {sortArrow("status-asc", "status-desc")}
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
                  <Checkbox
                    checked={player.isNewCurler}
                    onCheckedChange={(checked) => stageField(player, { isNewCurler: !!checked })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox checked={player.active} onCheckedChange={(checked) => setActive(player, !!checked)} />
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
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
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

      <PairsSection league={league} players={activePlayers} />

      <PlayerFormDialog
        league={league}
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
    </div>
  );
}
