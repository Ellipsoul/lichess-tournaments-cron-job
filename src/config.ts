import { existsSync, readFileSync } from "node:fs";

/** The root URL shared by every Lichess API request in this application. */
export const lichessApiBaseUrl = "https://lichess.org/api";

/**
 * Lichess accounts that create the recurring team-battle series this job joins.
 *
 * The team arena endpoint returns tournaments farthest in the future first, so a
 * single unfiltered request can omit nearer events once the team has many entries.
 * Querying each organiser separately keeps discovery reliable.
 */
export const tournamentOrganizers = ["luisalce", "jeffforever", "cormacobear"] as const;

/**
 * How many created/started tournaments to request per organiser.
 *
 * The organiser-created endpoint sorts farthest in the future first. Jeffforever
 * schedules many Rapid League divisions, so a higher limit is required before
 * nearer Bundesliga and Rapid events appear in the stream.
 */
export const createdTournamentFetchLimitByOrganizer: Record<
  (typeof tournamentOrganizers)[number],
  number
> = {
  luisalce: 50,
  jeffforever: 400,
  cormacobear: 100,
};

/**
 * Tournament series this job joins automatically.
 *
 * `fullName` is the stable, human-readable tournament title returned by
 * Lichess's team arena endpoint. Anchoring each expression with
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
 * Secrets remain optional in the type because tests can pass partial config.
 * `validateJoinConfig` checks that required values are present before the run
 * fetches tournaments or sends join requests.
 */
export interface RuntimeConfig {
  dryRun: boolean;
  token?: string;
  teamId?: string;
}

/**
 * Applies `KEY=value` lines to an environment object without overwriting values
 * that are already set.
 */
export function applyEnvFileContent(
  content: string,
  environment: Record<string, string | undefined>,
): void {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && environment[key] === undefined) {
      environment[key] = value;
    }
  }
}

/**
 * Loads variables from `.env.local` when the file exists.
 *
 * GitHub Actions and other CI environments inject secrets directly into
 * `process.env`, so they do not need a local env file. Existing environment
 * variables always win over file values.
 */
export function loadLocalEnvFile(
  filePath = ".env.local",
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (!existsSync(filePath)) return;
  applyEnvFileContent(readFileSync(filePath, "utf8"), environment);
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
 * Stops a run early if its required configuration is missing.
 *
 * The team ID is always required because upcoming tournaments are fetched from
 * the team arena endpoint. A token is only required for real join requests.
 */
export function validateJoinConfig(config: RuntimeConfig): void {
  if (!config.teamId) {
    throw new Error(
      "LICHESS_TEAM_ID is required: upcoming team battles are fetched from the team arena endpoint and Lichess requires the team to join with.",
    );
  }
  if (config.dryRun) return;
  if (!config.token) {
    throw new Error("LICHESS_API_TOKEN is required unless DRY_RUN=true.");
  }
}
