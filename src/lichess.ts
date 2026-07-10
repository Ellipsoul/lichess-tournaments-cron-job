import { lichessApiBaseUrl } from "./config.js";

export interface Tournament {
  id: string;
  fullName: string;
  startsAt: number;
}

interface TournamentResponse {
  created: Tournament[];
}

const retryableStatuses = new Set([429, 502, 503, 504]);

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1_000;
  return 1_000 * 2 ** attempt;
}

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

async function responseError(response: Response): Promise<Error> {
  const detail = (await response.text()).trim();
  return new Error(
    `Lichess API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
  );
}

export async function getNewTournaments(): Promise<Tournament[]> {
  const response = await request(`${lichessApiBaseUrl}/tournament`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await responseError(response);

  const data = (await response.json()) as TournamentResponse;
  return data.created ?? [];
}

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
