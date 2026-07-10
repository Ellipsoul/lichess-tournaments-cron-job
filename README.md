# Lichess team tournament joiner

This GitHub Actions job checks Lichess once per day and joins newly released, matching team battles for one Lichess account.

It uses Lichess' public `GET /api/tournament` endpoint and its authenticated [`POST /api/tournament/{id}/join`](https://lichess.org/api#tag/tournaments-arena/POST/api/tournament/{id}/join) endpoint. The join endpoint requires a token with the `tournament:write` scope and, for team battles, the team ID to play for.

## Included matching rules

The supplied examples verified these three series:

- `Lichess Bullet League 33A Team Battle` (any numbered division)
- `Lichess Bundesliga Team Battle`
- `142nd Lichess Mega Team Battle` (any ordinal number)

The fourth supplied tournament ID, `HTNx8V04`, now returns 404 from the Lichess API, so its series cannot be identified from the live record. Once you know its name suffix, set the optional repository variable `TOURNAMENT_NAME_SUFFIXES`; for example, `Some Other Team Battle`. Multiple suffixes are comma-separated.

## GitHub setup

1. Create a [Lichess personal access token](https://lichess.org/account/oauth/token) with the `tournament:write` scope.
2. In GitHub repository **Settings → Secrets and variables → Actions**, add these repository secrets:
   - `LICHESS_API_TOKEN`: the token (never commit it).
   - `LICHESS_TEAM_ID`: the ID from the final segment of your Lichess team URL.
3. Optionally add the `TOURNAMENT_NAME_SUFFIXES` repository variable for extra name suffixes.
4. Push the repository to GitHub, then use **Actions → Join Lichess team tournaments → Run workflow** and select dry-run first. The scheduled job runs daily at 07:17 UTC.

## Local dry-run

```sh
npm install
DRY_RUN=true npm start
```

To make a real local join, copy `.env.example` values into your environment. The script is intentionally stateless: it only queries Lichess' current `created` tournaments and sends a join request for every match. Lichess is the source of truth for whether the account is eligible and already joined.
