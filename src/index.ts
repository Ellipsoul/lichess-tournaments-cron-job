import {
  getRuntimeConfig,
  matchesTargetTournament,
  validateJoinConfig,
} from "./config.js";
import { getUpcomingTeamArenaTournaments, joinTournament } from "./lichess.js";

/** Pause between consecutive join requests to stay within Lichess rate limits. */
const joinRequestDelayMs = 5_000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Coordinates one complete run of the automation.
 *
 * The script deliberately has no database or saved state. On every run it
 * asks Lichess for upcoming team arena tournaments, filters that list, and
 * asks Lichess to join every match. Lichess remains the source of truth for
 * eligibility and whether the account may join a particular event.
 */
async function main(): Promise<void> {
  const config = getRuntimeConfig();
  validateJoinConfig(config);

  const upcoming = await getUpcomingTeamArenaTournaments(config.teamId!);
  const matches = upcoming.filter((tournament) => matchesTargetTournament(tournament.fullName));

  console.log(`Found ${upcoming.length} upcoming team battles; ${matches.length} match.`);
  let joinsSent = 0;
  for (const tournament of matches) {
    // Convert Lichess's timestamp to ISO 8601 so logs are unambiguous in both
    // GitHub Actions (UTC) and a developer's local terminal.
    const startsAt = new Date(tournament.startsAt).toISOString();
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

// Allow an exception to fail the GitHub Action and preserve a useful message
// in its log instead of producing an unhandled-promise warning.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
