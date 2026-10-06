# search-places Edge Function

`POST /functions/v1/search-places`

Request JSON:

```json
{
  "tripId": "<trip UUID>",
  "query": "명동 카페"
}
```

The caller must have a valid Supabase Google session and be the specified Trip Owner or Co-Worker. The Edge Function verifies the JWT with Supabase Auth, then calls a service-role-only database RPC that rechecks Google identity and Trip membership before atomically reserving quota.

## Limits

- Project monthly quota defaults to 4,000 Google requests, keyed by UTC month.
- Per-user rate limit defaults to 20 requests per 60-second window.
- Limits and persistent counters are read/updated inside one database transaction; no Google request is sent unless both quotas are reserved.
- Failed or timed-out Google attempts still consume a reserved request because the external request may have reached Google.
- To change defaults, update row `id = 1` in `public.google_places_quota_config` through an approved database change.

## Google Request

The function uses Places API (New) Text Search and sends an explicit FieldMask for only `id`, `displayName`, `formattedAddress`, `location`, and `googleMapsUri`. It does not request photos, reviews, ratings, or return the raw Google response. `GOOGLE_PLACES_API_KEY` is read only from Edge Function environment and is never returned or logged.

Google Maps Platform terms restrict using Places content with non-Google maps. Do not render this response on the existing Kakao/Naver map or store/cache Google Places content as Kakao/Naver Place data. Any future UI integration must keep Google content on a Google map and comply with Google's attribution and retention requirements.

## Local Test

Prerequisites: Supabase CLI, Docker, and a separate Google API key enabled for Places API (New). Do not use or change the production `.env` for local testing.

1. Start the isolated local Supabase stack and apply migrations locally:

   ```sh
   supabase start
   supabase db reset
   ```

2. Create `supabase/.env.local` (gitignored) with local Edge settings:

   ```dotenv
   GOOGLE_PLACES_API_KEY=<test-key>
   ALLOWED_ORIGINS=http://localhost:5173
   ```

3. Serve the function locally:

   ```sh
   supabase functions serve search-places --env-file supabase/.env.local
   ```

4. Run the offline validation/response-mapping tests:

   ```sh
   npm test -- supabase/functions/search-places
   ```

5. For an end-to-end test, sign in to the local Supabase Auth instance with a Google identity, use a local Trip where that user is Owner or Co-Worker, and POST to `http://127.0.0.1:54321/functions/v1/search-places` with that user's access token. Verify invalid/expired JWT and non-member Trip return 401/403; a valid member returns only the five requested fields; the 21st request in one minute is rate-limited; after the project monthly count reaches 4,000, no further Google request is made. Do not use production credentials or real production Trips for local tests.

## Deploy Later

After explicit approval to deploy and apply migrations:

1. First authenticate with `npx supabase login`, identify the intended project with `npx supabase projects list`, and link it with `npx supabase link --project-ref <project-ref>`. Read the remote migration history with `npx supabase migration list --linked` and inspect the actual quota tables and `reserve_google_places_search(uuid, uuid)` definition and privileges. Migration history alone does not prove the objects match this SQL. If the quota migration is absent, apply only `20261006000300_google_places_quota.sql` after verifying its prerequisite Trip schema; do not run `db push` or rerun other migrations. If objects exist without a history entry or differ from this file, reconcile that state before deployment rather than blindly replaying this non-idempotent migration.
2. Set Edge secrets `GOOGLE_PLACES_API_KEY` and `ALLOWED_ORIGINS` (comma-separated exact web origins). Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; never add the service-role key to frontend variables.
3. Deploy with `supabase functions deploy search-places` and verify the deployed function with Owner, Co-Worker, non-member, unauthenticated, and quota-limit cases.

Keep `verify_jwt = true` for user-session calls. Current Supabase documentation states the platform check supports legacy HS256 and asymmetric signing keys. Send the session access token in `Authorization: Bearer <user-jwt>` and the client API key in `apikey`; the handler independently verifies the session with Auth `getUser()`. Do not use `--no-verify-jwt` as a routine deployment workaround. See https://supabase.com/docs/guides/functions/auth-headers.

Offline handler tests stub Auth, RPC and Google and execute the real entrypoint. They verify that rejected sessions, RPC errors and quota denials never invoke Google. They do not establish remote SQL installation or database concurrency behavior; those require authenticated remote inspection or an isolated local Postgres/Supabase stack.

## Verified deployment (2026-10-06)

Project `onuwbxczpmfbwehdqwap` was matched to the local Supabase URL and the authenticated WSL project list. All three quota tables and the RPC were confirmed absent before applying only `20261006000300_google_places_quota.sql` through the Management API. The remote RPC body matches this file; all three tables have RLS enabled; only `service_role` among the API roles can execute the RPC. No `supabase_migrations.schema_migrations` table existed, so this application is verified by actual objects rather than CLI migration history. Do not replay the SQL merely because a migration-history entry is absent.

`search-places` is deployed as version 3, ACTIVE, with `verify_jwt = true`. Online smoke checks returned 401 for missing/invalid JWT, 204 for all three allowed origins and 403 for an untrusted origin. `GOOGLE_PLACES_API_KEY` exists remotely. `ALLOWED_ORIGINS` is configured as `https://wu-yu-hua.github.io,http://localhost:5173,http://127.0.0.1:5173`. Parsing splits on commas, trims surrounding whitespace, drops empty entries, and compares exact origins. Do not include `/KoreaPlanner/` or a trailing slash in an origin. `Retry-After` is exposed to browser callers through CORS. Monthly and user counter totals were both 0 before and after the HTTP smoke checks. Successful Google-user searches and database concurrency under load have not been exercised against production.

## Test with the current browser Google session

`PlacePicker` now includes a Kakao/Google source switch inside Search Places. Selecting Google calls this function with the current session and Trip ID, displays transient names/addresses with Google Maps attribution, and links each result to Google Maps. Google search results are not plotted on Kakao or saved as Schedule Place data. Kakao results retain their existing confirmation/save flow. Each source sends its own requests; changing source cancels pending Google work and discards stale results. Google Maps URL parsing in the separate manual-input mode remains manual coordinate input. The development-only helper `src/dev/searchPlacesProbe.ts` can still test the deployed function independently.

1. From Windows CMD in this project, run:

   ```bat
   npm run dev -- --port 5173 --strictPort
   ```

2. Open `http://localhost:5173/KoreaPlanner/` and sign in with Google there. A session on GitHub Pages or `127.0.0.1` is stored under a different origin and cannot be reused automatically on localhost. If already signed in on this exact local origin, the helper uses that session. Do not copy access tokens into commands or chat.

3. In that tab's browser DevTools Console, load the helper and list eligible Trips:

   ```js
   const probe = await import('/KoreaPlanner/src/dev/searchPlacesProbe.ts');
   console.table(await probe.listTestTrips());
   ```

   This prints only Trip ID, name and the current account's Owner/Co-Worker role. It does not print session credentials. The helper is not imported by the production application and rejects execution outside local Vite development.

4. Make one request per case, replacing the Trip IDs below:

   ```js
   await probe.searchPlacesProbe({ tripId: 'OWNER_TRIP_UUID' });
   await probe.searchPlacesProbe({ tripId: 'CO_WORKER_TRIP_UUID' });
   await probe.searchPlacesProbe({ tripId: 'EXISTING_NON_MEMBER_TRIP_UUID' });
   await probe.searchPlacesProbe({ tripId: 'OWNER_TRIP_UUID', authenticated: false });
   ```

   Owner and Co-Worker should return `status: 200` and a numeric `placeCount` (zero results is possible). If necessary, switch Google accounts using the application's sign-out/sign-in controls to obtain each role, then list Trips again. For the non-member case, use a real existing Trip ID supplied by its owner while logged in as a Google account absent from its owner/co-worker list: expect `403`. A nonexistent Trip tests `404`, not non-member access. The unauthenticated request deliberately omits the session header without signing the browser out: expect `401`.

   Each permitted search reserves one production request; Google errors/timeouts still consume that reservation. The helper sends exactly one request, performs no automatic retry, does not print tokens or raw responses, and returns only status, result count, quota reason/remaining counts, and `retryAfter`. A network/CORS error is not a passed status assertion.

## Safe quota validation

The offline handler tests cover both `user_rate_limit` and `project_monthly_limit`: each returns HTTP 429, exposes `Retry-After`, and never calls Google. Run:

```bat
npm test -- supabase/functions/search-places/handler.test.ts
```

No production limit or usage counter was changed for testing. A live 429 test was not performed: there was no accessible browser user session, and deliberately issuing 21 allowed searches would consume monthly quota and temporarily rate-limit that account. Do not lower the production monthly limit, overwrite existing counters, or loop until quota is exhausted. An isolated Supabase project with test identities, test Trips and low test quotas is the appropriate environment for forced HTTP 429 and database concurrency tests. If a genuine live request is already rate-limited, the helper can observe its 429 without replenishing or resetting counters.
