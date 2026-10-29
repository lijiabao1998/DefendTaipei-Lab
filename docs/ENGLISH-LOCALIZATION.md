# English localization

Base: `eafd8c32a09108844edf849792ce52156436488d` (canonical repository `lijiabao1998/defendtaipei`).

## Using the language option

Choose **English** or **繁體中文** on the title screen or in Settings. Traditional Chinese remains the default. The preference is retained in `dt.settings`; changing language reloads the page so initialized story/item labels use one consistent language. Active single-player progress is saved and resumed. A failed save/preference write cancels the reload. Switching during the prologue, multiplayer, or a save-disabled transition is deferred to avoid discarding transient state.

Translated surfaces include title/help/settings, HUD and interaction prompts, inventory, roles, survivor reports, story events and cinematics, broadcasts, map interface, vehicle/armor/FPV controls, and experimental network menu/status text. English broadcasts select an available English speech-synthesis voice. Browser voice availability is not guaranteed.

Save IDs, item attributes, story keys, container keys, street geometry and inventory/RNG behavior are unchanged. Legacy survivor identities are localized for display by stable ID without rewriting saved data. Original street signs, world textures, geographic source names and historical saved radio/event text retain their original language. Server-originated experimental multiplayer messages may also retain their original text; this change does not implement multiplayer.

## Verification and release boundary

Local checks: TypeScript, `node scripts/checks/i18n.mjs`, `node scripts/checks/modules.mjs`, production build, formatting and diff checks. The module suite includes an existing navigation partial-undo blocker reproduction; localization does not fix or claim to fix it.

Browser visual verification is **blocked**, not passed: Chrome exits before opening a page with `socket() failed: Operation not permitted (1)` in process singleton initialization. No screenshots have been accepted and mobile rendering is not yet visually verified.

These verification notes describe local checks before submission. CI, merge, deployment and visual acceptance must be verified separately; passing the local checks alone does not establish any of them. Existing work in the original checkout remains separate and untouched.
