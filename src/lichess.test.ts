import assert from "node:assert/strict";
import test from "node:test";
import { interpretTournamentPlayerStatus } from "./lichess.js";

test("interpretTournamentPlayerStatus treats missing me as not joined", () => {
  assert.deepEqual(interpretTournamentPlayerStatus({}), {
    joined: false,
    withdrawn: false,
  });
});

test("interpretTournamentPlayerStatus treats active me as joined", () => {
  assert.deepEqual(interpretTournamentPlayerStatus({ me: { rank: 42 } }), {
    joined: true,
    withdrawn: false,
  });
});

test("interpretTournamentPlayerStatus treats withdrawn me as not joined", () => {
  assert.deepEqual(interpretTournamentPlayerStatus({ me: { rank: 42, withdraw: true } }), {
    joined: false,
    withdrawn: true,
  });
});
