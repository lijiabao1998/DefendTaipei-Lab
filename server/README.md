# DefendTaipei multiplayer server (local-only so far)

Cloudflare Worker + one Durable Object per room (`Room`), D1 for room saves and anonymous users, R2 for archived room states.
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
   with *Workers Scripts:Edit, D1:Edit, Workers R2 Storage:Edit* (or interactive `wrangler login`).
2. `npx wrangler d1 create dt_saves` → paste the `database_id` into `wrangler.toml`; `npx wrangler d1 migrations apply dt_saves --remote`.
3. `npx wrangler r2 bucket create dt-room-archive` (R2 must be enabled on the account; it can be dropped if it isn't wanted).
4. `npx wrangler secret put AUTH_SECRET` (a random string of 32+ characters).
5. `npx wrangler deploy`. The game client then needs `?mp=https://defendtaipei-mp.<subdomain>.workers.dev` (or bake the URL in as the default).
6. Optional: a custom domain or route, and rate-limiting rules.

## Validation done on the server
- The client claims a position; the server limits each move to the max speed per tick (on foot or in a vehicle) and rejects with `speed`.
- Stale or replayed sequence numbers are dropped. Attacks are checked for range and cooldown; loot is first come, first served, with a range check.
- Messages over 2 kB, or more than 60 per second, are dropped. At most 4 players per room. Tokens are HMAC-signed anonymous ids.
- Not validated: walls and buildings. The server has no copy of the map geometry, so it can't stop a client walking through a wall.
