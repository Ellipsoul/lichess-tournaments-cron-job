import {
  getRuntimeConfig,
  loadLocalEnvFile,
  matchesTargetTournament,
  validateJoinConfig,
} from "./config.js";
import {
  getTournamentPlayerStatus,
  getEligibleOrganiserTeamBattles,
  joinTournament,
} from "./lichess.js";

loadLocalEnvFile();

/** Pause between consecutive join requests to stay within Lichess rate limits. */
const joinRequestDelayMs = 5_000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Coordinates one complete run of the automation.
 *
 * The script deliberately has no database or saved state. On every run it
 * asks Lichess for eligible organiser team battles, filters that list, skips
 * tournaments the token owner has already joined, and asks Lichess to join the
 * rest. Lichess remains the source of truth for eligibility and whether the
 * account may join a particular event.
 */
async function main(): Promise<void> {
  const config = getRuntimeConfig();
  validateJoinConfig(config);

  const eligible = await getEligibleOrganiserTeamBattles(config.teamId!);
  const matches = eligible.filter((tournament) => matchesTargetTournament(tournament.fullName));

  console.log(`Found ${eligible.length} eligible team battles; ${matches.length} match.`);

  if (config.dryRun && !config.token) {
    console.log(
      "[dry run] No LICHESS_API_TOKEN loaded: already-joined detection is skipped. Add a token to .env.local or pass it in the environment.",
    );
  }

  const { alreadyJoined, toJoin } = await splitByJoinStatus(matches, config.token);
  logTournamentGroup("Already joined", alreadyJoined, config.dryRun);
  logTournamentGroup("To join", toJoin, config.dryRun);

  let joinsSent = 0;
  for (const tournament of toJoin) {
    const startsAt = formatStartsAt(tournament.startsAt);
    if (config.dryRun) {
      console.log(`[dry run] Would join ${tournament.fullName} (${tournament.id}, ${startsAt}).`);
      continue;
    }

    if (joinsSent > 0) {
      await sleep(joinRequestDelayMs);
    }

    console.log(`Joining ${tournament.fullName} (${tournament.id}, ${startsAt})…`);
    await joinTournament(tournament.id, config.token!, config.teamId!);
    console.log(`Joined ${tournament.id}.`);
    joinsSent += 1;
  }
}

/** Converts Lichess's timestamp to ISO 8601 for unambiguous logs. */
function formatStartsAt(startsAt: number): string {
  return new Date(startsAt).toISOString();
}

/**
 * Splits matching tournaments into those the token owner has already joined and
 * those that still need a join request.
 *
 * Without a token (dry run), join status cannot be queried and every match is
 * treated as needing a join so discovery output stays useful.
 */
async function splitByJoinStatus(
  tournaments: Awaited<ReturnType<typeof getEligibleOrganiserTeamBattles>>,
  token?: string,
): Promise<{
  alreadyJoined: typeof tournaments;
  toJoin: typeof tournaments;
}> {
  if (!token) {
    return { alreadyJoined: [], toJoin: tournaments };
  }

  const alreadyJoined: typeof tournaments = [];
  const toJoin: typeof tournaments = [];

  for (const tournament of tournaments) {
    const status = await getTournamentPlayerStatus(tournament.id, token);
    if (status.joined) {
      alreadyJoined.push(tournament);
      continue;
    }
    toJoin.push(tournament);
  }

  return { alreadyJoined, toJoin };
}

/** Logs one tournament group with a consistent prefix for dry-run and real runs. */
function logTournamentGroup(
  label: string,
  tournaments: Awaited<ReturnType<typeof getEligibleOrganiserTeamBattles>>,
  dryRun: boolean,
): void {
  const prefix = dryRun ? "[dry run] " : "";
  console.log(`${prefix}${label} (${tournaments.length}):`);
  for (const tournament of tournaments) {
    const startsAt = formatStartsAt(tournament.startsAt);
    console.log(`  ${tournament.fullName} (${tournament.id}, ${startsAt})`);
  }
}

// Allow an exception to fail the GitHub Action and preserve a useful message
// in its log instead of producing an unhandled-promise warning.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
