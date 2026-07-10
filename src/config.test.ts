import assert from "node:assert/strict";
import test from "node:test";
import { matchesTargetTournament } from "./config.js";

test("matches the three verified team battle series", () => {
  assert.equal(matchesTargetTournament("Lichess Bullet League 33A Team Battle"), true);
  assert.equal(matchesTargetTournament("Lichess Bundesliga Team Battle"), true);
  assert.equal(matchesTargetTournament("142nd Lichess Mega Team Battle"), true);
});

test("does not match unrelated arenas", () => {
  assert.equal(matchesTargetTournament("Hourly Bullet Arena"), false);
  assert.equal(matchesTargetTournament("142nd Lichess Mega Arena"), false);
});

test("matches configured literal suffixes", () => {
  assert.equal(matchesTargetTournament("21st Example Team Battle", ["Example Team Battle"]), true);
});
