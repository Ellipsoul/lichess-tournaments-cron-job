import { lichessApiBaseUrl, tournamentOrganizers } from "./config.js";

/** The subset of a team arena tournament used by this application. */
export interface Tournament {
  id: string;
  fullName: string;
  startsAt: number;
}

interface TeamArenaTournament extends Tournament {
  teamBattle?: {
    teams?: string[];
    nbLeaders?: number;
  };
}

/** Maximum upcoming tournaments to request per organiser. */
const teamArenaFetchLimitPerOrganizer = 20;

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
export function isTeamBattle(tournament: TeamArenaTournament): boolean {
  return tournament.teamBattle != null;
}

/**
 * Fetches upcoming arena tournaments relevant to the configured team.
 *
 * Requests are made once per known organiser because the team arena endpoint
 * sorts by farthest start date first and can omit nearer events behind `max`.
 * The endpoint can also return member-only arenas that are not team battles.
 */
export async function getUpcomingTeamArenaTournaments(teamId: string): Promise<Tournament[]> {
  const tournamentsById = new Map<string, Tournament>();

  for (const createdBy of tournamentOrganizers) {
    const url = new URL(`${lichessApiBaseUrl}/team/${encodeURIComponent(teamId)}/arena`);
    url.searchParams.set("status", "created");
    url.searchParams.set("createdBy", createdBy);
    url.searchParams.set("max", String(teamArenaFetchLimitPerOrganizer));

    const response = await request(url.toString(), {
      headers: { Accept: "application/x-ndjson" },
    });
    if (!response.ok) throw await responseError(response);

    for (const tournament of parseNdjson<TeamArenaTournament>(await response.text()).filter(isTeamBattle)) {
      tournamentsById.set(tournament.id, {
        id: tournament.id,
        fullName: tournament.fullName,
        startsAt: tournament.startsAt,
      });
    }
  }

  return [...tournamentsById.values()];
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
