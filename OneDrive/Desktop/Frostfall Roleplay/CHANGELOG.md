# Frostfall Roleplay — Changelog

All notable changes to the game mode are documented here.
Format: `[version] — date — summary`, with full system-level detail below each entry.

---

## [0.7.0] — 2026-04-17 — Plan 7: Skill Caps & Training System

### Added
- **`src/skills.ts`** — Per-skill XP tracking with faction-rank-derived caps
  - `SkillId` type: `destruction | restoration | alteration | conjuration | illusion | smithing | enchanting | alchemy`
  - Default cap: 250 XP (~skill level 25) — functional but limited without faction investment
  - `FACTION_SKILL_CAP_BONUSES` — cap raise table: College rank 1/2/3 raises magic skills to 500/750/1000; Companions raises smithing; EEC raises smithing/enchanting/alchemy; Thieves Guild raises alchemy; Bards College raises enchanting
  - `getSkillCap(mp, store, playerId, skillId)` — pure derivation from current faction memberships, no extra stored state
  - `addSkillXp(mp, store, playerId, skillId, baseXp)` — applies active boost multiplier, enforces cap, returns actual XP added
  - `grantStudyBoost(mp, playerId, skillId, multiplier, onlineMs)` — grants a time-gated XP multiplier persisted via `ff_study_boosts`
  - Online-time boost drain: elapsed session time is consumed from `remainingOnlineMs` on every disconnect, so a player who logs off mid-boost resumes with the correct remainder

- **`src/training.ts`** — In-person training sessions
  - `startTraining(mp, store, bus, trainerId, skillId)` — trainer opens a session for a specific skill
  - `joinTraining(mp, store, bus, playerId, trainerId)` — location check (500 Skyrim units radius); fails if out of range, already attending, or no active session
  - `endTraining(mp, store, bus, trainerId)` — grants 2× XP multiplier lasting 24h online time to all attendees; trainer gets no boost; dispatches `trainingEnded`
  - Sessions are in-memory only (intentional — sessions don't survive server restarts)

### Architecture notes
- Skill caps are derived on read from faction memberships — adding a new faction tier requires only a `FACTION_SKILL_CAP_BONUSES` entry, no schema change
- Study boosts use online-time accounting, not wall-clock, so logging off doesn't consume boost time
- XP grant hooks (forge activation → smithing XP, spell cast → magic school XP) are stubbed pending SkyMP event surface investigation

### Tests
- 29 tests in `skills.test.ts`, 18 tests in `training.test.ts` — 309 total passing

---

## [0.6.0] — 2026-04-15 — Plan 6: Faction BBB System & College Study Mechanic

### Added
- **`src/factions.ts`** — Faction membership registry with BBB document system
  - `FactionDocument` interface: `{ factionId, benefits, burdens, bylaws, updatedAt, updatedBy }` — staff-authored governance document per faction
  - `FactionMembership` interface: `{ factionId, rank, joinedAt }` — per-player, rank is a numeric ladder (0 = initiate)
  - `getFactionDocument(mp, factionId)` — returns BBB document or null if unwritten
  - `setFactionDocument(mp, doc)` — staff-only update; persists to `mp.set(0, 'ff_faction_docs', {...})` (world-keyed so any staff member can update without server restart)
  - `joinFaction(mp, store, bus, playerId, factionId, rank?)` — adds membership, syncs `store.factions[]`, persists `FactionMembership[]` to `mp.set(actorId, 'ff_memberships', [...])`, dispatches `factionJoined`, sends packet; returns false for unknown player or duplicate join
  - `leaveFaction(mp, store, bus, playerId, factionId)` — removes membership, syncs store, dispatches `factionLeft`; returns false if not a member
  - `isFactionMember(mp, store, playerId, factionId)` — boolean
  - `getPlayerFactionRank(mp, store, playerId, factionId)` — returns rank or null if not a member
  - `getPlayerMemberships(mp, store, playerId)` — full membership records with rank and join timestamps
  - `initFactions(mp, store, bus)` — on `playerJoined`: reloads persisted memberships into `store.factions[]`, sends `factionSync` packet
  - Architecture note: BBB docs are world-keyed so staff can author/update documents live without touching server config. Memberships are per-player actorId so they survive character swaps cleanly.

- **`src/college.ts`** — College of Winterhold study progression
  - `CollegeRank` type: `'novice' | 'apprentice' | 'adept' | 'expert' | 'master'`
  - `XP_THRESHOLDS`: novice=0, apprentice=100, adept=300, expert=600, master=1000
  - `TOME_REGISTRY` — 10 Skyrim spell tomes mapped to study tier (form IDs); expandable
  - `TOME_XP` — XP per tome tier: novice=15, apprentice=30, adept=50, expert=75, master=100
  - `LECTURE_ATTENDEE_XP = 50`, `LECTURE_TEACHER_XP = 25`, `LECTURE_BOOST_MS = 24h`
  - `getCollegeRank(xp)` — pure function; highest threshold not exceeding xp
  - `getTomeRank(tomeBaseId)` — returns tier or null for unregistered tomes
  - `getStudyXp(mp, store, playerId)` — reads `ff_study_xp` from mp
  - `getCollegeRankForPlayer(mp, store, playerId)` — convenience wrapper
  - `studyTome(mp, store, bus, playerId, tomeBaseId)` — solo study; adds `TOME_XP[tier]` to `ff_study_xp`; returns false for unknown player or unregistered tome
  - `LectureSession` interface: `{ lecturerId, startedAt, attendees: PlayerId[] }`
  - `startLecture(mp, store, bus, lecturerId)` — creates in-memory session; dispatches `lectureStarted`; returns false if unknown or already lecturing
  - `joinLecture(mp, store, bus, playerId, lecturerId)` — adds attendee; returns false if no active lecture, player is the lecturer, or already attending
  - `endLecture(mp, store, bus, lecturerId, now?)` — awards `LECTURE_ATTENDEE_XP` + sets `ff_lecture_boost` (24h timestamp) for each attendee; awards `LECTURE_TEACHER_XP` to lecturer (no boost — they're already high rank); dispatches `lectureEnded` with attendeeCount; clears session
  - `hasLectureBoost(mp, store, playerId, now?)` — true while `ff_lecture_boost > now`
  - `getLectureBoostRemainingMs(mp, store, playerId, now?)` — ms remaining; 0 if none/expired
  - `initCollege(mp, store, bus)` — registers `ff_study_xp` and `ff_lecture_boost` makeProperties; `ff_lecture_boost` has a `updateOwner` expression that returns `{ magickaRegenMult: 1.15, boostActive: 1 }` while boost is active; on `playerJoined`: sends XP/rank sync packet and active boost notification if applicable
  - Architecture note: Active lecture sessions are intentionally in-memory only — sessions don't survive a server restart, which is correct behaviour (a lecturer must re-start their session). Study XP and boost timestamps persist via `mp.set` per the bounty/prison pattern.

- **`src/types/index.ts`** — Added `CollegeRank` type; added `factionJoined`, `factionLeft`, `lectureStarted`, `lectureEnded` to `GameEventType`

- **`src/index.ts`** — Wired `initFactions` and `initCollege` into boot sequence

### Tests
- `tests/factions.test.ts` — 28 tests: getFactionDocument (null/found), setFactionDocument (persists, overwrites, cross-faction isolation), joinFaction (store sync, persistence, event, default rank, explicit rank, unknown guard, duplicate guard, multi-faction), leaveFaction (removes, event, not-member guard, cross-faction isolation), isFactionMember (false/true/false lifecycle), getPlayerFactionRank (null/value/null lifecycle), getPlayerMemberships (empty, shape, multi, unknown)
- `tests/college.test.ts` — 42 tests: getCollegeRank (all thresholds, above max), getTomeRank (novice, master, unknown), getStudyXp (fresh, unknown, post-study), studyTome (unknown/unregistered guards, novice XP, adept XP, accumulation, rank advancement), startLecture (unknown guard, session creation, event, duplicate guard, empty attendees), joinLecture (adds attendee, no-lecture guard, self-join guard, duplicate guard, multi-attendee), endLecture (no-lecture guard, removes session, attendee XP, teacher XP, boost set, no teacher boost, event attendeeCount), hasLectureBoost (false/true/expired), getLectureBoostRemainingMs (zero/positive/expired)

---

## [0.5.0] — 2026-04-15 — Plan 5: Bounty, KOID, Combat, NVFL, Captivity, Prison

### Added
- **`src/bounty.ts`** — Per-hold bounty system
  - `BountyRecord` interface: `{ holdId, amount, updatedAt }`
  - `GUARD_KOID_THRESHOLD = 1000` — bounty that makes a player KOID-eligible by Hold Guards
  - `getBounty(mp, store, playerId, holdId)` — returns bounty in a hold, 0 if none
  - `getAllBounties(mp, store, playerId)` — all holds with non-zero bounty
  - `isGuardKoid(mp, store, playerId, holdId)` — true when bounty ≥ threshold
  - `addBounty(mp, store, bus, playerId, holdId, amount)` — accumulates bounty, persists, dispatches `bountyChanged`, sends `bountyUpdate` packet; returns false for zero/negative/unknown
  - `clearBounty(mp, store, bus, playerId, holdId)` — zeros a hold's bounty (paid fine, Jarl's pardon); returns false if no bounty to clear
  - `initBounty(mp, store, bus)` — on `playerJoined`: loads persisted records, syncs per-hold map to player store, sends `bountySync` packet if records exist
  - Persists via `mp.set(actorId, 'ff_bounty', BountyRecord[])` per player
  - Store field `PlayerState.bounty` updated as `Partial<Record<HoldId, number>>` (per-hold map)

- **`src/koid.ts`** — Kill-on-ID faction permission registry
  - `KoidPair` interface: `{ a, b, description }` where a/b are `FactionId | 'guard' | 'highBounty'`
  - `KOID_PAIRS` — 3 canonical KOID relationships:
    - Thalmor ↔ Stormcloak Underground
    - Imperial Garrison ↔ Stormcloak Underground
    - Hold Guards ↔ high-bounty players
  - `hasKoidPermission(factionA, factionB)` — symmetric check; returns true if either direction matches
  - `getKoidPair(factionA, factionB)` — returns matching `KoidPair` or null
  - `getKoidTargeters(faction)` — all identifiers that have KOID permission against a given faction
  - Pure functions — no runtime dependencies, no state

- **`src/combat.ts`** — Downed state management
  - `LOOT_CAP_GOLD = 500` — maximum gold a victor may loot (client-enforced)
  - `LOOT_CAP_ITEMS = 3` — maximum items a victor may loot (client-enforced)
  - `isDowned(store, playerId)` — boolean; reads `PlayerState.isDown`
  - `downPlayer(mp, store, bus, victimId, attackerId)` — sets `isDown=true`, `downedAt=now`; sends `playerDowned` packet with loot caps to both parties; dispatches `playerDowned` event; returns false if unknown or already downed
  - `risePlayer(mp, store, bus, playerId)` — clears `isDown`; preserves `downedAt` so NVFL window persists; sends `playerRisen` packet; dispatches `playerRisen` event; returns false if not downed
  - No `init` function — invoked directly by game event handlers and staff commands

- **`src/nvfl.ts`** — No Value For Life restriction tracking
  - `NVFL_WINDOW_MS = 24 * 60 * 60 * 1000` — 24 IRL hours from time of downing
  - `isNvflRestricted(store, playerId, now?)` — pure; true when `downedAt` is within the window; does not use mp or bus — reads only from store
  - `getNvflRemainingMs(store, playerId, now?)` — ms remaining in restriction; 0 if not restricted
  - `clearNvfl(store, playerId)` — sets `downedAt = null`; used for Jarl pardons and in-game day resets
  - Entirely pure — no persistence calls; `downedAt` in PlayerState is the single source of truth

- **`src/captivity.ts`** — Cuffs / binding system with 24-hour hard cap
  - `MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000`
  - `isCaptive(store, playerId)` — reads `PlayerState.isCaptive`
  - `getCaptivityRemainingMs(store, playerId, now?)` — ms until auto-release; 0 if not captive
  - `capturePlayer(mp, store, bus, captiveId, captorId)` — sets `isCaptive=true`, `captiveAt=now`; sends `playerCaptured` packet with timer info to both parties; dispatches `playerCaptured` event; returns false if unknown or already captive
  - `releasePlayer(mp, store, bus, captiveId)` — clears `isCaptive` and `captiveAt`; sends `playerReleased` packet; dispatches `playerReleased` event; returns false if not captive
  - `checkExpiredCaptivity(mp, store, bus, now?)` — iterates all online players; auto-releases any whose `captiveAt + MAX_CAPTIVITY_MS ≤ now`; returns array of released player IDs; called on the 60s server tick

- **`src/prison.ts`** — Arrest → Jarl judicial queue
  - `SentenceType` union: `'fine' | 'release' | 'banish'`
  - `PrisonQueueEntry` interface: `{ playerId, holdId, arrestedBy, queuedAt }`
  - `SentenceDetails` interface: `{ type, fineAmount?, note? }`
  - `getQueue(mp, holdId?)` — returns full queue or filtered by hold
  - `isQueued(mp, playerId)` — boolean
  - `queueForSentencing(mp, store, bus, playerId, holdId, arrestingOfficerId, notifyId)` — adds to queue, persists, sends courier `prisonRequest` notification to Jarl, dispatches `playerArrested` event, sends `playerArrested` packet; returns false if unknown or already queued
  - `sentencePlayer(mp, store, bus, playerId, jarlId, sentence)` — applies effects, removes from queue, dispatches `playerSentenced`:
    - `'fine'`: deducts `min(fineAmount, player.septims)` from gold; clears Hold bounty
    - `'release'`: clears Hold bounty
    - `'banish'`: clears Hold bounty; sends banishment packet for client-side teleport
  - Queue persisted via `mp.set(0, 'ff_prison_queue', PrisonQueueEntry[])`

- **`src/types/index.ts`** — Added `'playerRisen'` and `'playerSentenced'` to `GameEventType`

- **`src/index.ts`** — Wired `initBounty` into boot sequence

### Tests
- `tests/bounty.test.ts` — 17 tests: getBounty, getAllBounties, addBounty (accumulation, event, store sync, guards), clearBounty (clears, returns false when none, doesn't affect other holds, store sync), isGuardKoid (threshold logic, hold isolation)
- `tests/koid.test.ts` — 12 tests: registry integrity, hasKoidPermission (canonical pairs, symmetry, unrelated factions, self), getKoidPair (direct, reverse, null), getKoidTargeters
- `tests/combat.test.ts` — 13 tests: loot cap constants, isDowned, downPlayer (state, timestamp, event, packets, unknown, double-down), risePlayer (clears state, preserves downedAt, event, not-downed guard, unknown)
- `tests/nvfl.test.ts` — 9 tests: window constant, isNvflRestricted (fresh, unknown, immediate, within window, expired), getNvflRemainingMs (zero, positive, expired), clearNvfl
- `tests/captivity.test.ts` — 14 tests: cap constant, isCaptive, capturePlayer (state, timestamp, event, packets, unknown, double-capture), releasePlayer (clears, event, not-captive guard), getCaptivityRemainingMs, checkExpiredCaptivity (releases expired, preserves active, returns IDs)
- `tests/prison.test.ts` — 15 tests: getQueue, isQueued, queueForSentencing (adds, event, courier notify, unknown guard, double-queue guard), sentencePlayer — release (removes, event, not-queued guard), fine (deducts gold, caps at balance, removes), banish (removes, packet)

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

*262 tests passing as of [0.6.0]. Compiles clean. dist/ ready for server config.*
