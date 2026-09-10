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
    setError(null);
    setImporting(true);
    try {
      const created = await api.importPlayers(
        seasonId,
        league.id,
        toImport.map((r) => ({ name: r.name, notes: r.notes, experienceYears: r.experienceYears })),
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
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import Roster — {league.name}</DialogTitle>
          <DialogDescription>
            Upload a League Registration Report CSV export. Imported players land inactive with no
            position eligibility or new-curler status set — this data doesn't tell us either
            reliably, so review and fill those in on the roster afterward. Only name, notes, and
            years of experience come in automatically.
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
                    <TableHead className="w-24 text-center">Experience</TableHead>
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
