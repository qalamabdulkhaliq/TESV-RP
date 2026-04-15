# Frostfall Roleplay - Systems Reference

---

## Foundation

### EventBus (`src/events.ts`)
- Internal typed event system
- Methods: `on(type, handler)`, `off(type, handler)`, `dispatch(event)`
- Systems communicate only through the bus, never by calling each other directly

### PlayerStore (`src/store.ts`)
- In-memory player state for all online players
- Methods: `registerPlayer(id, actorId, name)`, `deregisterPlayer(id)`, `get(id)`, `getAll()`, `update(id, patch)`
- `update()` shallow-merges a patch object
- Throws if `update()` is called for an unknown player

### SkyMP Adapter (`src/skymp.ts`)
- Single point of contact for all SkyMP runtime calls
- `Mp` interface typed from SkyMP source (`scampNative.ts`)
- Helpers: `getInventory()`, `setInventory()`, `getGold()`, `setGold()`, `addGold()`, `removeGold()`, `sendPacket()`
- Everything else in the codebase is independently testable because only this file touches SkyMP

### Entry Point (`src/index.ts`)
- `declare const mp: Mp` global pattern (SkyMP sets `globalThis.mp` before loading)
- Creates shared `bus` and `store` instances
- Wires all system init functions
- Handles `connect`, `disconnect`, `customPacket` SkyMP events

---

## Shared Types (`src/types/index.ts`)

### Identifiers
- `PlayerId`: number (SkyMP userId)
- `ActorId`: number (SkyMP actorFormId)
- `HoldId`: union of 9 holds
- `FactionId`: union of 12 factions
- `PropertyId`: string
- `CollegeRank`: `novice | apprentice | adept | expert | master`

### PlayerState fields
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | PlayerId | - | SkyMP userId |
| `actorId` | ActorId | - | SkyMP actorFormId |
| `name` | string | - | Character name |
| `holdId` | HoldId or null | null | Current hold assignment |
| `factions` | FactionId[] | [] | Quick-lookup list, full rank data in mp.set |
| `bounty` | Partial<Record<HoldId, number>> | {} | Per-hold wanted levels |
| `isDown` | boolean | false | Downed state flag |
| `isCaptive` | boolean | false | Captivity state flag |
| `downedAt` | number or null | null | Timestamp of last downing, NVFL source of truth |
| `captiveAt` | number or null | null | Timestamp captivity began |
| `properties` | PropertyId[] | [] | Owned property IDs |
| `hungerLevel` | number | 10 | 0 = starving, 10 = full |
| `drunkLevel` | number | 0 | 0 = sober, 10 = blackout |
| `septims` | number | 0 | Gold balance |
| `stipendPaidHours` | number | 0 | Max 24 |
| `minutesOnline` | number | 0 | Session counter for ticks |

---

## Hunger (`src/hunger.ts`)

### Constants
- Range: 0 (starving) to 10 (full)
- Drain interval: 30 IRL minutes of playtime
- `makeProperty` key: `ff_hunger`

### Functions
- `calcNewHunger(current, delta)`: pure, clamped
- `shouldDrainHunger(minutesOnline)`: true at 30, 60, 90... minutes
- `feedPlayer(mp, store, bus, playerId, levels)`: restores hunger, returns new level or -1 if unknown
- `getHungerUpdateOwner()`: Papyrus expression for client, +25 stamina regen at full, -15 health regen at or below 2
- `initHunger(mp, store, bus)`: registers makeProperty, restores on join, runs 60s tick, returns cleanup fn

### Persistence
- `mp.set(actorId, 'ff_hunger', number)`

### Events dispatched
- `hungerTick`: `{ playerId, hungerLevel }`

---

## Drunk Bar (`src/drunkBar.ts`)

### Constants
- Range: 0 (sober) to 10 (blackout)
- Sober drain interval: 5 IRL minutes
- `makeProperty` key: `ff_drunk`
- Alcohol strengths: Alto Wine=1, Mead=2, Black-Briar Reserve=3, Wine=1, Honningbrew=2

### Functions
- `calcNewDrunkLevel(current, delta)`: pure, clamped
- `shouldSober(minutesOnline)`: true at every 5-minute mark
- `getAlcoholStrength(baseId)`: returns 0 for non-alcohol items
- `drinkAlcohol(mp, store, bus, playerId, baseId)`: applies strength, persists, dispatches event
- `soberPlayer(mp, store, bus, playerId)`: instant sober, for prison intake and staff commands
- `getDrunkUpdateOwner()`: weapon speed penalty at level 5+, larger penalty at level 8+
- `initDrunkBar(mp, store, bus)`: registers makeProperty, restores on join, runs 60s sober tick, returns cleanup fn

### Persistence
- `mp.set(actorId, 'ff_drunk', number)`

### Events dispatched
- `drunkChanged`: `{ playerId, drunkLevel }`

---

## Economy (`src/economy.ts`)

### Constants
- Stipend rate: 50 Septims per hour
- Stipend cap: 24 hours (1,200 Septims total)
- Stipend interval: 60 IRL minutes

### Functions
- `isStipendEligible(stipendPaidHours)`: false at or above 24
- `shouldPayStipend(minutesOnline, stipendPaidHours)`: checks both interval and eligibility
- `transferGold(mp, store, fromId, toId, amount)`: returns false on insufficient funds, unknown players, or zero amount
- `initEconomy(mp, store, bus)`: syncs gold from inventory on join, pays stipend on 60s tick

### Persistence
- `mp.set(actorId, 'ff_stipendHours', number)`

### Events dispatched
- `stipendTick`: `{ playerId, septims, stipendPaidHours }`

---

## Hold Resources (`src/resources.ts`)

### Data
- 18 items across all 9 holds, 2 per hold
- Each resource: `{ baseId, name, holdId, source }`

### Functions
- `getHoldResources(holdId)`: all items for a hold
- `getResourceHold(baseId)`: which hold produces the item, or null
- `isHoldExclusive(baseId)`: boolean check

---

## Courier (`src/courier.ts`)

### Types
- `NotificationType`: `propertyRequest | prisonRequest | bountyReport | holdMessage`
- `CourierNotification`: `{ id, type, fromPlayerId, toPlayerId, holdId, payload, createdAt, expiresAt, read }`
- Default expiry: 7 IRL days
- Null `expiresAt` = never expires

### Functions
- `createNotification(type, fromPlayerId, toPlayerId, holdId, payload, now?)`: pure factory
- `filterExpired(notifications, now?)`: removes expired entries
- `getUnread(notifications)`: filters unread
- `sendNotification(mp, store, notification)`: persists and delivers if recipient is online
- `markRead(mp, store, playerId, notificationId)`: marks single notification read
- `getPendingNotifications(mp, store, playerId)`: unread, unexpired notifications
- `initCourier(mp, store, bus)`: on join, delivers all pending unread notifications

### Persistence
- `mp.set(actorId, 'ff_courier', CourierNotification[])`
- Expired notifications are pruned on every write

---

## Housing (`src/housing.ts`)

### Registry
- 16 properties across 9 holds
- Types: `home` or `business`
- Holds covered: Whiterun, Eastmarch, Rift, Reach, Haafingar, Pale, Falkreath, Hjaalmarch, Winterhold

### Functions
- `getProperty(id)`: returns Property or null
- `getPropertiesByHold(holdId)`: filtered list
- `getOwnedProperties(playerId)`: all properties owned by a player
- `isAvailable(propertyId)`: true when no owner and no pending request
- `requestProperty(mp, store, bus, playerId, propertyId, stewardId)`: marks pending, sends courier notification to Steward
- `approveProperty(mp, store, bus, propertyId, approverId)`: transfers ownership, updates store, sends approval packet
- `denyProperty(mp, propertyId)`: clears pending state, no ownership transfer
- `revokeProperty(mp, store, propertyId)`: strips ownership, removes from player store entry
- `initHousing(mp, store, bus)`: loads persisted state on start, restores owned properties on join, sends available property list

### Persistence
- `mp.set(0, 'ff_properties', Property[])` (world-keyed)

### Events dispatched
- `propertyRequested`: `{ playerId, propertyId }`
- `propertyApproved`: `{ propertyId, newOwnerId, approvedBy }`

---

## Bounty (`src/bounty.ts`)

### Constants
- Guard KOID threshold: 1,000 Septims
- `BountyRecord`: `{ holdId, amount, updatedAt }`

### Functions
- `getBounty(mp, store, playerId, holdId)`: returns amount or 0
- `getAllBounties(mp, store, playerId)`: all holds with non-zero bounty
- `isGuardKoid(mp, store, playerId, holdId)`: true at or above threshold
- `addBounty(mp, store, bus, playerId, holdId, amount)`: accumulates, persists, dispatches event, sends packet
- `clearBounty(mp, store, bus, playerId, holdId)`: zeros a hold's bounty
- `initBounty(mp, store, bus)`: on join, loads records, syncs per-hold map to store

### Persistence
- `mp.set(actorId, 'ff_bounty', BountyRecord[])`

### Events dispatched
- `bountyChanged`: `{ playerId, holdId, newAmount, delta }`

---

## KOID (`src/koid.ts`)

### Purpose
- Permission table for which faction pairs have mutual lethal-force authorization
- Pure functions, no runtime state

### Registered pairs
| Faction A | Faction B | Reason |
|-----------|-----------|--------|
| thalmor | stormcloakUnderground | Standing Justiciar orders |
| imperialGarrison | stormcloakUnderground | Active conflict |
| guard | highBounty | Wanted criminal threshold |

### Functions
- `hasKoidPermission(factionA, factionB)`: symmetric check
- `getKoidPair(factionA, factionB)`: returns matching pair or null
- `getKoidTargeters(faction)`: all identifiers that can target this faction

### Notes
- This is a reference table, not an enforcer
- Guards and KOID enforcement require a command interface or UI query layer

---

## Combat (`src/combat.ts`)

### Constants
- `LOOT_CAP_GOLD`: 500 Septims (sent to client, client enforces)
- `LOOT_CAP_ITEMS`: 3 items (sent to client, client enforces)

### Functions
- `isDowned(store, playerId)`: reads `PlayerState.isDown`
- `downPlayer(mp, store, bus, victimId, attackerId)`: sets `isDown=true`, `downedAt=now`, sends packet with loot caps to both parties
- `risePlayer(mp, store, bus, playerId)`: clears `isDown`, preserves `downedAt` for NVFL

### Notes
- No automatic trigger; `downPlayer()` must be called by a client packet handler or staff command
- SkyMP handles native death animation independently

### Events dispatched
- `playerDowned`: `{ victimId, attackerId, holdId }`
- `playerRisen`: `{ playerId }`

---

## NVFL (`src/nvfl.ts`)

### Constants
- Window: 24 IRL hours from `downedAt` timestamp

### Purpose
- After being downed, a player cannot initiate hostilities for 24 hours
- They can still defend themselves if attacked

### Functions
- `isNvflRestricted(store, playerId, now?)`: true if `downedAt` is within window
- `getNvflRemainingMs(store, playerId, now?)`: ms left in restriction, 0 if none
- `clearNvfl(store, playerId)`: sets `downedAt = null`, for Jarl pardons and day resets

### Notes
- Entirely pure, no mp calls
- `downedAt` in PlayerStore is the single source of truth

---

## Captivity (`src/captivity.ts`)

### Constants
- Max captivity duration: 24 IRL hours

### Functions
- `isCaptive(store, playerId)`: reads `PlayerState.isCaptive`
- `getCaptivityRemainingMs(store, playerId, now?)`: ms until auto-release, 0 if not captive
- `capturePlayer(mp, store, bus, captiveId, captorId)`: sets `isCaptive=true`, `captiveAt=now`, sends packet with timer to both parties
- `releasePlayer(mp, store, bus, captiveId)`: clears `isCaptive` and `captiveAt`, sends release packet
- `checkExpiredCaptivity(mp, store, bus, now?)`: called on server tick, auto-releases expired captives, returns list of released player IDs

### Events dispatched
- `playerCaptured`: `{ captiveId, captorId }`
- `playerReleased`: `{ captiveId }`

---

## Prison (`src/prison.ts`)

### Types
- `SentenceType`: `fine | release | banish`
- `PrisonQueueEntry`: `{ playerId, holdId, arrestedBy, queuedAt }`
- `SentenceDetails`: `{ type, fineAmount?, note? }`

### Functions
- `getQueue(mp, holdId?)`: full queue or filtered by hold
- `isQueued(mp, playerId)`: boolean
- `queueForSentencing(mp, store, bus, playerId, holdId, arrestingOfficerId, notifyId)`: adds to queue, sends courier notification to Jarl
- `sentencePlayer(mp, store, bus, playerId, jarlId, sentence)`:
  - `fine`: deducts `min(fineAmount, septims)`, clears hold bounty
  - `release`: clears hold bounty
  - `banish`: clears hold bounty, sends banishment packet for client teleport

### Persistence
- `mp.set(0, 'ff_prison_queue', PrisonQueueEntry[])` (world-keyed)

### Events dispatched
- `playerArrested`: `{ playerId, holdId, arrestedBy }`
- `playerSentenced`: `{ playerId, jarlId, holdId, sentence }`

---

## Factions (`src/factions.ts`)

### Types
- `FactionDocument`: `{ factionId, benefits, burdens, bylaws, updatedAt, updatedBy }`
- `FactionMembership`: `{ factionId, rank, joinedAt }`
- Rank is numeric: 0 = initiate, higher = more senior

### Functions
- `getFactionDocument(mp, factionId)`: returns BBB document or null
- `setFactionDocument(mp, doc)`: staff-only update
- `joinFaction(mp, store, bus, playerId, factionId, rank?)`: adds membership, syncs store
- `leaveFaction(mp, store, bus, playerId, factionId)`: removes membership, syncs store
- `isFactionMember(mp, store, playerId, factionId)`: boolean
- `getPlayerFactionRank(mp, store, playerId, factionId)`: number or null
- `getPlayerMemberships(mp, store, playerId)`: full records with rank and timestamps
- `initFactions(mp, store, bus)`: on join, reloads memberships into store, sends sync packet

### Persistence
- BBB documents: `mp.set(0, 'ff_faction_docs', Record<FactionId, FactionDocument>)` (world-keyed, staff-mutable at runtime)
- Memberships: `mp.set(actorId, 'ff_memberships', FactionMembership[])`

### Events dispatched
- `factionJoined`: `{ playerId, factionId, rank }`
- `factionLeft`: `{ playerId, factionId }`

---

## College of Winterhold (`src/college.ts`)

### Rank thresholds
| Rank | XP Required |
|------|-------------|
| Novice | 0 |
| Apprentice | 100 |
| Adept | 300 |
| Expert | 600 |
| Master | 1,000 |

### XP sources
| Source | XP Gained |
|--------|-----------|
| Novice tome | 15 |
| Apprentice tome | 30 |
| Adept tome | 50 |
| Expert tome | 75 |
| Master tome | 100 |
| Attend lecture | 50 |
| Teach lecture | 25 |

### Lecture mechanic
- Lecturer runs `/lecture start` (sends `startLecture` custom packet)
- Nearby players join the session
- Lecturer ends session with `/lecture end`
- All attendees receive XP + 24-hour magicka regen boost (+15%)
- Lecturer receives XP only, no boost
- Sessions are in-memory only, do not survive server restart

### Functions
- `getCollegeRank(xp)`: pure, returns rank for XP total
- `getTomeRank(tomeBaseId)`: returns tier or null for unregistered tome
- `getStudyXp(mp, store, playerId)`: reads `ff_study_xp`
- `getCollegeRankForPlayer(mp, store, playerId)`: convenience wrapper
- `studyTome(mp, store, bus, playerId, tomeBaseId)`: awards TOME_XP for registered tomes
- `startLecture(mp, store, bus, lecturerId)`: creates session
- `joinLecture(mp, store, bus, playerId, lecturerId)`: adds attendee
- `endLecture(mp, store, bus, lecturerId, now?)`: distributes XP and boost, clears session
- `getActiveLecture(lecturerId)`: returns session or null
- `hasLectureBoost(mp, store, playerId, now?)`: boolean
- `getLectureBoostRemainingMs(mp, store, playerId, now?)`: ms remaining
- `initCollege(mp, store, bus)`: registers makeProperties, syncs on join

### makeProperties
- `ff_study_xp`: visible to owner, no client expression
- `ff_lecture_boost`: visible to owner, updateOwner expression returns `{ magickaRegenMult, boostActive }`

### Persistence
- `mp.set(actorId, 'ff_study_xp', number)`
- `mp.set(actorId, 'ff_lecture_boost', number)` (expiry timestamp)

---

## What Is Not Yet Built

### Command interface
- No `/lecture start`, `/arrest`, `/sentence`, `/bounty add`, `/property request` commands
- All API functions exist but have no invocation path
- The `customPacket` handler in `index.ts` logs and does nothing

### Client UI
- Custom packets are sent but nothing renders them
- No HUD elements: bounty display, hunger bar, NVFL timer, courier inbox, property list, rank indicator
- SkyMP includes a React UI layer, components need to be written

### Combat bridge
- `downPlayer()` has no automatic trigger from native SkyMP health events
- Requires a `makeProperty` watch on health or a client packet when health crosses threshold

### Hold assignment
- `PlayerState.holdId` is always null
- Nothing sets it on join or player movement between holds

### KOID enforcement
- KOID table is a reference only
- No code queries it before allowing combat actions

### Server configuration
- No `server.json`, no gamemode entry config
- `dist/index.js` exists but no server setup files

---

## Test Coverage

| Suite | Tests |
|-------|-------|
| types | 5 |
| events | 6 |
| store | 8 |
| hunger | 14 |
| drunkBar | 19 |
| economy | 14 |
| resources | 7 |
| courier | 9 |
| housing | 14 |
| bounty | 17 |
| koid | 12 |
| combat | 13 |
| nvfl | 9 |
| captivity | 14 |
| prison | 15 |
| factions | 28 |
| college | 42 |
| **Total** | **262** |
