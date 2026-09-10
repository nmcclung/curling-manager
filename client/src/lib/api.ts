export type League = {
  id: string;
  name: string;
};

export type Player = {
  id: string;
  name: string;
  leagueId: string;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
  isNewCurler: boolean;
  active: boolean;
  notes: string | null;
};

export type PlayerInput = Omit<Player, "id">;

export type TimeSlotPair = {
  id: string;
  leagueId: string;
  playerAId: string;
  playerBId: string;
  priority: number;
  notes: string | null;
  playerA: Player;
  playerB: Player;
};

export type TimeSlotPairInput = {
  leagueId: string;
  playerAId: string;
  playerBId: string;
  priority: number;
  notes?: string | null;
};

export type Season = {
  id: string;
  name: string;
  startedAt: string;
};

export type TeamCount = 12 | 14 | 16;

export type Cycle = {
  id: string;
  seasonId: string;
  leagueId: string;
  cycleNumber: number;
  teamCount: TeamCount;
  createdAt: string;
};

export type Position = "SKIP" | "VICE" | "SECOND" | "LEAD";

export type TeamSlot = {
  id: string;
  teamId: string;
  position: Position;
  playerId: string | null;
  player: Player | null;
};

export type Team = {
  id: string;
  cycleId: string;
  teamNumber: number;
  slots: TeamSlot[];
};

export type GenerateTeamsResult = {
  teams: Team[];
  warnings: string[];
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getLeagues: () => request<League[]>("/api/leagues"),

  getPlayers: (leagueId: string) => request<Player[]>(`/api/players?leagueId=${leagueId}`),
  createPlayer: (input: PlayerInput) =>
    request<Player>("/api/players", { method: "POST", body: JSON.stringify(input) }),
  updatePlayer: (id: string, patch: Partial<PlayerInput>) =>
    request<Player>(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePlayer: (id: string) => request<void>(`/api/players/${id}`, { method: "DELETE" }),

  getPairs: (leagueId: string) => request<TimeSlotPair[]>(`/api/timeslot-pairs?leagueId=${leagueId}`),
  createPair: (input: TimeSlotPairInput) =>
    request<TimeSlotPair>("/api/timeslot-pairs", { method: "POST", body: JSON.stringify(input) }),
  deletePair: (id: string) => request<void>(`/api/timeslot-pairs/${id}`, { method: "DELETE" }),

  getSeasons: () => request<Season[]>("/api/seasons"),
  createSeason: (name: string) =>
    request<Season>("/api/seasons", { method: "POST", body: JSON.stringify({ name }) }),

  getCycles: (seasonId: string, leagueId: string) =>
    request<Cycle[]>(`/api/cycles?seasonId=${seasonId}&leagueId=${leagueId}`),
  createCycle: (input: { seasonId: string; leagueId: string; teamCount: TeamCount }) =>
    request<Cycle>("/api/cycles", { method: "POST", body: JSON.stringify(input) }),

  getTeams: (cycleId: string) => request<Team[]>(`/api/cycles/${cycleId}/teams`),
  generateTeams: (cycleId: string) =>
    request<GenerateTeamsResult>(`/api/cycles/${cycleId}/teams/generate`, { method: "POST", body: "{}" }),
  updateTeamSlot: (slotId: string, playerId: string | null) =>
    request<TeamSlot>(`/api/team-slots/${slotId}`, { method: "PATCH", body: JSON.stringify({ playerId }) }),
};
