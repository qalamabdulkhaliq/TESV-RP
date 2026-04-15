# Frostfall Roleplay — Changelog

All notable changes to the game mode are documented here.
Format: `[version] — date — summary`, with full system-level detail below each entry.

---

## [0.4.0] — 2026-04-15 — Plan 4: Courier & Housing

### Added
- **`src/courier.ts`** — In-world courier notification system
  - `CourierNotification` interface: `{ id, type, fromPlayerId, toPlayerId, holdId, payload, createdAt, expiresAt, read }`
  - `NotificationType` union: `'propertyRequest' | 'prisonRequest' | 'bountyReport' | 'holdMessage'`
  - `DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000` — notifications expire after 7 IRL days
  - `createNotification(type, fromPlayerId, toPlayerId, holdId, payload, now?)` — pure factory; ID is `${now}-${fromPlayerId}-${type}`, unique per call
  - `filterExpired(notifications, now?)` — returns only unexpired entries; `null` expiresAt = never expires
  - `getUnread(notifications)` — filters unread entries
  - `sendNotification(mp, store, notification)` — persists to `mp.set(actorId, 'ff_courier', [...])` and delivers immediately via `sendCustomPacket` if recipient is online
  - `markRead(mp, store, playerId, notificationId)` — marks a single notification read, persists updated list
  - `getPendingNotifications(mp, store, playerId)` — returns unread, unexpired notifications for a player
  - `initCourier(mp, store, bus)` — on `playerJoined`: loads stored notifications, delivers all unread/unexpired via `courierDelivery` packet
  - `saveNotifications` prunes expired entries on every write — storage stays lean
- **`src/housing.ts`** — Player property ownership system
  - `PROPERTY_REGISTRY` — 16 purchasable properties across all 9 holds: homes and businesses
    - Whiterun: Breezehome (home), Drunken Huntsman (business), Belethor's General Goods (business)
    - Eastmarch: Hjerim (home), Candlehearth Hall (business)
    - Rift: Honeyside (home), Pawned Prawn (business)
    - Reach: Vlindrel Hall (home), Silver-Blood Inn (business)
    - Haafingar: Proudspire Manor (home), Winking Skeever (business)
    - Pale: Windpeak Inn (business)
    - Falkreath: Lakeview Manor (home), Dead Man's Drink (business)
    - Hjaalmarch: Highmoon Hall (business)
    - Winterhold: Frozen Hearth (business)
  - Runtime state stored in `Map<PropertyId, Property>`; persisted via `mp.set(0, 'ff_properties', [...])`
  - `getProperty(id)` — returns `Property | null`
  - `getPropertiesByHold(holdId)` — filters registry by hold
  - `getOwnedProperties(playerId)` — all properties owned by a given player
  - `isAvailable(propertyId)` — true when `ownerId === null && pendingRequestBy === null`
  - `requestProperty(mp, store, bus, playerId, propertyId, stewardId)` — marks `pendingRequestBy`, saves, dispatches `propertyRequested` event, sends courier notification to the Hold Steward; returns false if unknown, unavailable, or no player record
  - `approveProperty(mp, store, bus, propertyId, approverId)` — transfers `ownerId`, clears pending state, updates player's `properties[]` in store, sends `propertyApproved` packet to new owner, dispatches `propertyApproved` event; returns false if no pending request
  - `denyProperty(mp, propertyId)` — clears `pendingRequestBy` without assigning ownership; returns false if no pending request
  - `revokeProperty(mp, store, propertyId)` — strips ownership, removes property from previous owner's store entry; for Jarl use (unpaid taxes, abandonment)
  - `initHousing(mp, store, bus)` — loads persisted state on server start; on `playerJoined`: restores owned properties into player store, sends `propertyList` packet for available properties in player's current hold
  - `_resetProperties()` — test-only reset hook
- **`src/index.ts`** — Wired `initCourier` and `initHousing` into the boot sequence

### Fixed
- `tests/courier.test.ts`: Changed `const NOW = 1_000_000` → `const NOW = Date.now()`. The old value gave `expiresAt` in 1970, which was treated as expired by real-time `filterExpired` calls inside `saveNotifications`, causing `getPendingNotifications` to return an empty array.

### Tests
- `tests/courier.test.ts` — 9 tests: notification creation, unique IDs, expiry filtering, unread filtering, persist/deliver, markRead, getPendingNotifications
- `tests/housing.test.ts` — 14 tests: registry integrity (no duplicate IDs, all start unowned), read helpers, requestProperty (pending state, event dispatch, courier notification, reject unknown, reject double-request), approveProperty (ownership transfer, store update, event payload, reject re-approval), denyProperty, revokeProperty

---

## [0.3.0] — 2026-04-15 — Plan 3: Economy & Hold Resources

### Added
- **`src/economy.ts`** — Starter stipend system and gold transfer API
  - New characters receive 50 Septims per hour of playtime for the first 24 hours (1,200 total)
  - `shouldPayStipend(minutesOnline, stipendPaidHours)` — pure function, fully testable
  - `isStipendEligible(stipendPaidHours)` — guards against overpayment
  - `transferGold(mp, store, fromId, toId, amount)` — safe player-to-player transfer; returns false on insufficient funds, unknown players, or zero amount
  - Stipend hours persisted via `mp.set(actorId, 'ff_stipendHours', n)` — survives server restart
  - `initEconomy(mp, store, bus)` — wired into index.ts; syncs gold from inventory on join, runs 60s tick
- **`src/resources.ts`** — Hold-exclusive resource registry
  - 18 unique items distributed across all 9 holds
  - Each resource has: `baseId`, `name`, `holdId`, `source` description
  - `getHoldResources(holdId)` — returns all items exclusive to a hold
  - `getResourceHold(baseId)` — returns which hold produces an item, or null
  - `isHoldExclusive(baseId)` — quick boolean check
  - Covers: grain/snowberry (Whiterun), pelts/tusks (Eastmarch), salmon/mead (Rift), silver/Dwemer scrap (Reach), wine/cotton (Haafingar), iron/corundum (Pale), firewood/wolf pelt (Falkreath), swamp fungal/deathbell (Hjaalmarch), soul gems/frost salts (Winterhold)

### Tests
- `tests/economy.test.ts` — 14 tests: stipend eligibility, interval logic, transfer success/failure cases
- `tests/resources.test.ts` — 7 tests: registry integrity, hold coverage, no duplicate IDs, lookup helpers

---

## [0.2.0] — 2026-04-15 — Plan 2: Character Systems

### Added
- **`src/hunger.ts`** — Hunger system
  - Hunger range: 0 (starving) to 10 (full)
  - Drains 1 level every 30 IRL minutes of playtime
  - `calcNewHunger(current, delta)` — pure, clamped
  - `shouldDrainHunger(minutesOnline)` — pure, interval-based
  - `feedPlayer(mp, store, bus, playerId, levels)` — restores hunger; callable from food hooks and commands; returns new level or -1 if player unknown
  - `getHungerUpdateOwner()` — Papyrus client expression: +25 stamina regen at full hunger, -15 health regen when starving (≤2)
  - `initHunger(mp, store, bus)` — registers `ff_hunger` makeProperty, restores persisted value on join, runs 60s tick; returns cleanup fn for hot-reload
- **`src/drunkBar.ts`** — Drunk bar system (replaces thirst)
  - Drunk range: 0 (sober) to 10 (blackout)
  - `ALCOHOL_STRENGTHS` map — 6 Skyrim alcohol items with per-item strength values (Alto Wine=1, Mead=2, Black-Briar Reserve=3, etc.)
  - `calcNewDrunkLevel(current, delta)` — pure, clamped
  - `shouldSober(minutesOnline)` — sobers 1 level per 5 IRL minutes
  - `getAlcoholStrength(baseId)` — returns 0 for non-alcohol items
  - `drinkAlcohol(mp, store, bus, playerId, baseId)` — applies strength, persists, dispatches `drunkChanged`; no-ops non-alcohol items
  - `soberPlayer(mp, store, bus, playerId)` — instant sober (staff command, prison intake)
  - `getDrunkUpdateOwner()` — Papyrus client expression: weapon speed penalty at levels 5+ and 8+
  - `initDrunkBar(mp, store, bus)` — registers `ff_drunk` makeProperty, restores on join, runs 60s sober tick; returns cleanup fn

### Tests
- `tests/hunger.test.ts` — 14 tests
- `tests/drunkBar.test.ts` — 19 tests

---

## [0.1.0] — 2026-04-15 — Plan 1: Foundation

### Added
- **`src/types/index.ts`** — All shared types for the entire game mode
  - `PlayerId` (number), `ActorId` (number) — SkyMP userId vs actorFormId distinction
  - `HoldId` — union of all 9 Skyrim holds; `ALL_HOLDS` array constant
  - `FactionId` — union of 12 lore factions
  - `InventoryEntry`, `Inventory` — matches SkyMP's built-in `mp.get(actorId, 'inventory')` format exactly; sourced from skymp5-client/src/sync/inventory.ts
  - `GOLD_BASE_ID = 0xf` — Skyrim gold form ID
  - `PlayerState` — full player state shape: identity, factions, bounty, downed/captive state, hunger, drunk, septims, stipend tracking, online time
  - `Property`, `PropertyId`, `PropertyType` — housing/business ownership shape
  - `GameEventType`, `GameEvent<T>` — typed internal event system
  - Named payload interfaces: `PlayerJoinedPayload`, `PlayerDownedPayload`, `BountyChangedPayload`, `PropertyRequestedPayload`, `PropertyApprovedPayload`
- **`src/events.ts`** — Internal typed event bus
  - `EventBus` class: `on()`, `off()`, `dispatch()`
  - Systems communicate exclusively through the bus — never by calling each other directly
- **`src/store.ts`** — In-memory player state store
  - `PlayerStore` class: `registerPlayer()`, `deregisterPlayer()`, `get()`, `getAll()`, `update()`
  - `update()` shallow-merges patch and returns updated state; throws on unknown player
  - Default state: hunger 10, drunk 0, no factions, no properties, 0 septims
- **`src/skymp.ts`** — SkyMP runtime adapter
  - `ScampServer` interface typed directly from `skymp5-server/ts/scampNative.ts`
  - `Mp` interface extending `ScampServer` with `get()`, `set()`, `makeProperty()`, `makeEventSource()`, `findFormsByPropertyValue()`
  - `MakePropertyOptions` interface
  - `getInventory()`, `setInventory()`, `getGold()`, `setGold()`, `addGold()`, `removeGold()` — typed inventory helpers
  - `sendPacket()` — typed wrapper around `sendCustomPacket`
  - Single point of contact for all SkyMP runtime calls; everything else stays testable
- **`src/index.ts`** — Game mode entry point
  - Uses `declare const mp: Mp` global pattern (SkyMP sets `globalThis.mp = server` before loading)
  - Registers `connect`, `disconnect`, `customPacket` handlers
  - `connect`: registers player in store, dispatches `playerJoined`
  - `disconnect`: deregisters player, dispatches `playerLeft`
  - `customPacket`: parses JSON, logs type (systems add their own handlers)
  - Commented system imports ready to uncomment as plans ship
- **`gamemode/package.json`** — Node project; scripts: build, build:watch, test, test:watch
- **`gamemode/tsconfig.json`** — Target ES2020, strict mode, sourcemaps, declarations
- **`gamemode/jest.config.ts`** — ts-jest preset, node environment, `@/` path alias
- **`.gitignore`** — Excludes `gamemode/dist/` and `gamemode/node_modules/`

### Architecture decisions
- **Option B (system-per-file, flat)** — one TypeScript file per system, central `index.ts` wires via event bus
- **SkyMP adapter pattern** — `skymp.ts` is the only file that imports from SkyMP runtime; all other files are independently testable in Jest
- **`mp` global pattern** — gamemode runs as top-level script, not exported function; confirmed from SkyMP source
- **Persistence via `mp.set`** — custom state uses `ff_` prefix convention; `mp.makeProperty` syncs to client

### Tests
- `tests/types.test.ts` — 5 tests
- `tests/events.test.ts` — 6 tests
- `tests/store.test.ts` — 8 tests

### Reference
- Cloned `skyrim-multiplayer/skymp` to `skymp-reference/` for API verification
- `ScampServer` interface sourced from `skymp5-server/ts/scampNative.ts`
- `Inventory` type sourced from `skymp5-client/src/sync/inventory.ts`
- Server architecture confirmed from `skymp5-server/ts/index.ts`

---

*99 tests passing as of [0.4.0]. Compiles clean. dist/ ready for server config.*
