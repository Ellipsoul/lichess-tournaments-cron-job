import assert from "node:assert/strict";
import test from "node:test";
import { matchesTargetTournament, validateJoinConfig } from "./config.js";
import { isTeamBattle, parseNdjson } from "./lichess.js";

/** These are representative titles from each verified tournament series. */
test("matches the four verified team battle series", () => {
  assert.equal(matchesTargetTournament("Lichess Bullet League 33A Team Battle"), true);
  assert.equal(matchesTargetTournament("Lichess Bundesliga Team Battle"), true);
  assert.equal(matchesTargetTournament("142nd Lichess Mega Team Battle"), true);
  assert.equal(matchesTargetTournament("199th Lichess Rapid League 1 Team Battle"), true);
  assert.equal(matchesTargetTournament("200th Lichess Rapid League 3B Team Battle"), true);
});

test("does not match unrelated arenas", () => {
  assert.equal(matchesTargetTournament("Hourly Bullet Arena"), false);
  assert.equal(matchesTargetTournament("142nd Lichess Mega Arena"), false);
  assert.equal(matchesTargetTournament("199th Lichess Rapid League Arena"), false);
});

test("requires team ID for dry runs", () => {
  assert.throws(
    () => validateJoinConfig({ dryRun: true }),
    /LICHESS_TEAM_ID is required/,
  );
});

test("requires token for real runs", () => {
  assert.throws(
    () => validateJoinConfig({ dryRun: false, teamId: "example-team" }),
    /LICHESS_API_TOKEN is required/,
  );
});

test("parseNdjson reads newline-delimited objects", () => {
  const body = [
    '{"id":"a","fullName":"First"}',
    '{"id":"b","fullName":"Second"}',
  ].join("\n");

  const parsed = parseNdjson<{ id: string; fullName: string }>(body);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.id, "a");
  assert.equal(parsed[1]?.fullName, "Second");
});

test("parseNdjson reads concatenated objects without newlines", () => {
  const body = '{"id":"a"}{"id":"b"}';
  assert.deepEqual(parseNdjson<{ id: string }>(body), [{ id: "a" }, { id: "b" }]);
});

test("isTeamBattle checks for the teamBattle field", () => {
  assert.equal(
    isTeamBattle({
      id: "a",
      fullName: "Example",
      startsAt: 0,
      teamBattle: { teams: ["example-team"], nbLeaders: 5 },
    }),
    true,
  );
  assert.equal(
    isTeamBattle({
      id: "b",
      fullName: "Member arena",
      startsAt: 0,
    }),
    false,
  );
});
