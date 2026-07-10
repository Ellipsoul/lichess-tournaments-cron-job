/** The root URL shared by every Lichess API request in this application. */
export const lichessApiBaseUrl = "https://lichess.org/api";

/**
 * Tournament series this job joins automatically.
 *
 * `fullName` is the stable, human-readable tournament title returned by
 * Lichess's `GET /api/tournament` endpoint. Anchoring each expression with
 * `^` and `$` matters: it prevents a similarly named, unrelated tournament
 * from matching merely because it contains a target series name.
 *
 * The ordinal prefix is intentionally accepted as any number followed by an
 * ordinal ending. This makes the job continue to work as each recurring event
 * receives its next number (for example, 199th -> 200th).
 */
const defaultNamePatterns = [
  /^Lichess Bullet League \d+[A-Z] Team Battle$/i,
  /^Lichess Bundesliga Team Battle$/i,
  /^\d+(?:st|nd|rd|th) Lichess Mega Team Battle$/i,
  /^\d+(?:st|nd|rd|th) Lichess Rapid League \d+[A-Z]? Team Battle$/i,
];

/**
 * All configuration required for one execution of the job.
 *
 * Secrets remain optional in the type because a dry run deliberately needs no
 * credentials. `validateJoinConfig` checks that they are present before a
 * real join request is ever sent.
 */
export interface RuntimeConfig {
  dryRun: boolean;
  token?: string;
  teamId?: string;
}

/**
 * Reads and normalises the environment variables used by the script.
 *
 * The optional `environment` argument keeps this function easy to test: tests
 * can pass a small object instead of changing the process-wide environment.
 */
export function getRuntimeConfig(environment = process.env): RuntimeConfig {
  return {
    dryRun: environment.DRY_RUN?.toLowerCase() === "true",
    token: environment.LICHESS_API_TOKEN,
    teamId: environment.LICHESS_TEAM_ID,
  };
}

/**
 * Determines whether a Lichess tournament title belongs to a series that this
 * account should join.
 *
 * Only the four built-in rules are used. Adding another series is an explicit
 * code change: add a narrowly scoped pattern above and a representative test
 * in `config.test.ts`.
 */
export function matchesTargetTournament(fullName: string): boolean {
  return defaultNamePatterns.some((pattern) => pattern.test(fullName));
}

/**
 * Stops a real run early if its required GitHub secrets are missing.
 *
 * A dry run returns immediately because it only reads public Lichess data and
 * never calls the authenticated join endpoint.
 */
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
