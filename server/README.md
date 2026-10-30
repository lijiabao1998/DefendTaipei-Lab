# DefendTaipei multiplayer server (local-only so far)

Cloudflare Worker + one Durable Object per room (`Room`), D1 for room saves and anonymous users, optional R2 for historical room snapshots. Default configuration requires no R2 subscription; D1 keeps the latest recovery state.
The simulation runs in `../src/sim/core.ts`, which the browser and the Durable Object share. It ticks at a fixed 20 Hz, uses a
seeded RNG and positions rounded to millimetres. The server sends a snapshot on join, then a per-client delta against the
last tick that client acknowledged.

## Run locally (no account needed)
```
cd server && npm install
node -e "require('fs').writeFileSync('.dev.vars','AUTH_SECRET='+require('crypto').randomBytes(24).toString('hex')+'\n')"
npx wrangler d1 migrations apply dt_saves --local
npx wrangler dev --local --port 8787
node test-mp.mjs                      # integration test: auth, codes, 4 players, room full, validation, reconnect, D1 save
```
Then open the game, choose 🌐 建立房間 (server `http://localhost:8787`), give friends the 5-letter code,
or open `…/?room=CODE&mp=http://host:8787`.

## To deploy (needs the user's Cloudflare account; not done)
1. A Cloudflare account with Workers Paid **or** Free plan (SQLite-backed Durable Objects are available on Free), plus an API token
   with *Workers Scripts:Edit, D1:Edit* (or interactive `wrangler login`).
2. `npx wrangler d1 create dt_saves` → paste the `database_id` into `wrangler.toml`; `npx wrangler d1 migrations apply dt_saves --remote`.
3. Skip R2 for the no-card Free deployment. `ARCHIVE` is optional; no R2 bucket or subscription is required. Only enable historical R2 copies with separate billing approval.
4. `npx wrangler secret put AUTH_SECRET` (a random string of 32+ characters).
5. `npx wrangler deploy`. The game client then needs `?mp=https://defendtaipei-mp.<subdomain>.workers.dev` (or bake the URL in as the default).
6. Optional: a custom domain or route, and rate-limiting rules.

## Validation done on the server
- The client claims a position; the server limits each move to the max speed per tick (on foot or in a vehicle) and rejects with `speed`.
- Stale or replayed sequence numbers are dropped. Attacks are checked for range and cooldown; loot is first come, first served, with a range check.
- Messages over 2 kB, or more than 60 per second, are dropped. At most 4 players per room. Tokens are HMAC-signed anonymous ids.
- Not validated: walls and buildings. The server has no copy of the map geometry, so it can't stop a client walking through a wall.

## No-card Free deployment storage

The default configuration uses Workers Free + SQLite Durable Objects + D1, not R2. The existing `rooms.state` row is the authoritative latest recovery checkpoint. Each disconnect checkpoints immediately with waitUntil. Final disconnect schedules a durable alarm beyond the 60-second reconnect window; the alarm saves the final state and stops ticking even if no client remains to keep interval callbacks alive. A new Room instance loads that row. No new schema or historical archive table is needed. This preserves reconnect/recovery, but does not retain a separate immutable copy for every room close. Room rows are not automatically deleted; monitor storage and do not promise unlimited retention or availability. D1 save failure is still a persistence failure, not masked by optional archive handling.

`MP_TEST_IDLE_RECOVERY=1 node server/test-mp.mjs` additionally tests real sockets, final disconnect beyond the grace period, persisted idle state and rejoin without an R2 binding. Unit coverage separately creates a cold Room instance from the saved checkpoint and tests optional R2 failure isolation.

Free plan quotas are finite. Do not upgrade plans or enable R2 automatically. Stop deployment if the provider requests a payment method or paid subscription.
