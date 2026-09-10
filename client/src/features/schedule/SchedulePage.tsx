import { useState } from "react";
import { CyclePicker } from "@/features/cycles/CyclePicker";
import { type Cycle, type League } from "@/lib/api";

export function SchedulePage() {
  const [selection, setSelection] = useState<{ league: League; cycle: Cycle | null } | null>(null);

  return (
    <div className="space-y-6">
      <CyclePicker onChange={setSelection} />

      {!selection && <p className="text-sm text-muted-foreground">Loading...</p>}
      {selection && !selection.cycle && (
        <p className="text-sm text-muted-foreground">
          Select or create a cycle above to generate and download its schedule.
        </p>
      )}
      {selection?.cycle && (
        <div className="space-y-2 rounded-lg border p-6">
          <h2 className="font-medium">
            {selection.league.name} — Cycle {selection.cycle.cycleNumber}
          </h2>
          <p className="text-sm text-muted-foreground">
            Schedule generation isn't built yet. Per intent doc §6, this will look up a build-time-generated
            fixed matchup table for this cycle's {selection.cycle.teamCount}-team configuration (no repeat
            opponents within the cycle, best-effort sheet balance) and needs this cycle's teams to exist
            first.
          </p>
        </div>
      )}
    </div>
  );
}
