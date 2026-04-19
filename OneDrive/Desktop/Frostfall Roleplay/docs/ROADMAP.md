# Frostfall Roleplay — Internal Development Roadmap

**Last updated:** 2026-04-18  
**Stack:** TypeScript → webpack/tsc → SkyMP ScampServer JS gamemode  
**Test coverage:** 415 tests, all green

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and tested |
| 🔧 | Built, not yet wired or deployed |
| 🚧 | In progress |
| ⬜ | Not started |
| ❗ | Blocker — unblocks other work |

---

## Current State (v1.0.0)

### What's built and wired

| Module | Status | Notes |
|--------|--------|-------|
| Chat (browser ↔ server) | ✅ | makeEventSource + makeProperty widget bridge |
| Commands (dispatch + feedback) | ✅ | Registry with role permissions |
| Player commands | ✅ | lecture, train, skill, pay, bounty, capture, property |
| Staff commands | ✅ | arrest, sentence, down, rise, role, faction, treasury |
| Economy (stipend, transfers) | ✅ | 50 Sep/hr, 24h cap, transferGold |
| Hunger | ✅ | Drains 1/30min, stamina regen buff/debuff |
| Drunk bar | ✅ | Sober drain, weapon speed penalty |
| Skills (tier system) | ✅ | TIER_XP tiers 0–5, faction cap bonuses |
| Training sessions | ✅ | 2× XP boost for 24h online |
| College of Winterhold | ✅ | Lectures, tomes, rank XP |
| Bounty | ✅ | Per-hold accumulation, guard threshold |
| Factions (join/leave/rank) | ✅ | 12 factions, BBB documents |
| Housing (properties) | ✅ | 16 properties, request/approve/revoke |
| Combat (onDeath, bleed, loot) | ✅ | 3min bleed timer, execute/revive, temple spawns (placeholder coords) |
| Magic (spell XP, Detect Life) | ✅ | 75 base-game spells mapped, OnSpellCast Papyrus hook |
| Treasury (hold balances) | ✅ | deposit/withdraw, leader-only commands |
| Courier (notifications) | ✅ | Persistent, expiry-aware delivery |
| KOID (kill-on-sight table) | 🔧 | Module built, not wired into index.ts |
| NVFL (no-value-for-life) | 🔧 | Module built, not wired into index.ts |
| Captivity | 🔧 | Module built, not wired into index.ts |
| Prison (sentencing queue) | 🔧 | Module built, not wired into index.ts |
| Hold Resources | 🔧 | Module built, not wired into index.ts |

---

## Milestone 1 — First Live Session

> **Goal:** Two players can connect, get assigned to a hold, chat, run commands, fight, and get sentenced.  
> **Target:** First live test on Treyflickz's server

### 1.1 Wire remaining modules ✅
`initCaptivity` wired with 5-min expiry tick. `koid`, `nvfl`, `resources`, `prison` are pure-logic — already used by command handlers, no init needed. Dead comments removed from `index.ts`.

### 1.2 Hold assignment ✅
`/hold join [holdId]`, `/hold leave`, `/hold` (status) — player commands  
`/hold set [name] [holdId]` — staff override  
`ff_holdId` persisted via `mp.set` and restored on connect via `mp.get` in `mp.on('connect')`.  
**427 tests green.**

### 1.3 Temple spawn coordinates ✅
All 9 holds filled from Red House `coc-markers.json` + `cell.json`. Outdoor worldspace used for Dawnstar and Morthal. See v1.0.3 changelog.

### 1.4 Combat bridge ❗
**Problem:** `mp.onDeath` is wired, but SkyMP must forward death events. Verify `onDeath` fires on the server when a player's HP hits 0 in-game. If not, a client-side Skyrim Platform plugin is needed to detect downed state and send a custom packet.  
**Options:**
- A) Confirm `mp.onDeath` works on the running SkyMP version — test in-game
- B) Write a Skyrim Platform plugin (`skymp5-scripts` or custom plugin) that hooks `OnDeath` and sends `customPacket { customPacketType: 'playerDied', victimActorId }` → server calls `downPlayer`  

**Effort:** 1 hr (test) to 4 hrs (write plugin if needed)

### 1.5 Basic status commands ✅
`/status`, `/help` (role-aware), `/examine [name]` — all done in v1.0.2. **440 tests green.**

---

## Milestone 2 — Economy Loop

> **Goal:** Hold economy is self-sustaining. Taxes flow in, stipends flow out, resources create trade incentives.

### 2.1 Tax collection → treasury ⬜
- Property sales: portion of approval cost → hold treasury
- Business income: periodic tick adds gold to treasury
- Economy events dispatch `treasuryChanged` bus event
**Files:** `gamemode/src/housing.ts`, `gamemode/src/treasury.ts`

### 2.2 Resource trading ⬜
- Wire `resources.ts` into command layer
- `/resource list [holdId]` — show what a hold produces
- `/resource trade [playerId] [resourceId] [amount]` — player-to-player resource exchange
- Economic incentive: hold-exclusive resources only purchasable from players in that hold

### 2.3 Market prices ⬜
- Simple reference price table per resource
- `/market` — show current price index
- Dynamic prices shift based on supply (trade volume in last 24h) — deferred to v2

### 2.4 Salary/tithe system ⬜
- Jarls can pay salaries from treasury
- `/treasury pay [name] [amount] [reason]` — one-off payment from hold treasury
- Monthly tithe collection from properties (optional, deferred)

---

## Milestone 3 — Governance

> **Goal:** Each hold has a Jarl and Steward. Faction joining requires in-game RP approval. Political systems are player-driven.

### 3.1 Jarl/Steward delegation ⬜
- `/role set [name] leader` promotes to hold leader
- Jarl can designate a Steward: `/steward set [name]` (delegates property approval rights)
- Steward stored in `mp.set(0, 'ff_steward_[holdId]', playerId)`

### 3.2 Faction recruitment flow ⬜
- `/faction invite [name] [factionId]` — leader-only, sends courier to target
- Target accepts via `/faction accept [factionId]`
- Faction document (benefits/burdens/bylaws) viewable via `/faction info [factionId]`

### 3.3 Hold ordinances ⬜
- Jarl can set ordinances: `/ordinance set [text]` — persisted to `ff_ordinances_[holdId]`
- `/ordinance [holdId]` — public read command for any player

### 3.4 /examine command ⬜
Inspect another player:
```
/examine [name]   → hold, faction memberships, active bounties (visible to all players)
```
Was in the old commands.js. Needs porting to new TS command registry.

---

## Milestone 4 — Client UI

> **Goal:** Players can see their state without typing commands. Immersion is maintained.

### 4.1 Hunger/drunk HUD ⬜
- `makeProperty('ff_hunger')` updateOwner already applies stamina/health regen modifiers
- Add visual indicator: browser widget or makeProperty expression driving a Papyrus GlobalValue
- Simple: color-coded text in corner; Ideal: SVG icon strip (bread icons)

### 4.2 Bounty indicator ⬜
- `makeProperty` updateOwner → inject bounty total into browser HUD widget
- Shows "Wanted" if any hold bounty > 0, shows highest single bounty

### 4.3 Loot session UI ⬜
- Server sends `openLootMenu` packet → client-side browser widget renders item picker
- Player selects up to 3 items → sends `lootSelection` customPacket back → `completeLootSession`
- Requires browser-side JavaScript widget (skymp5-front or custom)

### 4.4 Skill tree display ⬜
- `/skill` command currently sends text feedback
- Ideal: `/skill` opens a browser widget showing all 8 skill bars with tier progress
- Requires React widget in skymp5-front or a Papyrus StatsMenu hook

### 4.5 Notification panel ⬜
- Courier notifications currently appear as chat messages on connect
- Better UX: a small inbox widget accessible via `/courier` or a keybind
- Shows unread count on HUD

---

## Milestone 5 — Advanced Systems

> **Goal:** The server feels alive. Systems interact. GMs have tools.

### 5.1 KOID enforcement ⬜
- Wire `koid.ts` into combat flow
- Before `downPlayer`, check `hasKoidPermission(attacker, victim)` faction pair
- If no KOID permission and no active bounty → block or log the aggression
- Requires attacker/victim faction lookup — `getPlayerMemberships` already exists

### 5.2 Dynamic world events ⬜
- Scheduled server events: bandit raid on a hold, Dwemer discovery, trade caravan
- GMs trigger via staff command `/event start [type] [holdId]`
- Broadcasts to all players in the hold, applies temporary modifiers

### 5.3 Magic effect enforcement ⬜
- Conjuration against players: log the violation, send evidence packet to GM
- Calm/Fear/Paralysis: client-side Papyrus scripts needed to detect application on PC
- OnSpellCast already wired — add effect-type checks

### 5.4 NVFL pardon system ⬜
- Jarls can pardon NVFL: `/pardon [name]` → `clearNvfl(store, playerId)`
- Current NVFL check is pure — just needs a command entry in staffCommands.ts

### 5.5 Inventory tracking ⬜
- Server-side log of significant item transfers (for moderation)
- Auto-flag suspiciously high gold transfers (anti-dupe)

---

## Tech Debt / Known Issues

| Issue | Priority | Notes |
|-------|----------|-------|
| `mp.onDeath` unverified on live server | ❗ High | May not fire on current SkyMP build; need live test |
| `HOLD_TEMPLE_SPAWNS` placeholder coords | ❗ High | All nulls → execute/bleed-out doesn't teleport |
| `onPapyrusEvent:OnSpellCast` unverified | Medium | Only fires if SkyMP client hooks it |
| `mp.set(playerId, ...)` vs `mp.set(actorId, ...)` | Medium | Skills/chat use userId; built-in props need actorId — verify SkyMP persistence model |
| `SYSTEMS.md` is outdated | Low | Predates tier system, chat, combat, magic rewrites |
| No webpack config in `Frostfall Roleplay/gamemode/` | Low | Uses `tsc` to `dist/` — confirm server loads `dist/index.js` correctly |

---

## Immediate Next Commits

1. ~~**Wire remaining modules**~~ — uncomment captivity/prison/nvfl/koid/resources in `index.ts`
2. ~~**Hold assignment**~~ — done in v1.0.1
3. ~~**`/status` and `/help`**~~ — done in v1.0.2
4. ~~**`/examine`**~~ — done in v1.0.2
5. **Live test** — confirm `mp.onDeath`, chat, commands on Treyflickz's server
6. ~~**Temple coords**~~ — done in v1.0.3

---

## Open Questions for Fosk

- Does `mp.onDeath` fire reliably on the current SkyMP build (a032d7d)?
- Is there a way to check the server version's ScampServer capabilities?
- What's the preferred method for loading the gamemode — does SkyMP expect `gamemode.js` at the root, or can it be configured to point at `gamemode/dist/index.js`?
- Are there Skyrim Platform client plugins we should be writing alongside the server gamemode?
