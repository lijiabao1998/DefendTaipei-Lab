# Multiplayer prototype — 2026-10-30

## Honest scope

This branch hardens the existing 2–4 player Cloudflare Worker prototype; it is **not a public multiplayer launch**. The existing Worker replicates player positions, shared sentries, room membership and server-side combat commands. Inventory, story, local patrols, world loot and survival are still primarily single-player systems. A shared sentry is not a claim that the entire survival world is synchronized. Do not merge/advertise this as complete co-op survival.

Single-player progress writes/deletes are suppressed while a multiplayer session runs. Settings remain independent. Leaving multiplayer reloads the single-player title. Reconnection now uses the server's acknowledged command sequence; deltas are applied to their exact historical baseline, with a snapshot requested if absent. Closing/replaced sessions cannot silently reopen. Anonymous tokens are scoped to backend URL. Query parameters are assigned as input values rather than injected as HTML.

## Local verification

Run the server commands in `server/README.md`, then `npm run dev -- --host 127.0.0.1 --port 5173`.

- `node scripts/checks/multiplayer-unit.mjs`: save isolation, single-player writes, malformed commands, delta baseline/resync and leave cleanup.
- `node server/test-mp.mjs`: actual HTTP/WebSocket clients, independent identities, bidirectional movement, four-player capacity, rejected invalid commands, contested loot, reconnection, D1 persistence. This test now has assertions and a timeout, rather than only printing results.
- `node scripts/checks/multiplayer.mjs`: two isolated browser contexts (desktop + phone), actual Worker transport, movement both ways, reconnect, save isolation, full game join, screenshots and leave. No mocked WebSocket/fetch. Requires Playwright Chromium, Vite and Worker.

The dot sandbox passed typecheck, build, module checks and the new unit tests. Local Chromium launch is blocked by Unix socket permissions; the elevated execution wrapper itself fails with a read-only sessions mount. Browser results must come from the explicit test branch's GitHub Actions workflow, not be inferred from unit tests.

## Public deployment still required

GitHub Pages only hosts static files; it cannot run this Worker. `server/wrangler.toml` still has a placeholder D1 database ID. Need the user's approved Cloudflare account/resources, Worker/Durable Object + D1 + R2 provisioned (or an explicitly approved archive removal), server-side AUTH_SECRET, approved origin configuration, and an HTTPS backend URL. No account/resources/paid plan or production secret was created by this change.

Set `VITE_MP_SERVER=https://your-approved-worker.example` at frontend build time to enable the menu, or use `?mp=https://your-approved-worker.example&room=ABCDE` for testing. Without an endpoint, the normal public menu remains “coming soon”; a localhost fallback is only for explicit debug testing and cannot connect friends over the Internet.

Before launch: browser/mobile QA, authoritative player health and full-world synchronization or explicitly scoped standalone co-op mode, deployment review, abuse/cost controls, room expiry and map collision validation. Current server is a prototype, not competitive anti-cheat.
