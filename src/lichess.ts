import { lichessApiBaseUrl } from "./config.js";

/** The subset of a newly created tournament used by this application. */
export interface Tournament {
  id: string;
  fullName: string;
  startsAt: number;
}

interface TournamentResponse {
  created: Tournament[];
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
 * Fetches Lichess's public list of newly created tournaments.
 *
 * The endpoint also returns other groups, but this job intentionally consumes
 * only `created`: older or currently running tournaments should not be
 * rediscovered by this scheduled automation.
 */
export async function getNewTournaments(): Promise<Tournament[]> {
  const response = await request(`${lichessApiBaseUrl}/tournament`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await responseError(response);

  const data = (await response.json()) as TournamentResponse;
  return data.created ?? [];
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
