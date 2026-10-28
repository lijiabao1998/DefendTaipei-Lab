# 256m target / existing-source adapter status

## Implemented, inactive

`legacy.ts` maps a target 256m cell to overlapping *source ownership cells* using
the actual index size (`district/index.json.T`, `tiles/index.json.size`, both 200).
It keeps original `x_z` keys: District seeds use `dt21:` plus this key; road wreck,
barrier and save state also rely on it. Do not rename them to target `x,z` keys.

`LegacyLeases` can share one original source resource between adjacent target
cells, dispose it on the last release, dispose released asynchronous results,
retry failed loads, and reject new acquisitions after close. Close intentionally
does not invalidate live owners; rollback releases their leases. The caller must
handle `ready` rejections and must not use a resource after releasing its lease.
Loaders must clean their own partially-created resources on failure.

The independent suite uses all 224 district and 206 road keys in the repository
and validates complete source-cell coverage without new map data. No module
imports the adapter into main. Default gameplay and `?maptiles=1` are unchanged.

## Why this cannot yet replace the renderer

- `scripts/district.mjs` assigns buildings by center and road runs by source key;
  their geometry may cross cell edges. Overlapping ownership cells are **not** a
  clipped geometry query, nor proof that every visible footprint is covered.
- `District.build/load/unload` are private and own geometry, collision segments,
  onLoad/onUnload callbacks and deterministic interactive content. Existing
  District initialization also installs global ground/water/roads.
- `RoadTiles.build/load/unload` are private and maintain WALK/WOWN/TSEG registries,
  wrecks/barriers, per-source player changes and shared geometry rules.
- The current 256m mid/far builders do not replace these near-renderer contracts.
  Far terrain is flat unless given real height samples; no new elevation or
  skyline data was invented.

## Safe next implementation sequence

1. Extract an explicit source renderer interface from each existing class:
   prepare/build original source key, activate, deactivate, dispose. Preserve
   all original seed/save IDs, onLoad/onUnload and collision/walk cleanup.
   A resource must remain inactive until the new owner is ready, so failed
   prepare can leave the old source visible and collidable.
2. Give district and roads separate lease pools. Target cells own leases, not
   duplicate geometry. Maintain the existing source-neighbour road lookups for
   district frontage (3x3 source fetch), and aggregate LOD requests to the
   highest detail required by *any* owner. The current pool deliberately does
   not implement a misleading per-target LOD swap of shared source content.
3. Add explicit global-scene ownership and a single scheduler switch. Never run
   legacy and new source schedulers simultaneously. Retain legacy mode on
   initialization failure; rollback closes acquisition, releases every target,
   waits for pending loads/disposal, then restores legacy scheduling.
4. Test actual scene collisions, walk heights, loot/save IDs, edge crossings,
   rapid travel, reset/death and failure rollback before exposing the flag.

Browser verification is currently blocked by this assistant cloud runtime's
Chromium socket restriction. No live-map acceptance or image approval is claimed.
Story Act 2/3 and trigger rules remain absent; this adapter does not invent them.

## Renderer audit: concrete release blockers (2026-10-28)

The requested single-scheduler wiring is deliberately NOT activated, even behind
the query flag, because these existing paths are not transactional:

- `district.ts:load` fetches the 3x3 source neighbourhood, then `build` immediately
  calls the live `addSeg` callback for trees/buildings/room walls (around lines
  473, 610 and 627), before the completed Tile is inserted into `tiles`.
  `scene.add(g)` is at the end of build. If preparation throws after a collider
  was registered, `unload(key)` cannot find a complete Tile to undo it.
- `roads.ts:build` mutates module-level WALK/WOWN and TSEG while constructing
  objects (tree addSeg around 435–442), before adding the finished group near
  line 740. `unload` clears those registries only when a Tile exists in `tiles`.
  Merely catching a rejected promise is therefore not a safe rollback.
- `core/main.ts:onTileLoad` creates containers, soldiers and checkpoints directly
  in global arrays and scene. `onTileUnload` removes them and writes remaining
  container items to district saves. An experimental handoff must not duplicate
  these callbacks or serialize partial preparation as legitimate player progress.
- `roadT.update` combines source scheduling with signal-light timing; skipping
  it wholesale to obtain a single map scheduler would also freeze traffic phases.
  Timing must first be separated from source scheduling without changing behavior.
- District initialization owns non-tile ground/water and some colliders outside
  the per-tile unload path. Creating a second District is not a valid migration.

The minimum next refactor is to accumulate construction-time colliders, walk
records and interactive records into an owned preparation object, then publish
them atomically through the original callbacks. Add symmetrical undo that also
works after partial activation; avoid saving on failed preparation. Only after
that can a scheduler handoff drain pending source loads and switch back safely.

Required actual-renderer tests before enabling:

1. Snapshot collider count/identity, WALK heights, scene children, containers,
   soldiers and checkpoints before/after load→unload; assert exact restoration.
2. Inject failure after each preparation/activation stage; assert no orphan
   colliders, meshes, registry entries or changed storage.
3. Switch scheduler during pending load and at target-cell overlap; assert one
   source instance and one load/unload callback per source resource.
4. Cross source boundaries, loot, unload, reload and rollback; preserve identical
   container IDs and items, dead-enemy state and road barrier/wreck state.
5. Confirm traffic signals continue with either scheduler, and global ground,
   water and static colliders are neither recreated nor removed on rollback.

The current lease tests establish ownership contracts only, not these renderer
properties. Browser unavailability is a verification blocker, not evidence that
the new system is safe. No safety settings or existing map code were changed to
force progress past this boundary.

## Independent publication transaction (implemented, not integrated)

`transaction.ts` now supplies a synchronous publication journal. Construction is
inactive; `activate()` arms undo before each apply, permitting cleanup of partial
apply effects. Any activation error unwinds in reverse order. Cleanup continues
after an undo error, reports all causes in an ES2020-compatible TilePublicationError, and enters a terminal failed state
instead of claiming safe rollback. Repeated successful rollback is idempotent;
reuse and reentrant activation/rollback are rejected.

The caller still owns off-scene prepared GPU resources and must dispose them on
abandonment. The journal only publishes/unpublishes runtime records; it does not
own preparation, make asynchronous steps transactional, authorize persistent
writes or repair a broken undo function. All apply/undo operations must be
synchronous and undo must safely handle partially-applied operations. Failed
cleanup requires explicit recovery, not automatic activation of the old scheduler.

`tile-transaction.mjs` injects faults after each of six modeled registries (scene,
colliders, walks, containers, soldiers, checkpoints), checks inactive preparation,
reverse rollback, preexisting records, repeated rollback, cleanup faults and
reentrancy. These are executable model contracts, not actual renderer acceptance.
No old renderer, scheduler, storage path or query-flag wiring is replaced.

## Concrete attempted isolation: road tree colliders

The road-tree path at `roads.ts` around 435–442 invokes `d.addSeg(sg)` and then
appends `sg` to TSEG. The real callback (`core/main.ts:addSeg`, around 202) updates
three separate owners: global segs, Nav, and collision grid. Its counterpart
`removeSeg` (around 217) unconditionally decrements Nav before removing identities
from arrays. Nav.markSeg clamps counts to zero but does not track owner tokens.

`scripts/checks/nav-rollback-risk.mjs` uses the actual Nav class to reproduce a
fault before a candidate's nav increment. Blind pre-armed removeSeg undo removes
the already-existing collider's shared navigation occupancy. The script passes
only when it reproduces this BLOCKER; it does not claim rollback is repaired.

Minimum safe real integration requires stage-specific ownership receipts for
segs/Nav/grid (or a reversible Nav registration token), paired registration of
TSEG, and identity-aware undo that cannot decrement an unowned cell. This is not
provided by the current callbacks. The journal cannot infer which internal
side-effects occurred before a callback threw. Altering these central callbacks
affects every map, building and dynamic collider, so no blind adapter was added.
The old renderer remains untouched; isolated lifecycle tests cannot establish
navigation/interaction equivalence for that broader refactor without additional
actual-scene verification.

## Receipt-based Nav alternative (isolated implementation)

`nav-ownership.ts` now prepares sampled cell identities using the actual Nav.idx
and the same segment sampling formula as Nav.markSeg. Preparation does not change
occupancy; publication increments once per cell and marks its receipt active.
Release decrements only an active receipt, so a failed pre-publication apply does
not remove existing occupancy. Repeated release is a no-op. Full uint8 capacity
is rejected before any mutation, avoiding wraparound. Changed grids and obvious
zero-count ownership invalidation are rejected rather than silently repaired.

`nav-ownership.mjs` injects before-nav, after-nav and after-grid failures against
the actual Nav grid with pre-existing occupancy, verifies exact restoration,
checks overlapping receipts and sampling equivalence with legacy markSeg, and
checks capacity rejection. This resolves the demonstrated partial-publication
problem **inside the isolated adapter**, not in the running game.

No existing Nav/main/renderer API is changed. The token requires synchronous
publication and matched ownership for future mutations; arbitrary unmatched
legacy decrements cannot be distinguished from another owner's legitimate
release by a numeric counter alone. The old risk-reproduction test is retained
to demonstrate why main cannot yet simply switch to this adapter. Scene/grid
registries in the staged test are models; actual renderer integration is pending.

## Final real-RoadTiles integration assessment

Do not connect the isolated receipt as a drop-in `RoadDeps.addSeg` implementation:

- The real callback also owns main's `segs` array and collision `grid`. Updating
  Nav alone would leave collision queries disagreeing with pathfinding. Those
  registries are private to main, not supplied as reversible dependencies.
- Main creates Nav only after initial collision geometry exists (around 5995),
  then seeds it from every existing segment. Some original addSeg calls therefore
  legitimately run before Nav exists. A drop-in token requiring an existing Nav
  would alter boot behavior; delayed receipt migration must also account for that
  bulk seeding without double-incrementing.
- RoadTiles.reset/rebuild and pending loads share the same global WALK/WOWN/TSEG
  registries and existing unload path. Registering receipts only for new loads
  would mix token and legacy cleanup, allowing unmatched decrements. A safe
  experimental mode needs explicit per-resource cleanup strategy selected once
  at creation, plus pending generation invalidation and a drained handoff.
- Importing the actual roads renderer eagerly imports roadglyphs/paving/textures
  with document/canvas texture generation. A Node-only mocked canvas would not
  establish actual geometry/texture or walk/collision equivalence. The available
  Chromium runtime cannot start because of its socket restriction; that remains
  a concrete verification gap, not a reason to alter security or use the user's
  machine.

Minimal real refactor: expose a main-owned collider registry with staged receipts
covering segs/grid and Nav boot seeding, pass it as an optional experimental
RoadDeps dependency, record cleanup ownership per Tile, then test genuine
RoadTiles build/failure/reset/rebuild with real canvas/scene support before any
scheduler switch. This crosses main boot + RoadTiles async cleanup paths and
cannot currently be shown isolated by the passing receipt-only tests. Therefore
the experiment remains inactive; no real RoadTiles source or main boot path was
changed in this adapter work. All completed code and tests are preserved.
