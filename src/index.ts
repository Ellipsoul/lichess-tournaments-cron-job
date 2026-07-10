import {
  getRuntimeConfig,
  matchesTargetTournament,
  validateJoinConfig,
} from "./config.js";
import { getNewTournaments, joinTournament } from "./lichess.js";

async function main(): Promise<void> {
  const config = getRuntimeConfig();
  validateJoinConfig(config);

  const created = await getNewTournaments();
  const matches = created.filter((tournament) =>
    matchesTargetTournament(tournament.fullName, config.extraNameSuffixes),
  );

  console.log(`Found ${created.length} newly created tournaments; ${matches.length} match.`);
  for (const tournament of matches) {
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
