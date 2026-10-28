# Story module: developer test interface

The data-driven story is not scheduled as gameplay. It currently contains three act 1 events and one act 4 all-clear ending; acts 2 and 3 have no event data. Existing game timeline events remain separate.

For manual development checks, open the game with `?storydebug=1`, start a game, then invoke an explicit ID in the browser console:

```js
window.__game.storyEvent('act1_siren_test')
```

Available IDs: `act1_drill_news`, `act1_panic_buying`, `act1_siren_test`, and `ending_all_clear`. The ending can be fired directly for testing and does not prove that a victory condition exists. Without the flag, the hook and story broadcast subscription are absent. The return value reports whether the event fired and whether its immediate save succeeded; saving disabled or a storage error is reported as unsaved. An unsaved event has already produced its effects and remains fired in the current session.

Progress is an optional `story` array in the existing game save. A loaded save without this field starts with empty story progress; a new game resets it. Saves made with the flag off retain the loaded field. Death uses the existing save deletion. Restoring progress does not replay effects. This flag-off preservation and the complete new-game/death lifecycle have not yet been verified end to end in a browser.

This interface does not implement story triggers, timing, quest progression, or a playable ending. The catalog has no such conditions; those require design decisions before gameplay integration. The existing `runNext` API follows catalog order and is not a gameplay scheduler.
