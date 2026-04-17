# Frostfall Roleplay — Command Reference

Commands are sent as chat messages prefixed with `/`. The server parses them via the `customPacket` chat handler. Arguments in `[brackets]` are required; `(optional)` are optional.

Permission levels: **Player** — any whitelisted player. **Leader** — confirmed faction/Hold leader. **Staff** — staff role only.

---

## College of Winterhold

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/lecture start` | Player | `startLecture()` | Open a lecture session. Caller becomes lecturer. |
| `/lecture join [lecturerId]` | Player | `joinLecture()` | Join an active lecture session. |
| `/lecture end` | Player | `endLecture()` | End your lecture. Distributes XP and magicka boost to attendees. |
| `/study [tomeBaseId]` | Player | `studyTome()` | Study a spell tome by base ID. Typically triggered by item activation, not manual command. |

---

## Training

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/train start [skillId]` | Player | `startTraining()` | Open a training session for a skill. Caller becomes trainer. |
| `/train join [trainerId]` | Player | `joinTraining()` | Join a trainer's session. Location check: must be within 500 units. |
| `/train end` | Player | `endTraining()` | End your session. Grants 2x XP boost (24h online time) to attendees. |

---

## Skills

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/skill` | Player | `getSkillXp()`, `getSkillCap()` | Show all skill XP, levels, and current caps. |
| `/skill [skillId]` | Player | `getSkillXp()`, `getSkillCap()` | Show XP, level, and cap for a specific skill. |

---

## Economy

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/pay [amount] [playerName]` | Player | `transferGold()` | Transfer Septims to another player. |

---

## Housing

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/property list` | Player | `getPropertiesByHold()` | List available properties in the current hold. |
| `/property request [propertyId]` | Player | `requestProperty()` | Request a property. Sends courier notice to the Hold Steward. |
| `/property approve [propertyId]` | Leader | `approveProperty()` | Approve a pending property request. Stewards only. |
| `/property deny [propertyId]` | Leader | `denyProperty()` | Deny a pending request, freeing the property. |
| `/property revoke [propertyId]` | Staff | `revokeProperty()` | Strip ownership from a property. |

---

## Bounty

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/bounty` | Player | `getAllBounties()` | Show your own bounties across all holds. |
| `/bounty check [playerName]` | Leader | `getAllBounties()` | Check another player's bounties. Guards and Jarls. |
| `/bounty add [playerName] [holdId] [amount]` | Leader | `addBounty()` | Issue a bounty in a hold. Hold Guards only. |
| `/bounty clear [playerName] [holdId]` | Leader | `clearBounty()` | Clear a player's bounty in a hold. After fine or pardon. |

---

## Justice

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/arrest [playerName]` | Leader | `queueForSentencing()` | Arrest a player. Queues them for sentencing, sends courier notice to Jarl. |
| `/sentence [playerName] fine [amount]` | Leader | `sentencePlayer()` | Fine a player in queue. Deducts gold, clears hold bounty. Jarls only. |
| `/sentence [playerName] release` | Leader | `sentencePlayer()` | Release without penalty, clear bounty. Jarls only. |
| `/sentence [playerName] banish` | Leader | `sentencePlayer()` | Banish from hold. Clears bounty, sends teleport packet. Jarls only. |

---

## Captivity

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/capture [playerName]` | Player | `capturePlayer()` | Take a downed player captive. Starts 24h timer. |
| `/release [playerName]` | Player | `releasePlayer()` | Release a captive from your custody. |

---

## Combat

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/down [playerName]` | Staff | `downPlayer()` | Staff: force-down a player (dispute resolution). |
| `/rise [playerName]` | Staff | `risePlayer()` | Staff: clear downed state. |
| `/nvfl clear [playerName]` | Staff | `clearNvfl()` | Staff: clear NVFL restriction (pardon or day reset). |

---

## Factions

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/faction join [playerName] [factionId] (rank)` | Leader | `joinFaction()` | Add a player to a faction at optional rank (default 0). Faction leaders only. |
| `/faction leave [playerName] [factionId]` | Leader | `leaveFaction()` | Remove a player from a faction. |
| `/faction rank [playerName] [factionId] [rank]` | Leader | `joinFaction()` (re-join at new rank) | Set a player's rank within a faction. |
| `/faction bbb [factionId]` | Player | `getFactionDocument()` | Read the BBB document for a faction. |
| `/faction bbb set [factionId]` | Staff | `setFactionDocument()` | Write/update a faction's BBB document. Opens a multi-line input flow. |

---

## Staff Utilities

| Command | Permission | Function called | Description |
|---------|------------|-----------------|-------------|
| `/sober [playerName]` | Staff | `soberPlayer()` | Instantly sober a player. |
| `/feed [playerName] (levels)` | Staff | `feedPlayer()` | Restore hunger by N levels (default 5). |

---

## Argument conventions

- `[playerName]` — character name, matched case-insensitively against online players
- `[skillId]` — one of: `destruction restoration alteration conjuration illusion smithing enchanting alchemy`
- `[holdId]` — one of: `whiterun eastmarch rift reach haafingar pale falkreath hjaalmarch winterhold`
- `[factionId]` — one of: `imperialGarrison fourthLegionAuxiliary thalmor companions collegeOfWinterhold thievesGuild bardsCollege vigilants forsworn stormcloakUnderground eastEmpireCompany confederationOfTemples`
- All names and IDs are case-insensitive in the parser

---

*Commands not yet implemented. All underlying functions exist in `gamemode/src/`. The command layer (Plan 8) wires them to the chat packet handler.*
