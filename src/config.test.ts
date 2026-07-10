import assert from "node:assert/strict";
import test from "node:test";
import { matchesTargetTournament } from "./config.js";

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
