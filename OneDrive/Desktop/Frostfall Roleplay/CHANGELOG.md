# Frostfall Roleplay — Changelog

All notable changes to the game mode are documented here.
Format: `[version] — date — summary`, with full system-level detail below each entry.

---

## [0.9.9] — 2026-04-18 — Fix: correct SkyMP event API (property assignment, not mp.on)

### Fixed
- **`gamemode/combat.js`** — `mp.on('onDeath', ...)` replaced with `mp.onDeath = (actorId, killerId) => {...}` (verified against ScampServerListener.cpp and test_isdead.js). Handler returns `false` to block auto-respawn, keeping the actor dead in downed state. Returns `true` for NPC deaths (allow normal server-managed respawn).
- **`gamemode/combat.js`** — Removed `mp.kill()` and `mp.respawn()` calls (neither method exists on the `mp` object per ScampServer.cpp instance method list). Execution now uses `mp.set(actorId, 'isDead', false)` to revive the downed actor, then teleports via `mp.set(actorId, 'locationalData', {...})` after 500ms. Bleed-out follows the same pattern.
- **`gamemode/combat.js`** — `mp.set(actorId, 'pos', ...)` replaced with `mp.set(actorId, 'locationalData', ...)` — PosBinding.cpp throws if `pos` is set directly. `HOLD_TEMPLE_SPAWNS` entries updated to `{ pos: [...], cellOrWorldDesc: null, label }` format to match locationalData schema.
- **`gamemode/combat.js`** — Removed `_pendingExecution` and `_executionSpawns` — no longer needed since downed actors are already dead and can be revived+teleported directly without re-triggering `onDeath`.
- **`gamemode/combat.js`** — `revivePlayer` now calls `mp.set(victim.actorId, 'isDead', false)` to actually revive the actor (previously only updated store and sent packets).
- **`gamemode/magic.js`** — `mp.on('OnSpellCast', ...)` replaced with `mp['onPapyrusEvent:OnSpellCast'] = (casterActorId, spellArg) => {...}` — Papyrus events use property assignment per ScampServerListener.cpp. Spell formId extracted via `mp.getIdFromDesc(spellArg.desc)` since additional Papyrus args arrive as `{ type, desc }` form descriptors (verified against test_onPapyrusEvent_OnItemAdded.js).
- **`gamemode/magic.js`** — `mp.on('onHit', ...)` removed entirely — `HitEvent.cpp` does not exist in `gamemode_events/`; there is no `mp.onHit` gamemode property. Destruction-on-hit XP (`XP_ON_HIT`) dropped. If needed later, requires `onPapyrusEvent:OnHit` with a Papyrus script attached to actors.
- **`gamemode/magic.js`** — Removed `XP_ON_HIT` constant.

### Notes
- `HOLD_TEMPLE_SPAWNS.cellOrWorldDesc` values are still `null` placeholders — `_teleportToSpawn` skips the locationalData call if null, so bleed-out/execution silently revives in place until real coordinates are filled in.
- `onPapyrusEvent:OnSpellCast` only fires if the SkyMP client forwards spell cast events to the server — depends on Skyrim Platform hooks configured on the client side.

---

## [0.9.8] — 2026-04-18 — magic.js: spell school XP, Detect Life, /skill-dice broadcast

### Added
- **`gamemode/magic.js`** — Magic system module:
  - `SPELL_SCHOOL` map: ~75 base-game spell formIds → school (destruction/restoration/alteration/illusion/conjuration). Verify formIds against CK if discrepancies appear. Custom/modded spells fall through without XP.
  - `OnSpellCast` hook: awards `XP_ON_CAST (3)` to the detected school. Detect Life/Detect Dead (Alteration) also trigger `_handleDetectLife` — finds all online players within 3000 game units of the caster and sends `detectLifeResult { nearby: [{ name }] }` packet.
  - `onHit` hook: awards `XP_ON_HIT (8)` to Destruction when `source` (spell formId) is a known Destruction spell. Melee hits pass `source = 0` and are ignored.
  - `handleSkillDice(mp, store, bus, userId, args)` — handles `/skill-dice` commands:
    - `init` → sends `skillDiceInit { skills: { [school]: { level } }, weapons: [], armor: null }` packet. Weapons/armor omitted — client reads equipped state from game engine.
    - `magic [school] [value] [buff]` → hold-broadcasts `★ Name — school: value (+buff)` and awards `XP_ON_ROLL (5)` to that school.
    - `weapon/defence/initiative [type] [value] [buff]` → hold-broadcasts the roll result (no XP — combat schools handled separately).
    - `heal/self-attack [hp]` → hold-broadcasts HP change narration.
    - `wolf/vampus on|off` → hold-broadcasts form shift.
- **`gamemode/index.js`** — `magic` required, `magic.init(mp, store, bus)` called, passed to `registerAll`.
- **`gamemode/commands.js`** — `/skill-dice` handler routes to `magic.handleSkillDice`.

### Design notes
- Illusion, Alteration behavior effects (Calm, Fear, Paralysis, etc.) are NPC-only per server rules. XP still awarded on cast — the spell is cast, the effect doesn't bind players.
- Telekinesis is cosmetic RP — specifically useful for mage thief characters. Earns Alteration XP on cast.
- Detect Life shows online players as living actors within range. Detect Dead also triggers it (players are not undead — they simply appear as living).
- Conjuration against Man, Mer, or Beast-folk is a server law violation. Summons follow vanilla AI and will attack player targets if directed; the caster is responsible. Bound weapons are unrestricted.
- `OnSpellCast` signature assumed `(casterActorId, spellFormId)` — verify against SkyMP scampNative.
- `onHit` uses only the first three args; remaining four are unused in this handler.

---

## [0.9.7] — 2026-04-18 — Fix loot cap: gold is an item slot (3 total, not 3+gold)

### Fixed
- **`gamemode/combat.js`** — `openLootSession` now includes gold as an entry in the `items` array sent to the client. Gold takes one of the 3 available slots; there is no separate gold transfer. `completeLootSession` no longer accepts a `takeGold` boolean — gold is selected like any other item in `selectedItems`. Gold count is still capped at `min(onBodyGold, 500)` — if the victim has 200g the client sees 200, if 800g it sees 500.

---

## [0.9.6] — 2026-04-18 — Loot sessions, execution respawn (temple/home chain), communal temple spawns

### Changed
- **`gamemode/combat.js`** — `lootPlayer` replaced with a two-phase loot session:
  - `openLootSession(mp, store, bus, inv, looterPlayerId, victimPlayerId)` — builds available loot (gold capped at `min(actual gold, 500)`, all non-gold items), creates a 60-second session, sends `openLootMenu` packet to the looter with `{ sessionId, victimName, gold, items, maxItems: 3 }`. Client renders selection UI.
  - `completeLootSession(mp, store, bus, inv, looterPlayerId, packet)` — validates `lootSelection` packet: checks session exists, belongs to this looter, not expired; validates `selectedItems` against the session's item list; enforces 3-item cap; calls `inv.transferItem` for gold and each selected item.
  - Session map `_lootSessions` keyed by `sessionId`; sessions expire after 60s (checked on completion).
- **`gamemode/combat.js`** — `executePlayer` now resolves a respawn point before killing:
  - Priority: (1) `player.templeHoldId` → that hold's communal temple; (2) any owned `home` property; (3) `player.holdId` → hold's communal temple; (4) absolute fallback: Whiterun's Temple of Kynareth.
  - Spawn stored in `_executionSpawns` map before kill; consumed in `onDeath` handler (500ms delay → `mp.respawn` + `_teleportToSpawn`).
  - `playerExecuted` packet now includes `spawnLabel` so client can display "You will wake at [Temple of Mara]".
  - Signature changed: `(mp, store, bus, prison, housing, executorId, victimId)`.
  - `HOLD_TEMPLE_SPAWNS` table defined for all 9 holds — coordinates are placeholder `{ x:0, y:0, z:0, cell:null }` pending real-world fill.
- **`gamemode/commands.js`**:
  - `/loot` now calls `combat.openLootSession` instead of the old atomic transfer.
  - `/execute` now passes `housing` to `combat.executePlayer`.
  - `customPacket` handler extended: `lootSelection` packets routed to `combat.completeLootSession`; `chatMessage` path unchanged.
- **`gamemode/prison.js`** — `_appendPrior` renamed `appendPrior` and exported (needed by `executePlayer`).

### Architecture notes
- Loot gold display logic: server sends the actual capped amount (`min(onBodyGold, 500)`). If the victim has 200g, looter sees 200g. If 800g, looter sees 500g. `takeGold` is a bool — looter takes all shown gold or none.
- Temple affiliation (`templeHoldId`) is not yet settable in-game; a future `/temple pledge` command will write it to the player store.
- `HOLD_TEMPLE_SPAWNS` coordinates need to be filled with verified SkyMP world positions before execution respawn works correctly.

---

## [0.9.5] — 2026-04-18 — Downed stage: onDeath intercept, bleed-out timer, /revive /execute /loot

### Added
- **`gamemode/combat.js`** — Full downed-stage implementation:
  - `onDeath` hook in `init`: when SkyMP fires death for a player actor, immediately calls `mp.respawn(actorId)` (verify binding name) + `downPlayer`. NPC deaths and sanctioned executions are ignored.
  - `BLEED_OUT_MS = 180 000` ms bleed-out timer — starts in `downPlayer`, auto-clears `isDown` and fires `playerBledOut` bus event if nobody acts.
  - `revivePlayer(mp, store, bus, reviverId, victimId)` — clears bleed timer, calls `risePlayer`, sends `playerRevived` packet to both parties.
  - `executePlayer(mp, store, bus, prison, executorId, victimId)` — clears timer, logs `type: 'execution'` prior via `prison.appendPrior`, marks actor in `_pendingExecution` set to skip re-intercept, calls `mp.kill` (verify binding).
  - `lootPlayer(mp, store, bus, inv, looterPlayerId, victimPlayerId)` — transfers up to `LOOT_CAP_GOLD` (500) gold and `LOOT_CAP_ITEMS` (3) non-gold items from downed victim to looter via `inv.transferItem`.
  - `risePlayer` now also calls `_clearBleedTimer`.
  - `downPlayer` guards against double-down (`if victim.isDown return`).
  - Exports: `revivePlayer`, `executePlayer`, `lootPlayer`, `BLEED_OUT_MS`.
- **`gamemode/commands.js`** — Three new player commands:
  - `/revive [name]` — any player; calls `combat.revivePlayer`; requires target to be downed.
  - `/execute [name]` — any player; calls `combat.executePlayer`; requires target to be downed.
  - `/loot [name]` — any player; calls `combat.lootPlayer`; replies with gold and item count taken.
  - `inventory` destructured from systems as `inv` for loot command.
- **`gamemode/prison.js`** — `_appendPrior` renamed to `appendPrior` and exported; all internal call sites updated.
- **`gamemode/index.js`** — `inventory` required and passed to `registerAll`.

### Architecture notes
- The `_pendingExecution` set breaks the onDeath re-intercept loop: `executePlayer` adds the actor before calling `mp.kill`; `onDeath` removes it and returns, allowing real death.
- `mp.respawn` and `mp.kill` binding names need verification against SkyMP scampNative — wrapped in `typeof` guards so a wrong name doesn't crash the server.
- Bleed-out (3 min, no action) is a soft death: `isDown` clears, `downedAt` preserved for NVFL window. Execute is a hard death: prior record written, engine kills the actor.

---

## [0.9.4] — 2026-04-18 — roleplay.js; /setdescription, /examine, /racemenu; prison priors

### Added
- **`gamemode/roleplay.js`** — RP identity module:
  - `setDescription(mp, actorId, text)` — persists `ff_description` (max 400 chars); sets `ff_characterReady = true` on first call
  - `getDescription(mp, actorId)` → string or null
  - `getRaceName(mp, actorId)` → string; reads `appearance.raceId` and maps to display name via static table of all 10 playable races
  - `openRaceMenu(mp, actorId)` → bool; calls `mp.setRaceMenuOpen(actorId, true)` only if `!ff_characterReady`
  - `resetRaceMenu(mp, actorId)` — staff-only; clears `ff_characterReady` and re-opens race menu
  - `examinePlayer(mp, store, examiningId, targetId, { bounty, prison })` → packet; returns name, race, description; appends `warrant` block if examiner is `isLeader`/`isStaff` and target has an active bounty or prior record in the examiner's hold only (per-hold, vanilla scoping)
- **`gamemode/commands.js`** — three new commands:
  - `/setdescription [text]` — any player; sets character description
  - `/examine [name]` — any player; sends `examine` packet to client; leaders/staff see warrant block scoped to their hold
  - `/racemenu` — fresh characters only; `/racemenu reset [name]` is staff-only
- **`gamemode/prison.js`** — `getPriors(mp, actorId, holdId)` — returns prior sentence records filtered by hold. `sentencePlayer` now appends to `ff_priors` on the target's actor before removing the queue entry. Prior record shape: `{ holdId, type, fineAmount, sentencedAt }`.

### Architecture notes
- `ff_characterReady` is set permanently on first `/setdescription` — `/racemenu` is locked out after that without a staff reset
- Warrant display is scoped to `examiner.holdId` — a Whiterun leader sees only Whiterun bounty and Whiterun priors, not other holds
- Race lookup is a static map; no runtime Skyrim API call needed

---

## [0.9.3] — 2026-04-18 — Remove gold abstraction; add transferItem and getAll

### Modified
- **`gamemode/inventory.js`** — Removed `getGold`/`setGold`. Gold is `baseId 0x0000000F`, not a special case — confirmed against SkyMP's `MpActor.cpp` which has no gold API, only an engine-level block on dropping it. Added `transferItem(mp, fromActorId, toActorId, baseId, count)` → bool (atomic: removeItem then addItem, returns false if source has insufficient count). Added `getAll(mp, actorId)` → entries array for inspection, loot preview, confiscation.
- **`gamemode/economy.js`** — `transferGold` now calls `inv.transferItem` with `GOLD_BASE_ID` then reads back the new count from inv to sync the store cache. Stipend tick uses `inv.addItem` + `inv.getItemCount` readback. `onConnect` syncs `septims` via `inv.getItemCount`. No raw `mp.get/set(actorId, 'inv', ...)` calls remain.

### Architecture notes
- Gold moves through the same path as any other item. The store's `septims` field is a session cache only — always written from an inv readback, never calculated independently.
- `transferItem` is the primitive for all server-mediated item movement: loot from downed players, confiscation on arrest, prison intake. Player-to-player trade and shop stock use SkyMP's native container sync.

---

## [0.9.2] — 2026-04-18 — inventory.js shared utility; migrate economy.js

### Added
- **`gamemode/inventory.js`** — Shared inventory read/write utility. All item access goes through here — no system touches `mp.get(actorId, 'inv')` raw.
  - `getItemCount(mp, actorId, baseId)` → number
  - `hasItem(mp, actorId, baseId, count)` → bool
  - `addItem(mp, actorId, baseId, count)` → void
  - `removeItem(mp, actorId, baseId, count)` → bool (false if insufficient)
  - `getGold(mp, actorId)` → number
  - `setGold(mp, actorId, amount)` → void
  - Uses `'inv'` key (not `'inventory'`) matching Frost's gamemode convention

### Modified
- **`gamemode/economy.js`** — Removed private `_getGoldFromInventory` / `_setGoldInInventory` helpers and all raw `mp.get/set(actorId, 'inv', ...)` calls. Replaced with `inv.getGold` / `inv.setGold` from the shared module.

---

## [0.9.1] — 2026-04-18 — Wire treasury; add /treasury and /role set

### Added
- **`gamemode/index.js`** — `treasury` is now required, initialized (`treasury.init(mp, store, bus)`), and passed into `commands.registerAll`. Prior to this it existed as a module but was never started.
- **`gamemode/commands.js`** — `/treasury` command (leader permission):
  - `/treasury` — lists all nine hold balances
  - `/treasury balance [holdId]` — shows a single hold's balance
  - `/treasury withdraw [holdId] [amount]` — withdraws from a hold; leaders are restricted to their own hold (`player.holdId === holdId`); staff bypass this check
  - `/treasury deposit [holdId] [amount]` — staff-only manual deposit (admin correction tool)
- **`gamemode/commands.js`** — `/role set [name] player|leader|staff` (staff permission):
  - Updates `isStaff` and `isLeader` flags on the target's store entry
  - Notifies both the staff member and the target player
  - Previously there was no in-game way to assign roles; flags were hardcoded `false` at connect

### Architecture notes
- Hold restriction on `/treasury withdraw` is enforced server-side: a Whiterun leader cannot drain Riften's treasury. Staff role bypasses this for admin corrections.
- `isLeader` is set `true` for both `leader` and `staff` roles so permission checks remain a simple level comparison.

---

## [0.9.0] — 2026-04-17 — Plan 9: Staff & Governance Commands

### Added
- **`src/treasury.ts`** — Hold treasury ledger: `getTreasuryBalance`, `getAllTreasuryBalances`, `depositToTreasury`, `withdrawFromTreasury`. Keyed to actor 0 (`ff_treasury`) — same pattern as faction docs. Dispatches `treasuryChanged` on every mutation. Foundation for Plans 10–15 (tax income, property escrow, UBI).
- **`src/staffCommands.ts`** — Registers all leader and staff commands via `initStaffCommands`:
  - `/arrest [name] [holdId]` — queues player for Jarl sentencing (leader)
  - `/sentence [name] [fine|release|banish] [amount?]` — applies sentence from queue (leader)
  - `/down [name]` / `/rise [name]` — force downed/risen state (leader)
  - `/role set [name] [role]` — sets player role, dispatches `roleChanged` (staff)
  - `/faction add|remove|rank [name] [factionId] [rank?]` — membership management (staff)
  - `/treasury view|deposit|withdraw [holdId] [amount?]` — hold ledger access (leader)

### Modified
- **`src/playerCommands.ts`** — `/bounty` extended with `add` and `clear` sub-commands (staff-only via internal `hasPermission` check). `/property` extended with `approve`, `summon`, `deny`, `setprice` sub-commands (staff-only).
- **`src/housing.ts`** — Added `summonProperty` (sends `propertySummon` packet, dispatches `propertySummoned`) and `setPropertyPrice` (updates `price?` on property record).
- **`src/factions.ts`** — Added `setFactionRank` (updates rank in `ff_memberships`, dispatches `factionJoined` with new rank, sends `factionSync`).
- **`src/types/index.ts`** — `Property` interface gains optional `price?: number`. `GameEventType` gains `roleChanged`, `propertySummoned`, `treasuryChanged`.
- **`src/index.ts`** — Wired `initTreasury(mp)` and `initStaffCommands(mp, store, bus)`.

### Architecture notes
- Staff sub-commands for `/bounty` and `/property` live inside the same command handler as the player sub-commands — a single `registerCommand` call per noun keeps the dispatch table clean and avoids Map overwrites.
- `/treasury` commands are `leader`-permission — Jarls and Hold leaders manage hold finances; staff (with higher numeric level) also satisfy this.
- `setFactionRank` reuses the `factionJoined` event intentionally — the client treats it as a rank update, not a new join.
- `initTreasury` is a no-op today; it exists as a stable hook for Plans 10–15 to attach top-up listeners.

### Tests
- 13 tests in `treasury.test.ts`, 44 tests in `staffCommands.test.ts` — **414 total passing**

---

## [0.8.0] — 2026-04-17 — Plan 8: Command Interface

### Added
- **`src/permissions.ts`** — Player role storage (`player | leader | staff`) via `ff_role` in `mp.set`. `hasPermission()` uses numeric level comparison. Default role is `player`.
- **`src/commands.ts`** — Command registry, chat message parser (`/cmd arg1 arg2`), player name resolver (case-insensitive), feedback sender (`commandFeedback` packet), and dispatcher with permission gate. Unknown commands and permission failures send `commandFeedback` packets to the caller.
- **`src/playerCommands.ts`** — Registers all player-accessible commands at init:
  - `/lecture start|join [name]|end` — wraps college lecture session functions
  - `/train start [skill]|join [name]|end` — wraps training session functions
  - `/skill (skillId)` — shows XP, level, and cap per skill
  - `/pay [amount] [name]` — gold transfer
  - `/bounty` — self-check bounties across all holds
  - `/capture [name]` — takes a downed player captive
  - `/release [name]` — releases a captive
  - `/property list|request [id]` — list available properties, submit purchase request
- **`src/index.ts`** — `customPacket` handler now routes `chatMessage` type packets to `dispatchCommand`

### Architecture notes
- All command handlers are thin wrappers — no business logic lives in the command layer
- `stewardId` in `/property request` is temporarily `0` pending hold leadership resolution (Plan 9)
- Leader and staff commands (arrest, sentence, faction management, staff utilities) are in Plan 9

### Tests
- 8 tests in `permissions.test.ts`, 15 tests in `commands.test.ts`, 25 tests in `playerCommands.test.ts` — 357 total passing

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
