export type TeamCount = 12 | 14 | 16;

export const POSITIONS = ["SKIP", "VICE", "SECOND", "LEAD"] as const;
export type Position = (typeof POSITIONS)[number];

export type DraftPlayer = {
  id: string;
  name: string;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
  isNewCurler: boolean;
  /** Count of all four position flags — used to split skip specialists vs generalists. */
  eligibilityCount: number;
  /** Count of Vice/Second/Lead flags only (excludes Skip) — used for specialist buckets and the versatility tiebreak. */
  frontEndEligibilityCount: number;
};

export type DraftPair = {
  id: string;
  playerAId: string;
  playerBId: string;
  priority: number;
};

/** playerId when filled, "SPARE" when filled with a placeholder, null while still open during drafting. */
export type SlotValue = string | "SPARE" | null;

export type WorkingTeam = {
  teamNumber: number;
  groupIndex: number;
  slots: Record<Position, SlotValue>;
};

/** playerId -> teammatePlayerId -> summed decayed conflict weight (season-scoped). */
export type HistoryMap = Map<string, Map<string, number>>;

export type GenerationResult = {
  teams: WorkingTeam[];
  warnings: string[];
};
