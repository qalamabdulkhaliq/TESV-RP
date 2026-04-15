# Frostfall Roleplay — Server Design Specification
**Date:** 2026-04-15
**Status:** Draft — Awaiting Final Approval

---

## Table of Contents
1. [Vision](#1-vision)
2. [World & Setting](#2-world--setting)
3. [Faction Architecture](#3-faction-architecture)
4. [The Launch Event](#4-the-launch-event--the-execution-of-ulfric-stormcloak)
5. [Economy & Property](#5-economy--property)
6. [Soft Systems](#6-soft-systems)
7. [Combat & Justice](#7-combat--justice)
8. [Leadership & Governance](#8-leadership--governance)
9. [Applications & Onboarding](#9-applications--onboarding)
10. [IC Lore Section](#10-ic-lore-section)
11. [Technical Architecture](#11-technical-architecture)

---

## 1. Vision

Frostfall Roleplay is a SkyMP narrative roleplay server built for the TES fans that Bethesda left behind — the ones who remember when the worldbuilding had weight, when factions had consequence, when the world felt tactile. This server hands that world back to them and lets them finish writing it.

**Core commitments:**
- Narrative over survival. Systems exist to texture roleplay, not replace it.
- IC consequences replace OOC moderation wherever possible.
- Staff seed the world. Players run it.
- No hand-holding. No safety nets. Real stakes, real theatre.
- 750–1,000 player slots. Built to scale overnight.

---

## 2. World & Setting

### Era
**4E 191** — ten years before the events of *The Elder Scrolls V: Skyrim*.

### Divergence from Canon
This timeline diverges from canon at the conclusion of the Great War. The White-Gold Concordat's terms were harsher:

- **Ulfric Stormcloak was executed** rather than imprisoned and released. He is a martyr, not a general. The Stormcloak name survives him; the rebellion does not — yet.
- **The High Kingship of Skyrim was abolished.** Jarls now answer directly to Imperial authority. There is no native head of state.
- **Talos worship is banned and actively hunted** by Thalmor Justiciars operating throughout the province.

### What This Means for the World
- The Jarls are governors under occupation — collaborators or quiet rebels, depending on who plays them.
- There is no Dragonborn, no main quest, no prophecy pulling focus. Player stories fill that vacuum.
- The Stormcloak resistance is scattered, leaderless, and underground — rallying around a dead man's name.
- The moral landscape is murky in all the right ways.

### Named Canonical Characters
All exist as historical figures and background texture. None appear as playable or staff-controlled NPCs. **Every seat of power is an original player character.** The exception is a single scripted NPC: Ulfric Stormcloak, used once, for the launch event, then gone.

### No NPCs
The world lives only when players run it. Every merchant, guard, priest, and jarl is a person.

---

## 3. Faction Architecture

### Design Philosophy
**The Holds are the spine.** Almost every institution in Skyrim falls under a Hold's jurisdiction. Staff seed leadership positions at launch with vetted players. From there, everything beneath them propagates without staff intervention.

Two factions — the Imperial Garrison and the Thalmor — sit outside Hold authority because they answer to off-map powers. Everything else is Hold-governed.

Enforcement is **in-character**. The Thalmor curbs the College. The Legion quells a riot. Factions police each other through the fiction. Staff use in-world power, not OOC moderation, wherever possible.

---

### 3.1 The Nine Holds

Each Hold has a Jarl (political authority, judicial power, licensing, taxation) and a Steward (administrative arm, property requests, Hold finances). Each Hold has unique resources available nowhere else, driving inter-Hold trade, and a signature institution that lives under their governance.

| Hold | Capital | Unique Resource | Signature Institution | Temple / Faith |
|------|---------|----------------|----------------------|----------------|
| Whiterun Hold | Whiterun | Grain, livestock | The Companions | Temple of Kynareth |
| Eastmarch | Windhelm | Furs, harbor trade | Stormcloak Underground *(informal, beneath the surface)* | Temple of Talos *(shuttered/secret)* |
| The Rift | Riften | Fish, mead, lumber | Thieves Guild | Temple of Mara |
| The Reach | Markarth | Silver, Dwemer salvage | Forsworn *(opposition)* | Temple of Dibella |
| Haafingar | Solitude | Imports, exports, port | Bards College | Temple of the Divines *(grand seat)* |
| The Pale | Dawnstar | Iron, corundum | Metalworker's Lodge | Vigil of Stendarr |
| Falkreath Hold | Falkreath | Timber, pelts, game | Woodcutter's & Hunter's Lodge | Hall of the Dead *(Arkay)* |
| Hjaalmarch | Morthal | Alchemical ingredients, peat | Apothecary's Guild | Vigil of Stendarr *(shared)* |
| Winterhold | Winterhold | Arcane components | College of Winterhold | — *(College fills this void)* |

> **Note on Windhelm's Temple of Talos:** In 4E 191 this temple is either officially shuttered under Imperial order or operating in secret. Whether it remains open is the Windhelm Jarl's first and most defining political decision. The Thalmor's entire early arc may be built around this building.

> **Note on sub-institutions:** The Companions, College, Thieves Guild, Bards College, etc. are not server factions — they are Hold sub-institutions. They are not managed by staff. They fall under their Jarl's governance. If players want to RP these groups, the Jarl facilitates it.

---

### 3.2 Trade Guilds

Each Hold has a medieval-style trade guild organized around its economic identity. These are player-run institutions under Hold governance, housed in cell-swapped buildings.

| Hold | Guild | Building (cell swap candidate) |
|------|-------|-------------------------------|
| The Pale | Metalworker's Lodge | Dawnstar museum repurposed |
| The Reach | Silversmith's Guild | TBD |
| Falkreath Hold | Woodcutter's & Hunter's Lodge | TBD |
| Hjaalmarch | Apothecary's Guild | TBD |
| Whiterun Hold | Merchant's League | TBD |
| Eastmarch | Sailor's & Furrier's Guild | TBD |
| The Rift | Fisher's Guild | TBD |
| Haafingar | Trade Commission | TBD |
| Winterhold | *(College serves this function)* | — |

---

### 3.3 Off-Map Factions

These two factions answer to powers outside Skyrim's borders. They are not subject to Hold governance. Staff seed their leadership at launch.

#### Imperial Garrison of Skyrim
The aging garrison that has held Skyrim for decades. Not the Fourth Legion — that comes later with Tullius in 4E 201. These are soldiers in worn forts, running patrols between holds and escorting East Empire caravans.

- Man forts, protect roads, hunt bandits between hold borders
- **Quietly not enforcing the Talos ban.** They look the other way. It is an open secret.
- Players enter at equal rank and earn seniority internally
- Tailored application process; self-managing after launch seeding
- The **Fourth Legion Auxiliary** is a distinct company within the Garrison, led by a vetted Lieutenant — see §4

#### Aldmeri Dominion (Thalmor)
Starts deliberately small. A handful of Justiciars, an Embassy, limited reach. They must earn their power through roleplay, political pressure, and recruitment. Players watch them grow. This is intentional.

- Answer only to the Aldmeri Dominion
- Have canonical authority to hunt Talos worshippers
- Are not yet strong enough to act unilaterally against a coordinated opposition
- Their growth arc is the slow burn of the server's first months

---

### 3.4 The Confederation of Temples

A loose pan-Skyrim federation of the active temples of the Eight Divines. Each temple is governed by its Hold Jarl day-to-day, but united through shared faith and the Confederation's council. Solitude's Temple of the Divines is the de facto seat.

The Vigil of Stendarr fills the religious role in holds without a dedicated Divine temple (Dawnstar, Morthal).

The Temple of Talos in Windhelm sits **outside the Confederation officially** — it cannot be recognized under the Concordat. What it is in practice is up to the players of Windhelm.

---

### 3.5 The BBB System — Benefits, Burdens, Bylaws

Every lore-recognized faction has a staff-authored document defining:

| Component | Definition |
|-----------|-----------|
| **Benefits** | What membership grants — mechanical advantages, social standing, access |
| **Burdens** | What it costs — restrictions, obligations, required roleplay commitments |
| **Bylaws** | Conduct rules keeping the faction recognizable as itself within lore bounds |

Factions that violate their Bylaws face in-world consequences, not OOC punishment. The Thalmor is sent to curb the College. The Legion is called to quell a riot. The fiction enforces itself.

---

### 3.6 Omitted Factions

| Faction | Status |
|---------|--------|
| Dark Brotherhood | Does not canonically exist on this server. Players may *claim* the name — that's interesting. It has no staff support, no BBB document, no mechanical recognition. |
| Stormcloaks *(as organized army)* | No standing army, no formal structure. The underground movement in Windhelm (§3.1) exists as a pressure and a whisper, not a faction with a BBB document. If players build it into something real, that emergence is the story — not a staff decision. |

---

## 4. The Launch Event — The Execution of Ulfric Stormcloak

This is the server's founding cinematic. It is not announced in advance. It is not scripted in the traditional sense. It is staged, vetted roleplay performed in front of a live playerbase at peak population.

### Pre-Launch Misdirection
- The server is advertised as though **Ulfric Stormcloak will be the Jarl of Windhelm**
- The whitelisted/applied position is Ulfric's **Steward** — who is, in truth, a traitor
- All staff publicly confirm that the server owner (playing Ulfric) is not active
- The playerbase has no reason to expect anything

### The Traitor Steward
- Inept with the garrison — not through sabotage, but through neglect and misplaced loyalty
- Windhelm's military is sparsely armed at launch. This is **realistic**: in 4E 191, Ulfric was not mobilizing for open war. He saw High King Torygg as a boy who had been robbed of a throne, not as an enemy. There was no reason to build an army. The people were talking, but open rebellion was not on the table.
- The Steward has advance knowledge of the Thalmor's plans and has done nothing to warn Windhelm

### The Week Timeline

| Day | Event |
|-----|-------|
| 1–2 | Server opens. Thalmor arrive quietly. Embassy is staffed in Solitude. |
| 3 | A single Justiciar appears at the College of Winterhold. Most players won't understand what this means yet. |
| 6–7 | Peak hours. No announcement. The main event happens. |

### The Main Event
At peak population, with no advance warning:

1. The caravan enters Skyrim at **Falkreath's gates** — Ulfric bound and **gagged**, mirroring the Skyrim opening in real, live roleplay
2. The Fourth Legion Lieutenant and her Auxiliary march escort
3. The caravan travels the full road to **Windhelm**
4. The Thalmor are already inside the city
5. In front of the **Palace of the Kings**, with no speech, no ceremony, no warning — **Ulfric is executed**

### What This Communicates (Without Saying a Word)
- The Imperial Garrison and Thalmor are coordinated, serious forces
- They will move on Jarls without notice
- **Open civil war is not survivable right now.** The tension is not decorative. It is load-bearing.
- The Stormcloak underground has their martyr and their inciting incident in the same moment

### The Fourth Legion Auxiliary
The Lieutenant is a vetted player, selected in part for PVP skill. Her Auxiliary company is recruited entirely **in-character, organically**, from the existing player population.

- No gifted gear, no stacked stats
- The Lieutenant watches, tests, nominates
- The most feared military unit on the server will be feared because it was **earned, not assigned**
- Players aspiring to join the Auxiliary must catch her attention through gameplay

### After the Execution
- Ulfric is gone. The NPC is used once.
- The Steward position in Windhelm is now the effective governing seat — until a new Jarl emerges through IC political process
- The Thalmor have demonstrated reach. Their next move is theirs to decide.
- The server's first real story has begun

---

## 5. Economy & Property

### Currency
Septims are native to SkyMP's inventory sync system. No custom currency needed. Gold is a tracked item.

### Starter Stipend
Inspired by GTA:W's onboarding model. New characters receive a drip-fed stipend over their first 24 hours of playtime — enough to feel like a person with standing, not a destitute nobody unless they choose to be. The exact amount and interval is to be tuned during playtesting.

**Design intent:** The stipend is economy-stimulating. New players bring a slow drip of coin into circulation. It opens the door for players who want to RP a noble, a merchant, or a tradesperson from day one without grinding fish.

### Housing
1. Player opens an in-game **property purchase menu**
2. Menu triggers a **courier notification** to the Hold Steward (or Jarl if Steward is offline)
3. Steward reviews and approves/denies the request IC — no staff involvement
4. On approval, the player gains ownership

**Ownership grants:**
- Property as a **spawn point**
- **Access control** on storage (safes and private chests are locked to owner by default)
- The ability to grant access to specific other players

**At launch:** Shop interiors are as-is (vanilla Skyrim layouts). Custom signage is a future feature.

### Player-Run Businesses
Shops can be purchased from their current occupant entirely through IC transaction. The Jarl licenses the business, collects taxes, and can revoke a license IC. After that, it is the owner's problem and the owner's story.

Example: Someone buys The Drunken Huntsman from its launch-week occupant (vetted by the Whiterun Jarl). Staff are not involved in this transaction. The new owner runs it however they choose, within Hold law.

### Taxation & Licensing
Managed entirely by the Jarl and Steward through IC roleplay. No mechanical tax collection system at launch — the Hold's social and political authority enforces it. Mechanical systems may be added in later iterations.

---

## 6. Soft Systems

### Hunger
- Every **30 minutes of IRL playtime**, the character drops one hunger level
- Eating restores hunger levels
- Hunger provides **benefits when sated, not death when depleted** — the system textures roleplay, it does not replace it
- A character at full hunger might receive stat buffs; a starving character receives mild debuffs. No instant death. No forced fishing economy.

### The Drunk Bar (Replaces Thirst)
Thirst is not implemented. In a province covered in rivers, lakes, and snowmelt, water scarcity is not a meaningful tension.

Instead: a **Drunk Bar**.
- Fills as the character drinks alcohol
- Drains passively as the character sobers up
- Mechanical effects scale with bar level (vision effects, reduced fine motor control, increased bravado)
- Rewards tavern roleplay organically — drinking with someone has mechanical texture

---

## 7. Combat & Justice

### PvP Rules

| Rule | Detail |
|------|--------|
| **No general KOS** | Unprovoked killing is not permitted by default |
| **Kill on ID (KOID)** | Specific faction pairs have mutual KOS permissions by lore and server design |
| **Bandit bounties** | Characters with a sufficiently high bounty can be KOID'd by Hold guards |

**KOID faction pairs:**

| Faction A | Faction B |
|-----------|-----------|
| Thalmor | Stormcloak Underground |
| Imperial Garrison | Active combatants flagged by bounty |
| Hold Guards | High-bounty players |

### Downed / Captured
When a fight ends, the loser is **Downed** — not dead.

- The victor may loot a **limited amount** of gear or coin — exact caps to be tuned during playtesting. Not everything. Not a full-loot server.
- The victor may leave the victim, hold them captive, or ransom them
- Downed characters are incapacitated but not removed from the world

### No Value For Life (NVFL)
If a character is Downed or Captured within the same **in-game day**:
- They **cannot initiate or participate in hostilities** for the remainder of that day
- They **can defend themselves** if attacked
- **Mechanical debuffs** are applied (injury penalties, reduced stats)

### Captivity
- Maximum captivity duration: **24 hours IRL**
- After 24 hours, restraints (cuffs, bindings) **automatically despawn**
- Captors are expected to have ransomed, imprisoned, or allowed escape RP before the timer expires

### Prison & the Jarl's Judicial Authority
Imprisonment routes through the Hold's justice system.

- An imprisoned character must **stand before the Jarl**
- The Jarl presides over sentencing IC — fines, labor, banishment, or worse
- Repeat offenders build a **record with that Jarl** — persistent, remembered, consequential
- Prisons are their own gameplay space, not a loading screen and a timer

---

## 8. Leadership & Governance

### The Leadership Covenant
Key faction leadership roles are not staff positions. They are vetted player roles held by people who want to lead both IC and OOC. Taking a leadership role is a commitment, documented in the application process.

| Rule | Detail |
|------|--------|
| **Tenure** | Leaders hold their role until they retire or pass it on IC |
| **Inactivity threshold** | 2 weeks without any IC roleplay = role is shelved |
| **Succession** | Rank passes on IC to a designated or emergent successor |
| **Return** | Players may return to their character, but not automatically to the role |
| **Commitment** | Applications make clear: this role drives narrative for hundreds or thousands of players |

### Why This Works
At scale, a single faction leader running an active story pulls dozens of players into meaningful engagement. Seeding ~10 vetted leaders at launch sets the expectation: this server is **theatre with a thousand cast members**. The leaders are the anchors. The players write the rest.

---

## 9. Applications & Onboarding

### Whitelist
Frostfall is a whitelisted server. Discord serves as the application and community hub.

### General Applications
Standard character application — name, race, background, faction interest. Reviewed for basic lore literacy and RP intent.

### Tailored Applications (Key Roles)
Certain roles require demonstrated lore knowledge. The College of Winterhold is the clearest example: an applicant for a mage role should be able to explain, in their own words:

- Where magic comes from in TES
- How Daedra differ from Aedra
- What the Heart of Lorkhan is
- What a Dragon Break is
- How men and mer came to diverge

**Why:** A player who can answer these questions can *teach* other players in-character. The College's in-world lectures become genuine transmissions of lore. The application is a vetting mechanism and the knowledge becomes gameplay.

### Leadership Applications
Additional requirements:
- Demonstrated understanding of their faction's BBB document
- Agreement to the Leadership Covenant (§8)
- OOC interview for major seats (Jarl, faction head, etc.)

---

## 10. IC Lore Section

Short, immersive narrations published on the server's website/Discord/in-game. Purpose: give players the texture to RP authentically from day one without requiring them to read a wiki. Engaging and brief — no walls of text.

**Planned narration topics (draft list):**

- The White-Gold Concordat and what Skyrim gave up
- Ulfric Stormcloak: the man, the martyr, and the movement he left behind
- Ulfric's relationship with High King Torygg: *"He saw a boy who had been robbed, not an enemy"*
- The state of the Imperial Garrison: veterans of a war they feel they lost, holding a province they feel was sold
- The Thalmor and what they actually want (hint: it is not just Talos)
- The College of Winterhold and the question of magical freedom under the Concordat
- Why the Forsworn still fight
- The Nine — Eight — Divines: faith in a province that just lost one of its gods

---

## 11. Technical Architecture

### Foundation: SkyMP
Built on the SkyMP multiplayer framework for Skyrim Special Edition. Custom gameplay logic is implemented as a **TypeScript game mode** loaded by the SkyMP server.

**What SkyMP provides out of the box:**
| System | Status |
|--------|--------|
| Inventory sync (including gold/Septims) | Built-in |
| Death state & ragdoll | Built-in |
| Health / Magicka / Stamina | Built-in |
| Equipment & container sync | Built-in |
| Combat & damage calculation | Built-in |
| Character appearance sync | Built-in |
| Chat & React-based UI layer | Built-in |
| TypeScript game mode API + events | Built-in |

**What we build:**

| System | File | Notes |
|--------|------|-------|
| Economy / starter stipend | `economy.ts` | Drip-feed logic, septim management |
| Hunger | `hunger.ts` | 30-min tick, buff/debuff application |
| Drunk bar | `drunkBar.ts` | Alcohol tracking, visual effects |
| Housing / property | `housing.ts` | Purchase menu, ownership, spawn points, access control |
| Courier notifications | `courier.ts` | Async notification queue for Stewards/Jarls |
| Bounty system | `bounty.ts` | Per-hold bounties, KOID threshold flags |
| KOID rules | `koid.ts` | Faction-pair permissions, guard enforcement |
| Downed / captured | `combat.ts` | Downed state, loot limits, NVFL tracking |
| NVFL enforcement | `nvfl.ts` | Same-day tracking, hostility lockout, debuffs |
| Captivity / cuffs | `captivity.ts` | 24hr timer, auto-despawn |
| Prison routing | `prison.ts` | Arrest → Jarl queue system |
| Faction registry | `factions.ts` | BBB documents, membership, permissions |
| Hold resources | `resources.ts` | Hold-specific item availability |
| College study system | `college.ts` | Magicka leveling via study/teaching mechanics |
| Entry point | `index.ts` | Wires all systems together, event routing |

### Architecture: Option B — System-per-file, Flat Structure

One TypeScript file per system. A central `index.ts` wires them together via SkyMP's event API. No system reaches directly into another's internals — communication goes through defined events.

**Why:** Clean enough for a contributor who joins after launch to own a single file without needing to understand the whole codebase. Simple enough to ship. Extensible enough that any system can be isolated into a proper module later without restructuring everything else.

**Quality standard:** Given the potential for overnight viral growth, every file ships with enough inline documentation that a new contributor can understand its purpose, its inputs, and its outputs without asking. The codebase is presentable before the trailer drops.

---

*End of draft specification. Pending user review and approval before implementation planning begins.*
