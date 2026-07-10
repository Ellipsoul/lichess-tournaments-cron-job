import {
  createdTournamentFetchLimitByOrganizer,
  lichessApiBaseUrl,
  tournamentOrganizers,
} from "./config.js";

/** The subset of a team arena tournament used by this application. */
export interface Tournament {
  id: string;
  fullName: string;
  startsAt: number;
}

/**
 * Lichess includes this object on `GET /api/tournament/{id}` when the bearer
 * token's account is registered for that tournament.
 */
interface TournamentPlayerMe {
  rank: number;
  withdraw?: boolean;
}

/** Subset of the authenticated tournament detail response used for join checks. */
interface TournamentDetail {
  me?: TournamentPlayerMe;
}

interface OrganiserTeamBattleTournament extends Tournament {
  teamBattle?: {
    teams?: string[] | Record<string, unknown>;
    nbLeaders?: number;
  };
}

/**
 * Status codes for temporary failures. Retrying these is useful; retrying a
 * client error such as 401 or 403 would only repeat a configuration problem.
 */
const retryableStatuses = new Set([429, 502, 503, 504]);

/**
 * Chooses the wait before a retry. Lichess can provide `Retry-After` when it
 * rate-limits a request, so honour that instruction when present. Otherwise,
 * use exponential backoff: 1 second, then 2 seconds.
 */
function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  return 1_000 * 2 ** attempt;
}

/**
 * Sends one HTTP request, retrying a network error or a transient server/rate
 * limit response at most twice. The returned response may still be an error;
 * the public API functions below decide how to report it with endpoint context.
 */
async function request(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
      continue;
    }

    if (!retryableStatuses.has(response.status) || attempt === 2) return response;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt)));
  }
}

/** Turns an unsuccessful HTTP response into a concise, actionable error. */
async function responseError(response: Response): Promise<Error> {
  const detail = (await response.text()).trim();
  return new Error(
    `Lichess API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
  );
}

/**
 * Parses a Lichess NDJSON response body into individual JSON objects.
 *
 * Most endpoints stream one JSON object per line. Some responses concatenate
 * objects without newlines, so a brace-counting fallback is used when needed.
 */
export function parseNdjson<T>(body: string): T[] {
  const trimmed = body.trim();
  if (!trimmed) return [];

  const lines = trimmed.split("\n").filter(Boolean);
  if (lines.length > 1 || (lines.length === 1 && !trimmed.includes("}{"))) {
    return lines.map((line) => JSON.parse(line) as T);
  }

  const objects: T[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (trimmed[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        objects.push(JSON.parse(trimmed.slice(start, index + 1)) as T);
      }
    }
  }
  return objects;
}

/** Returns true when Lichess marks the arena as a team battle. */
export function isTeamBattle(tournament: OrganiserTeamBattleTournament): boolean {
  return tournament.teamBattle != null;
}

/**
 * Returns true when the configured team is listed in a team battle's team set.
 *
 * Lichess returns `teamBattle.teams` as an array on list endpoints and as an
 * object keyed by team ID on the single-tournament endpoint.
 */
export function tournamentIncludesTeam(
  tournament: OrganiserTeamBattleTournament,
  teamId: string,
): boolean {
  const teams = tournament.teamBattle?.teams;
  if (!teams) return false;
  if (Array.isArray(teams)) return teams.includes(teamId);
  return teamId in teams;
}

/**
 * Fetches created and started team battles the configured team may enter.
 *
 * The team arena listing is incomplete for some events and omits tournaments
 * that have already started. Querying each organiser's created tournaments is
 * more reliable, then filtering to team battles that include the team ID.
 */
export async function getEligibleOrganiserTeamBattles(teamId: string): Promise<Tournament[]> {
  const tournamentsById = new Map<string, Tournament>();

  for (const createdBy of tournamentOrganizers) {
    const url = new URL(
      `${lichessApiBaseUrl}/user/${encodeURIComponent(createdBy)}/tournament/created`,
    );
    url.searchParams.append("status", "10");
    url.searchParams.append("status", "20");
    url.searchParams.set("nb", String(createdTournamentFetchLimitByOrganizer[createdBy]));

    const response = await request(url.toString(), {
      headers: { Accept: "application/x-ndjson" },
    });
    if (!response.ok) throw await responseError(response);

    for (const tournament of parseNdjson<OrganiserTeamBattleTournament>(await response.text()).filter(
      (entry) => isTeamBattle(entry) && tournamentIncludesTeam(entry, teamId),
    )) {
      tournamentsById.set(tournament.id, {
        id: tournament.id,
        fullName: tournament.fullName,
        startsAt: tournament.startsAt,
      });
    }
  }

  return [...tournamentsById.values()].sort((left, right) => left.startsAt - right.startsAt);
}

/**
 * Derives join status from the `me` object on a tournament detail response.
 *
 * Exported for unit tests; production code calls `getTournamentPlayerStatus`.
 */
export function interpretTournamentPlayerStatus(detail: TournamentDetail): {
  joined: boolean;
  withdrawn: boolean;
} {
  if (!detail.me) return { joined: false, withdrawn: false };
  return { joined: !detail.me.withdraw, withdrawn: detail.me.withdraw === true };
}

/**
 * Reports whether the bearer token's account is registered for a tournament.
 *
 * Lichess exposes a `me` object on the tournament detail endpoint when the
 * authenticated user has joined. A withdrawn (paused) player still has `me`,
 * but with `withdraw: true`; those accounts should be treated as not joined so
 * the join endpoint can unpause them.
 */
export async function getTournamentPlayerStatus(
  id: string,
  token: string,
): Promise<{ joined: boolean; withdrawn: boolean }> {
  const response = await request(`${lichessApiBaseUrl}/tournament/${id}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) throw await responseError(response);

  const detail = (await response.json()) as TournamentDetail;
  return interpretTournamentPlayerStatus(detail);
}

/**
 * Asks Lichess to join an arena tournament on behalf of the token owner.
 *
 * Team battles require the `team` form value; it tells Lichess which of the
 * user's teams should represent the account. The bearer token must have the
 * `tournament:write` scope and is never logged by this program.
 */
export async function joinTournament(
  id: string,
  token: string,
  teamId: string,
): Promise<void> {
  const response = await request(`${lichessApiBaseUrl}/tournament/${id}/join`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ team: teamId }),
  });
  if (!response.ok) throw await responseError(response);
}
