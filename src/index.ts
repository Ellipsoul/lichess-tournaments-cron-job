import {
  getRuntimeConfig,
  matchesTargetTournament,
  validateJoinConfig,
} from "./config.js";
import { getNewTournaments, joinTournament } from "./lichess.js";

/**
 * Coordinates one complete run of the automation.
 *
 * The script deliberately has no database or saved state. On every run it
 * asks Lichess for recently created tournaments, filters that short list, and
 * asks Lichess to join every match. Lichess remains the source of truth for
 * eligibility and whether the account may join a particular event.
 */
async function main(): Promise<void> {
  const config = getRuntimeConfig();
  validateJoinConfig(config);

  // Only the `created` list is relevant: these are the newly announced events
  // the daily job is intended to discover before they begin.
  const created = await getNewTournaments();
  const matches = created.filter((tournament) => matchesTargetTournament(tournament.fullName));

  console.log(`Found ${created.length} newly created tournaments; ${matches.length} match.`);
  for (const tournament of matches) {
    // Convert Lichess's timestamp to ISO 8601 so logs are unambiguous in both
    // GitHub Actions (UTC) and a developer's local terminal.
    const startsAt = new Date(tournament.startsAt).toISOString();
    if (config.dryRun) {
      console.log(`[dry run] Would join ${tournament.fullName} (${tournament.id}, ${startsAt}).`);
      continue;
    }

    console.log(`Joining ${tournament.fullName} (${tournament.id}, ${startsAt})…`);
    await joinTournament(tournament.id, config.token!, config.teamId!);
    console.log(`Joined ${tournament.id}.`);
  }
}

// Allow an exception to fail the GitHub Action and preserve a useful message
// in its log instead of producing an unhandled-promise warning.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
