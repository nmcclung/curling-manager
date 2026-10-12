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
    <div className="mx-auto max-w-4xl bg-white p-8 text-neutral-900 print:max-w-none print:p-0 dark:bg-neutral-900 dark:text-neutral-100 dark:print:bg-white dark:print:text-neutral-900">
      <style>{`
        @media print {
          /* Tightened spacing/type below (plus the compact team-card
             layout) is what gets a full cycle (up to 16 teams + a 4-week
             schedule) onto one portrait page. */
          @page { size: portrait; margin: 0.5in; }
          /* Browsers strip background colors from printed/PDF output by
             default — without this, the team-group and sheet-header
             color-coding (the whole point of this page) silently disappears
             the moment you actually print, even though it looks fine
             on-screen here first. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
        <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
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
          <span className="text-sm text-red-600 dark:text-red-400">No schedule generated yet for this cycle.</span>
        )}
      </div>

      <h1 className="text-xl font-bold print:mb-0.5 print:text-lg">
        {cycle.season.name} — {cycle.league.name} Night — Cycle {cycle.cycleNumber}
      </h1>
      <p className="mb-6 text-sm text-neutral-500 print:mb-2 print:text-xs dark:text-neutral-400 dark:print:text-neutral-500">
        {cycle.teamCount} teams
      </p>

      <section className="mb-8 print:mb-3">
        <h2 className="mb-2 text-base font-semibold print:mb-1 print:text-sm">Teams</h2>
        {/* Same column count on screen and print — this page's whole point
            is previewing what you'll actually get, so a different on-screen
            column count than print would silently reshuffle the team-group
            color blocks the moment you print, which is confusing since
            nothing else about the layout visibly changes to warn you. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:gap-1.5">
          {sortedTeams.map((team) => (
            <div
              key={team.id}
              className="break-inside-avoid rounded border border-neutral-300 p-2 text-sm print:p-1.5 print:text-[10px]"
              style={{ backgroundColor: GROUP_COLORS[team.groupIndex % GROUP_COLORS.length] }}
            >
              {/* Explicit dark text here, not inherited — this chip's
                  background is always a light pastel regardless of the
                  page's own light/dark theme, so it must never pick up the
                  page's light-on-dark text color. */}
              <div className="mb-1 font-medium text-neutral-900 underline print:mb-0.5">Team {team.teamNumber}</div>
              <div className="space-y-1 print:space-y-0.5">
                {(["SKIP", "VICE", "SECOND", "LEAD"] as Position[]).map((position) => {
                  const slot = team.slots.find((s) => s.position === position);
                  return (
                    <div key={position} className="text-neutral-800">
                      <span className="font-bold text-neutral-900">{POSITION_LABELS[position]}:</span>{" "}
                      {slot?.player?.name ?? "SPARE"}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold print:mb-1 print:text-sm">Schedule</h2>
        {/* border-separate + border-spacing-0, not border-collapse — Chrome
            has a long-standing print/PDF bug where a collapsed table's row
            borders randomly vanish for some rows but not others (confirmed:
            only the first week's horizontal line survived printing here,
            even though every row looked identical on-screen). Each cell
            drawing its own border independently sidesteps the bug entirely. */}
        <table className="w-full border-separate border-spacing-0 text-sm print:text-[10px]">
          <thead>
            <tr>
              <th className="border border-neutral-300 p-1.5 text-left print:p-0.5 dark:border-neutral-700 dark:print:border-neutral-300">
                Date
              </th>
              <th className="border border-neutral-300 p-1.5 text-left print:p-0.5 dark:border-neutral-700 dark:print:border-neutral-300">
                Draw
              </th>
              {sheetNumbers.map((sheet, i) => (
                <th
                  key={sheet}
                  className="border border-neutral-300 p-1.5 text-left font-semibold text-white print:p-0.5"
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
  const rowClass = shaded ? "bg-neutral-100 dark:bg-neutral-800 dark:print:bg-neutral-100" : "";
  const cellBorder = "border border-neutral-300 dark:border-neutral-700 dark:print:border-neutral-300";
  return (
    <>
      {(["EARLY", "LATE"] as DrawTime[]).map((drawTime, i) => {
        const bySheet = matches.filter((m) => m.drawTime === drawTime).sort((a, b) => a.sheetNumber - b.sheetNumber);
        return (
          <tr key={drawTime} className={`${rowClass} break-inside-avoid`}>
            {i === 0 && (
              <td rowSpan={2} className={`${cellBorder} p-1.5 align-top font-medium print:p-0.5`}>
                {label}
              </td>
            )}
            <td className={`${cellBorder} p-1.5 text-neutral-600 print:p-0.5 dark:text-neutral-400 dark:print:text-neutral-600`}>
              {drawTime === "EARLY" ? "6:45 PM" : "8:45 PM"}
            </td>
            {sheetNumbers.map((sheet) => {
              const match = bySheet.find((m) => m.sheetNumber === sheet);
              return (
                <td key={sheet} className={`${cellBorder} p-1.5 print:p-0.5`}>
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
