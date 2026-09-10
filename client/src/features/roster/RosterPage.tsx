import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type League, type Player } from "@/lib/api";
import { PairsSection } from "@/features/roster/PairsSection";
import { PlayerFormDialog } from "@/features/roster/PlayerFormDialog";

const POSITIONS: { key: keyof Player; label: string }[] = [
  { key: "canPlaySkip", label: "Skip" },
  { key: "canPlayVice", label: "Vice" },
  { key: "canPlaySecond", label: "Second" },
  { key: "canPlayLead", label: "Lead" },
];

export function RosterPage() {
  const [leagues, setLeagues] = useState<League[] | null>(null);

  useEffect(() => {
    api.getLeagues().then(setLeagues);
  }, []);

  if (!leagues) return <p className="p-8 text-muted-foreground">Loading leagues...</p>;

  return (
    <Tabs defaultValue={leagues[0]?.id} className="w-full">
      <TabsList>
        {leagues.map((league) => (
          <TabsTrigger key={league.id} value={league.id}>
            {league.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {leagues.map((league) => (
        <TabsContent key={league.id} value={league.id}>
          <LeagueRoster league={league} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function LeagueRoster({ league }: { league: League }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const loadPlayers = () => {
    api
      .getPlayers(league.id)
      .then(setPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(loadPlayers, [league.id]);

  const openCreate = () => {
    setEditingPlayer(undefined);
    setDialogOpen(true);
  };
  const openEdit = (player: Player) => {
    setEditingPlayer(player);
    setDialogOpen(true);
  };

  const toggleActive = async (player: Player) => {
    setError(null);
    try {
      await api.updatePlayer(player.id, { active: !player.active });
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const activeCount = players?.filter((p) => p.active).length ?? 0;
  const skipCount = players?.filter((p) => p.active && p.canPlaySkip).length ?? 0;

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} active player{activeCount === 1 ? "" : "s"} &middot; {skipCount} skip-eligible
        </p>
        <Button onClick={openCreate}>Add Player</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Positions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players?.map((player) => (
              <TableRow key={player.id} className={player.active ? undefined : "opacity-50"}>
                <TableCell className="font-medium">{player.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {POSITIONS.filter(({ key }) => player[key]).map(({ label }) => (
                      <Badge key={label} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                    {player.isNewCurler && <Badge variant="outline">New</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={player.active ? "default" : "outline"}>
                    {player.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{player.notes}</TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => openEdit(player)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(player)}>
                    {player.active ? "Deactivate" : "Activate"}
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
            ))}
          </TableBody>
        </Table>
      </div>

      <PairsSection league={league} players={players ?? []} />

      <PlayerFormDialog
        league={league}
        player={editingPlayer}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={loadPlayers}
      />
    </div>
  );
}
