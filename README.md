# Lichess team tournament joiner

This project automatically joins selected Lichess team battles for one Lichess account. Once it has been connected to a GitHub repository, GitHub runs it every day at **10:00 UTC**.

## What you need to do

You do not need to install anything on your computer to use the scheduled version. Complete these one-time steps after putting this repository on GitHub:

1. Create a Lichess personal access token at [Lichess token settings](https://lichess.org/account/oauth/token). Give it the **`tournament:write`** permission. Treat this token like a password.
2. Find your team ID. Open your Lichess team's page and copy the text at the end of its address. For example, the team ID in `https://lichess.org/team/example-team` is `example-team`.
3. On GitHub, open this repository's **Settings → Secrets and variables → Actions** page. Under **Secrets**, create:
   - `LICHESS_API_TOKEN` — your Lichess token.
   - `LICHESS_TEAM_ID` — your team ID.
4. Open the repository's **Actions** tab, choose **Join Lichess team tournaments**, click **Run workflow**, and first select **dry run**. The log will show the events it would join, without joining anything.
5. If the dry run looks right, run it again with dry run turned off. From then on, the scheduled run handles it daily at 10:00 UTC.

GitHub may start scheduled workflows a little later than the requested time when its service is busy. You can always run the workflow manually from the Actions tab.

## What it joins

The job checks Lichess's newly created tournament list and joins these recurring team-battle series:

- `Lichess Bullet League 33A Team Battle` — every numbered Bullet League division.
- `Lichess Bundesliga Team Battle`.
- `142nd Lichess Mega Team Battle` — every numbered Mega Team Battle.
- `199th Lichess Rapid League 1 Team Battle` — every numbered Rapid League division, including divisions such as `3B`.

The examples above are representative titles, not hard-coded event numbers. The number changes each time a series returns. The Rapid League rule was verified against [199th Lichess Rapid League 1 Team Battle](https://lichess.org/tournament/iQErzJWb).

## Safety and privacy

- Your token is stored as a GitHub secret. It is supplied to the workflow only while it runs and is never committed to this repository or printed in the program's logs.
- A dry run uses only public tournament data and makes no join requests.
- The script has no database. On each run it asks Lichess for newly created tournaments and asks to join every matching one. Lichess decides whether the account is eligible or already joined.
- A failed run is shown as failed in GitHub Actions, with an error in the workflow log. Temporary network errors and Lichess rate limits are retried automatically a small number of times.

---

## Technical reference

### How one run works

```text
GitHub Actions (daily at 10:00 UTC)
        |
        v
Fetch Lichess's newly created tournaments
        |
        v
Match titles against the four target series
        |
        v
Dry run: print matches      Real run: POST a join request for each match
```

The implementation calls Lichess's public `GET /api/tournament` endpoint and reads its `created` list. For a real run, it then calls authenticated `POST /api/tournament/{id}/join` with the configured team ID. See the [official Lichess API documentation](https://lichess.org/api#tag/tournaments-arena) for the current endpoint contract and token permissions.

### Project layout

```text
.github/workflows/join-tournaments.yml  GitHub's schedule and job definition
src/config.ts                            Configuration, title rules, and validation
src/lichess.ts                           Small, retrying Lichess API client
src/index.ts                             One-run orchestration and log output
src/config.test.ts                       Matcher tests
.env.example                             Documented template for local settings
```

### Title matching

`src/config.ts` uses anchored, case-insensitive regular expressions for exactly the four known series. Anchors mean that a tournament must have the whole expected title, preventing an accidental match against an unrelated title that merely contains similar words. There is intentionally no environment-variable override: adding a new series requires a narrowly scoped code change and an accompanying test.

### Local development

The scheduled workflow installs dependencies with `npm ci`, type-checks the project, then runs it. To do the equivalent locally, use Node.js 22 or newer:

```sh
npm install
npm run check
npm test
DRY_RUN=true npm start
```

The dry run does not need a token or team ID. To make a real local request, copy the values in `.env.example` into your shell environment (or export them directly) and run `npm start`. Never commit a real token; `.env` files are ignored by Git.

### Testing changes to a matcher

When adding or changing a title rule:

1. Add a representative positive case to `src/config.test.ts`.
2. Add a similar-but-unwanted negative case if it helps prevent an overly broad match.
3. Run `npm test` and `npm run check`.
4. Use a manual GitHub Actions dry run before enabling real joining.

### Workflow inputs and environment

| Name | Where it is set | Purpose |
| --- | --- | --- |
| `LICHESS_API_TOKEN` | GitHub Actions secret | Authenticates real join requests; requires `tournament:write`. |
| `LICHESS_TEAM_ID` | GitHub Actions secret | The team that joins each team battle. |
| `DRY_RUN` | Manual workflow input or local environment | When `true`, lists matches without joining them. |

### Failure and retry behaviour

Requests are retried twice after a network failure or the temporary HTTP statuses `429`, `502`, `503`, and `504`. When Lichess sends a numeric `Retry-After` header, the client respects it; otherwise it waits 1 second and then 2 seconds. Authentication and validation failures are not retried because they need a configuration correction.
