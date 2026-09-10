import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type CycleWithDetails, type DrawTime, type Match, type Position, type ScheduleWithMatches, type Team } from "@/lib/api";

const POSITION_LABELS: Record<Position, string> = { SKIP: "Skip", VICE: "Vice", SECOND: "Second", LEAD: "Lead" };
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same palette as the old system's team-group color-coding (reference/
// ScheduleGenerator.gs, applyTeamSectionFormatting) — groups are the
// team-generation time-slot groups, i.e. what actually keeps a TimeSlotPair
// together, so coloring by group visually shows which teams are "linked."
// Up to 6 (14-team has 6 groups, the last 2 being the singletons).
const GROUP_COLORS = ["#E3F2FD", "#E8F5E8", "#FFF9C4", "#FCE4EC", "#FFE0B2", "#E1BEE7"];
// Old system's sheet header colors (blue/green/orange/purple).
const SHEET_COLORS = ["#2196F3", "#4CAF50", "#FF9800", "#9C27B0"];

// Mirrors the old system's calculateWeekDates() — week N = startDate + 7*(N-1) days.
function computeWeekLabels(startDate: string | null, weekCount: number): string[] {
  if (!startDate) return Array.from({ length: weekCount }, (_, i) => `Week ${i + 1}`);
  const base = new Date(startDate);
  return Array.from({ length: weekCount }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i * 7);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
  });
}

export function PrintSchedulePage() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const [cycle, setCycle] = useState<CycleWithDetails | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleWithMatches | null>(null);
  const [startDateInput, setStartDateInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cycleId) return;
    api.getCycle(cycleId).then(setCycle).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.getTeams(cycleId).then(setTeams);
    api.getSchedule(cycleId).then((d) => {
      setScheduleData(d);
      setStartDateInput(d.schedule?.startDate?.slice(0, 10) ?? "");
    });
  }, [cycleId]);

  const saveStartDate = async (value: string) => {
    if (!cycleId) return;
    setError(null);
    try {
      const updated = await api.updateScheduleStartDate(cycleId, value || null);
      setScheduleData((prev) => (prev ? { ...prev, schedule: updated } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!cycle || !teams || !scheduleData) return <p className="p-8 text-sm text-neutral-500">Loading...</p>;

  const weekNumbers = [...new Set(scheduleData.matches.map((m) => m.weekNumber))].sort((a, b) => a - b);
  const weekLabels = computeWeekLabels(scheduleData.schedule?.startDate ?? null, weekNumbers.length || 4);
  const sheetNumbers = [...new Set(scheduleData.matches.map((m) => m.sheetNumber))].sort((a, b) => a - b);
  const sortedTeams = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-neutral-900 print:p-0">
      <style>{`@media print { @page { margin: 0.5in; } }`}</style>

      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Week 1 date:
          <Input
            type="date"
            className="h-8 w-40"
            value={startDateInput}
            onChange={(e) => setStartDateInput(e.target.value)}
            onBlur={(e) => saveStartDate(e.target.value)}
          />
        </label>
        {scheduleData.matches.length === 0 && (
          <span className="text-sm text-red-600">No schedule generated yet for this cycle.</span>
        )}
      </div>

      <h1 className="text-xl font-bold">
        {cycle.season.name} — {cycle.league.name} Night — Cycle {cycle.cycleNumber}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">{cycle.teamCount} teams</p>

      <section className="mb-8">
        <h2 className="mb-2 text-base font-semibold">Teams</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sortedTeams.map((team) => (
            <div
              key={team.id}
              className="break-inside-avoid rounded border border-neutral-300 p-2 text-sm"
              style={{ backgroundColor: GROUP_COLORS[team.groupIndex % GROUP_COLORS.length] }}
            >
              <div className="mb-1 font-medium">Team {team.teamNumber}</div>
              {(["SKIP", "VICE", "SECOND", "LEAD"] as Position[]).map((position) => {
                const slot = team.slots.find((s) => s.position === position);
                return (
                  <div key={position} className="text-neutral-700">
                    {POSITION_LABELS[position]}: {slot?.player?.name ?? "SPARE"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Schedule</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-neutral-300 p-1.5 text-left">Week</th>
              <th className="border border-neutral-300 p-1.5 text-left">Draw</th>
              {sheetNumbers.map((sheet, i) => (
                <th
                  key={sheet}
                  className="border border-neutral-300 p-1.5 text-left font-semibold text-white"
                  style={{ backgroundColor: SHEET_COLORS[i % SHEET_COLORS.length] }}
                >
                  Sheet {sheet}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekNumbers.map((week, weekIdx) => (
              <PrintWeekRows
                key={week}
                label={weekLabels[weekIdx]}
                shaded={weekIdx % 2 === 1}
                sheetNumbers={sheetNumbers}
                matches={scheduleData.matches.filter((m) => m.weekNumber === week)}
              />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PrintWeekRows({
  label,
  shaded,
  sheetNumbers,
  matches,
}: {
  label: string;
  shaded: boolean;
  sheetNumbers: number[];
  matches: Match[];
}) {
  const rowClass = shaded ? "bg-neutral-100" : "";
  return (
    <>
      {(["EARLY", "LATE"] as DrawTime[]).map((drawTime, i) => {
        const bySheet = matches.filter((m) => m.drawTime === drawTime).sort((a, b) => a.sheetNumber - b.sheetNumber);
        return (
          <tr key={drawTime} className={`${rowClass} break-inside-avoid`}>
            {i === 0 && (
              <td rowSpan={2} className="border border-neutral-300 p-1.5 align-top font-medium">
                {label}
              </td>
            )}
            <td className="border border-neutral-300 p-1.5 text-neutral-600">{drawTime === "EARLY" ? "6:45 PM" : "8:45 PM"}</td>
            {sheetNumbers.map((sheet) => {
              const match = bySheet.find((m) => m.sheetNumber === sheet);
              return (
                <td key={sheet} className="border border-neutral-300 p-1.5">
                  {!match ? null : match.isGhost ? (
                    <span className="text-neutral-400">open</span>
                  ) : (
                    <span>
                      {match.homeTeam?.teamNumber} vs {match.awayTeam?.teamNumber}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
