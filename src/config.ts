export const lichessApiBaseUrl = "https://lichess.org/api";

const defaultNamePatterns = [
  /^Lichess Bullet League \d+[A-Z] Team Battle$/i,
  /^Lichess Bundesliga Team Battle$/i,
  /^\d+(?:st|nd|rd|th) Lichess Mega Team Battle$/i,
];

export interface RuntimeConfig {
  dryRun: boolean;
  token?: string;
  teamId?: string;
  extraNameSuffixes: string[];
}

export function getRuntimeConfig(environment = process.env): RuntimeConfig {
  return {
    dryRun: environment.DRY_RUN?.toLowerCase() === "true",
    token: environment.LICHESS_API_TOKEN,
    teamId: environment.LICHESS_TEAM_ID,
    extraNameSuffixes: (environment.TOURNAMENT_NAME_SUFFIXES ?? "")
      .split(",")
      .map((suffix) => suffix.trim())
      .filter(Boolean),
  };
}

export function matchesTargetTournament(
  fullName: string,
  extraNameSuffixes: string[] = [],
): boolean {
  return (
    defaultNamePatterns.some((pattern) => pattern.test(fullName)) ||
    extraNameSuffixes.some((suffix) => fullName.endsWith(suffix))
  );
}

export function validateJoinConfig(config: RuntimeConfig): void {
  if (config.dryRun) return;
  if (!config.token) {
    throw new Error("LICHESS_API_TOKEN is required unless DRY_RUN=true.");
  }
  if (!config.teamId) {
    throw new Error(
      "LICHESS_TEAM_ID is required: these are team battles and Lichess requires the team to join with.",
    );
  }
}
