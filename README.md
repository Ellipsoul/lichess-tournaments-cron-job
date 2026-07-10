# Lichess Team Tournament Joiner

A small scheduled automation that joins recurring Lichess team battles on behalf of one account and team. It is designed to run as a daily GitHub Actions workflow, with an optional dry-run mode for safe verification.

## Purpose

Several popular Lichess team-battle series run on a regular schedule—Bullet League, Bundesliga, Mega Team Battle, and Rapid League. Registering for each event manually is easy to forget. This repository runs a short script once per day that:

1. Fetches upcoming team battles your team is eligible for.
2. Matches them against a fixed set of title patterns.
3. Sends a join request for every match.

The script keeps no database or state between runs. Lichess remains the source of truth for eligibility, timing, and whether an account has already joined. When a token is available, each matching tournament is checked via `GET /api/tournament/{id}`; Lichess includes a `me` object when the account is already registered.

## How it works

```text
GitHub Actions (daily at 10:00 UTC)
        |
        v
GET /api/user/{organiser}/tournament/created?status=10&status=20  (once per organiser)
        |
        v
Keep team battles that include your team ID; match titles against the four target series
        |
        v
When a token is present: GET /api/tournament/{id} per match to split already joined vs to join
        |
        v
Dry run: log both groups          Real run: POST /api/tournament/{id}/join for to-join only
```

On each run the script calls the [Lichess user-created tournaments API](https://lichess.org/api#tag/Arena-tournaments/operation/apiUserNameTournamentCreated) once per known organiser (`luisalce`, `jeffforever`, and `cormacobear`), requesting both created and started events. It keeps only team battles whose `teamBattle.teams` list includes your team ID, then applies anchored regular expressions in `src/config.ts` to decide which titles to join. The older team arena listing was unreliable: it omitted some eligible events (for example Bundesliga) and excluded tournaments that had already started (for example Mega).

`npm start` loads `.env.local` when that file exists locally. GitHub Actions supplies secrets via workflow `env` instead, so no env file is required in CI.

## Tournaments joined

The job joins these recurring series (ordinal numbers change each event):

| Series | Example title |
| --- | --- |
| Bullet League | `Lichess Bullet League 33A Team Battle` |
| Bundesliga | `Lichess Bundesliga Team Battle` |
| Mega Team Battle | `142nd Lichess Mega Team Battle` |
| Rapid League | `199th Lichess Rapid League 1 Team Battle` |

Division suffixes such as `3B` in Rapid League are supported. Adding a new series requires a code change and a test in `src/config.test.ts`; there is no environment-variable override.

## Local development

**Requirements:** Node.js 22 or newer.

```sh
git clone https://github.com/Ellipsoul/lichess-tournaments-cron-job.git
cd lichess-tournaments-cron-job
npm install
```

### Run tests and type-check

```sh
npm test
npm run check
```

### Dry run (recommended first)

A dry run lists matching tournaments without joining anything. It needs your team ID. For accurate already-joined detection, provide a token as well (for example via `.env.local`, which `npm start` loads automatically). Without a token, every match is listed under "To join".

```sh
DRY_RUN=true LICHESS_TEAM_ID=your-team-id npm start
```

Example output:

```text
Found 2 upcoming team battles; 2 match.
[dry run] Already joined (1):
  142nd Lichess Mega Team Battle (2agD9179, 2026-07-10T16:00:00.000Z)
[dry run] To join (1):
  Lichess Bullet League 33A Team Battle (abc12345, 2026-07-11T18:00:00.000Z)
[dry run] Would join Lichess Bullet League 33A Team Battle (abc12345, 2026-07-11T18:00:00.000Z).
```

### Real run

To join tournaments locally, provide a Lichess personal access token with the `tournament:write` scope. Copy `.env.example` to `.env.local` (or export the variables in your shell) and run:

```sh
npm start
```

Never commit a real token. `.env` files are ignored by Git.

### Changing a title matcher

1. Add a representative positive case to `src/config.test.ts`.
2. Add a negative case if it helps prevent an overly broad match.
3. Run `npm test` and `npm run check`.
4. Verify with a dry run before enabling real joining.

## GitHub Actions setup

The workflow in `.github/workflows/join-tournaments.yml` runs daily at **10:00 UTC** and can also be triggered manually from the Actions tab.

### 1. Create a Lichess token

Create a [personal access token](https://lichess.org/account/oauth/token) with the **`tournament:write`** permission. Treat it like a password.

### 2. Find your team ID

Open your Lichess team page and copy the final segment of the URL. For `https://lichess.org/team/example-team`, the team ID is `example-team`.

### 3. Add GitHub secrets

In your fork of this repository, open **Settings → Secrets and variables → Actions** and create:

| Secret | Description |
| --- | --- |
| `LICHESS_API_TOKEN` | Your Lichess personal access token |
| `LICHESS_TEAM_ID` | The team ID that will join each battle |

These secrets are loaded from the **GitHub Action Environment** configured in the workflow.

### 4. Verify with a dry run

1. Open the **Actions** tab.
2. Select **Join Lichess team tournaments**.
3. Click **Run workflow**, enable **dry run**, and run it.
4. Check the log for the tournaments that would be joined.

### 5. Enable scheduled joining

Run the workflow again with dry run disabled. From then on, the daily schedule handles registration automatically. GitHub may start scheduled workflows slightly late during high load; you can always trigger a manual run from the Actions tab.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `LICHESS_TEAM_ID` | Always | Team whose upcoming arena tournaments are fetched and used when joining |
| `LICHESS_API_TOKEN` | Real runs only | Authenticates join requests (`tournament:write` scope) |
| `DRY_RUN` | No | When `true`, lists matches without joining (`false` by default) |

## Project structure

```text
.github/workflows/join-tournaments.yml   Scheduled and manual GitHub Actions workflow
src/config.ts                              Title patterns, organisers, and validation
src/lichess.ts                             Lichess API client with retry logic
src/index.ts                               Run orchestration and log output
src/config.test.ts                         Matcher and parsing tests
.env.example                               Local environment template
```

## Reliability and security

- Tokens are supplied to the workflow only at runtime and are never logged or committed.
- Transient network errors and HTTP `429`, `502`, `503`, and `504` responses are retried up to twice. A numeric `Retry-After` header is respected when present.
- Authentication and validation failures are not retried; fix the configuration and re-run.
