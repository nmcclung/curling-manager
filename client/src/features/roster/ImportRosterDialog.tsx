import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, type League, type Player } from "@/lib/api";
import { parseRegistrationCsv, type RegistrationRow } from "@/lib/csv";

const POSITION_FIELDS: { key: keyof RegistrationRow; label: string }[] = [
  { key: "canPlaySkip", label: "Skip" },
  { key: "canPlayVice", label: "Vice" },
  { key: "canPlaySecond", label: "Second" },
  { key: "canPlayLead", label: "Lead" },
];

type ImportRow = RegistrationRow & {
  include: boolean;
  duplicate: boolean;
};

export function ImportRosterDialog({
  league,
  seasonId,
  existingPlayers,
  open,
  onOpenChange,
  onImported,
}: {
  league: League;
  seasonId: string;
  existingPlayers: Player[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (created: Player[]) => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows(null);
    setFileName("");
    setError(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseRegistrationCsv(text);
      const existingNames = new Set(existingPlayers.map((p) => p.name.trim().toLowerCase()));
      setRows(
        parsed.map((r) => {
          const duplicate = existingNames.has(r.name.trim().toLowerCase());
          return { ...r, include: !duplicate, duplicate };
        }),
      );
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const updateRow = (index: number, patch: Partial<ImportRow>) => {
    setRows((prev) => prev?.map((r, i) => (i === index ? { ...r, ...patch } : r)) ?? prev);
  };

  const includedCount = rows?.filter((r) => r.include).length ?? 0;
  const duplicateCount = rows?.filter((r) => r.duplicate).length ?? 0;

  const handleImport = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.include);
    if (toImport.length === 0) return;

    // Same invariant the server enforces (and every other player-write path
    // in the app) — catch it here with names attached so the person doesn't
    // have to decode a generic 400 back to a row in a 144-row table.
    const invalid = toImport.filter(
      (r) => r.active && !r.canPlaySkip && !r.canPlayVice && !r.canPlaySecond && !r.canPlayLead,
    );
    if (invalid.length > 0) {
      setError(
        `These active players have no position checked — check a position or uncheck Active before importing: ${invalid
          .map((r) => r.name)
          .join(", ")}`,
      );
      return;
    }

    setError(null);
    setImporting(true);
    try {
      const created = await api.importPlayers(
        seasonId,
        league.id,
        toImport.map((r) => ({
          name: r.name,
          notes: r.notes,
          experienceYears: r.experienceYears,
          canPlaySkip: r.canPlaySkip,
          canPlayVice: r.canPlayVice,
          canPlaySecond: r.canPlaySecond,
          canPlayLead: r.canPlayLead,
          isNewCurler: r.isNewCurler,
          active: r.active,
        })),
      );
      onImported(created);
      handleClose(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Import Roster — {league.name}</DialogTitle>
          <DialogDescription>
            Upload the season-start roster CSV export. Name, experience, notes, position
            eligibility, new-curler status, and active status all come in directly from the file
            — review and adjust anything below before importing.
          </DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {rows && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {fileName} — {rows.length} row{rows.length === 1 ? "" : "s"} found
                {duplicateCount > 0 &&
                  `, ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} left unchecked`}
              </span>
              <Button variant="outline" size="sm" onClick={reset}>
                Choose a different file
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex-1 overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">Import</TableHead>
                    <TableHead>Name</TableHead>
                    {POSITION_FIELDS.map((f) => (
                      <TableHead key={f.key} className="text-center">
                        {f.label}
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-center">Experience</TableHead>
                    <TableHead className="text-center">New Curler</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i} className={row.include ? undefined : "opacity-50"}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.include}
                          onCheckedChange={(checked) => updateRow(i, { include: !!checked })}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.name}
                        {row.duplicate && (
                          <Badge variant="secondary" className="ml-2">
                            possible duplicate
                          </Badge>
                        )}
                      </TableCell>
                      {POSITION_FIELDS.map((f) => (
                        <TableCell key={f.key} className="text-center">
                          <Checkbox
                            checked={row[f.key] as boolean}
                            onCheckedChange={(checked) => updateRow(i, { [f.key]: !!checked })}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={row.experienceYears ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            if (v === "" || /^\d+$/.test(v)) {
                              updateRow(i, { experienceYears: v === "" ? null : Number(v) });
                            }
                          }}
                          className="h-8 w-20"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.isNewCurler}
                          onCheckedChange={(checked) => updateRow(i, { isNewCurler: !!checked })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={row.active}
                          onCheckedChange={(checked) => updateRow(i, { active: !!checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.notes ?? ""}
                          onChange={(e) => updateRow(i, { notes: e.target.value || null })}
                          className="h-8"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {rows && (
            <Button onClick={handleImport} disabled={includedCount === 0 || importing}>
              {importing ? "Importing..." : `Import ${includedCount} player${includedCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
