# Frostfall Roleplay — Economy Design

> Full design document. Written 2026-04-17. Reference before planning any economy-related module.

---

## Philosophy

Three equally viable wealth paths:
1. **Crafting** — make goods, sell to other players
2. **Trade** — move goods between holds at a profit
3. **Services** — training, lectures, escorting, guarding

All three are inventory-grounded. No abstracted balances for goods — items exist in actual Skyrim inventory (via `mp.get(actorId, 'inventory')`). Physical transport is real: you carry goods on your person or in a cart.

**UBI:** 1,200 Septims over the first 12 active hours online (100/hr). This is the entry floor, not a living wage. It stops after 12 hours. Already implemented in `economy.ts`.

**Septim scale:** A room at a tavern costs ~10g/night. A loaf of bread should be ~2–3g. This calibrates everything else.

---

## Resource Extraction

Every production site uses the same mechanic:

```
Player enters site → works for [workTimeMs] → receives [outputItem] in actual inventory
```

Sites are **not exclusive** — multiple players can work simultaneously. Mines, farms, fisheries, apiaries, breweries, lumber camps all use the same work-timer model with different durations.

### Production Site Types

| Type | Work Time | Example Sites |
|---|---|---|
| Mine | ~30s | Iron-Breaker, Kolskeggr, Redbelly, Cidhna |
| Farm | ~2min | Pelagia Farm, Ivarstead fields, Katla's Farm |
| Fishery | ~60s | Riften hatchery, coastal docks |
| Apiary | ~3min | Goldenglow Estate apiary |
| Brewery | ~5min | Honningbrew Meadery, Black-Briar Meadery |
| Lumber | ~45s | Riverwood mill, Morthal sawmill, Dragon Bridge |

### Hold-by-Hold Production Map

| Hold | Capital | Primary Production | Notable Gaps |
|---|---|---|---|
| Whiterun | Whiterun | Wheat/veg (Pelagia, Chillfurrow, Battle-Born farms), mead (Honningbrew), iron (Halted Stream), lumber (Riverwood) | No silver/gold/quicksilver mines |
| The Rift | Riften | Fish (hatchery), honey (Goldenglow apiary), iron (Redbelly), crops (Ivarstead) | No quicksilver, limited luxury metals |
| The Pale | Dawnstar | Iron (Iron-Breaker), quicksilver (Quicksilver Mine), port fishing | **No crops, no brewery** — must import food |
| Eastmarch | Windhelm | Corundum (Steamscorch), iron (Kynesgrove), some fishing | Minimal farming |
| The Reach | Markarth | Silver (Cidhna), gold (Kolskeggr), iron (Left Hand) — most mineral-rich hold | Almost no food production |
| Haafingar | Solitude | Crops (Katla's Farm), lumber (Dragon Bridge), coastal fishing, trade port | No major mines nearby |
| Hjaalmarch | Morthal | Lumber (Morthal sawmill), marsh fishing | Sparse farming, no mining |
| Falkreath | Falkreath | Dense lumber, some farming, Soljund's sinkhole | Limited mineral variety |
| Winterhold | Winterhold | Ice fishing, **College magic services** | Almost no physical production — imports nearly everything |

### The Commodity Exchange (Price Floor)

Every hold has a government-run container that buys resources at a fixed low rate:
- Iron ore → 5g
- Wheat → 3g
- Fish → 2g
- Lumber → 2g
- Silver ore → 12g
- Gold ore → 20g
- Quicksilver → 15g
- Honey → 4g

This is the floor — always available, always lower than the open market. Exists so new players and casual players always have an income option. A miner does 30 seconds of work for 5g. Serious merchants earn more by selling player-to-player.

---

## The Shop System

### `/shop [shopId]` Command

Opens a trade UI (Red House has the WebSocket UI bridge for this — adapt their `sendMsg` system). The shop owner must initiate or approve the trade. On completion:

```
Gold exchanged → tax deducted at hold's rate for this business → remainder to seller
Tax amount → hold treasury
```

### Tax Mechanics

- Jarls and Stewards set per-business tax rates in-game
- Default rate: TBD (suggest 10%)
- Rate stored in `mp.set` — changeable at runtime without server restart
- Tax applies to **every gold transaction** at that shop
- Tax flows to **hold treasury balance**, not the Jarl's personal purse

### Hold Treasury

- Per-hold balance: `mp.set(0, 'ff_treasury_[holdId]', number)`
- Sources: shop taxes, property purchase escrow (on approval), fines from sentencing
- Withdrawals: Jarl/Steward only, via staff command
- Purpose: guard salaries, bounty rewards, infrastructure (roads, mine maintenance — RP layer)

---

## Property Purchase

### Pricing

Jarls or Stewards set a gold price per property in-game:
```
/property setprice [id] [amount]
```
Price visible in `/property list`. A null price means not currently for sale — Jarl must set a price before requests are accepted.

### Purchase Flow

```
Player: /property request [id]
    → Gold escrowed immediately (deducted from player, held separately)
    → Courier notification → Steward queue

Steward panel shows: requester name, property id, gold offered, timestamp
    → Steward surfaces to Jarl, or Jarl reviews directly

Jarl decision:
    Approve  → escrow transfers to hold treasury
               ownership transfers to player
               store.properties updated
               player notified via courier

    Summon   → escrow RETURNED to player immediately
               courier sends hearing notice to player
               player must physically appear at hold court within 24h
               Jarl approves or denies after RP hearing
               (no-show = auto-deny)

    Deny     → escrow RETURNED to player immediately
               request closed
               player notified via courier
```

**Smart players** skip the queue by finding the Jarl online directly. Jarl can approve on the spot with `/property approve [id] [player]` — usable anywhere, not just from the panel.

### Ownability by Site Type

| Property Type | Ownable | Notes |
|---|---|---|
| Home | Yes | Standard residential |
| Business (shop/forge/inn) | Yes | Generates taxed income |
| Mine | **No** | Public infrastructure, free access |
| Public farm (hold-owned) | No | Worked freely, commodity exchange only |
| Private farm (e.g. Pelagia) | Yes | Owner can set shop prices for output |
| Apiary (e.g. Goldenglow) | Yes | Black-Briar political history — RP flavour |
| Brewery (e.g. Honningbrew) | Yes | High-value business property |

---

## Cart / Transport System

Physical goods travel with players or in carts. Carts are actors created via `mp.createActor` with a cart form ID. Players load/unload goods from cart inventory.

**Rideable carts:** Skyrim has in-game animations and mod precedent. Whether SkyMP's current surface supports mounting a player to a moving actor needs a technical spike early — this is the most uncertain piece of the whole economy.

Backpacks: extended carry weight, likely implemented as an inventory item with a weight modifier property.

---

## The Crafting Economy

Skills gate crafting quality — smithing level determines which recipes are available AND forge tier must match. Both gates must be satisfied.

Smithing cap raised by Companions faction rank (`factions.ts`). Training sessions (`training.ts`) give 2× XP boost for 24h online time.

Red House's `COBJ.json` is the full recipe database. `cooking-COBJ.json` covers food. Both extracted from ESM via xelib — ready to use.

### Forge Tiers

| Tier | Location | Recipe Access |
|---|---|---|
| Basic | Dungeons, wilderness camps | Iron/leather gear, simple repairs |
| Standard | Owned city forges | Full common metals, most vanilla recipes |
| Master | Select city forges (1–2 per hold max) | Rare metals, highest-tier items |

Public forges exist in dungeons and wilderness — free to use, no owner. City forges are owned properties. Players request access via `/shop [shopId]` command. Owner approves. Access fee (e.g. 5g per session) set by owner.

### Material Dependency Chain

Full chain — every tier requires intermediate products from earlier steps.

**Raw extraction (production sites):**
```
Mine        → ore (iron, silver, gold, corundum, malachite, orichalcum, moonstone, ebony, quicksilver)
Lumber camp → firewood
Hunting     → hides → leather / leather strips
```

**First conversion (smelter + kiln — ownable structure attachments):**
```
3× iron ore           → 1 iron ingot         (any rank, smelter)
2× silver ore         → 1 silver ingot        (rank 1, smelter)
2× gold ore           → 1 gold ingot          (rank 1, smelter)
2× corundum ore       → 1 corundum ingot      (rank 1, smelter)
2× firewood           → 1 charcoal            (any rank, charcoal kiln)
iron ingot + charcoal → 1 steel ingot         (rank 2, smelter)
2× orichalcum ore     → 1 orichalcum ingot    (rank 2, smelter)
2× moonstone ore      → 1 refined moonstone   (rank 3, smelter)
2× malachite ore      → 1 refined malachite   (rank 3, smelter)
2× ebony ore          → 1 ebony ingot         (rank 4, smelter)
```

**Final output (forge, quality + rank gated):**
```
Iron ingot + leather strips → iron gear    (basic forge, rank 1)
Steel ingot                 → steel gear   (standard forge, rank 2)
Orichalcum + iron ingot     → orcish gear  (standard forge, rank 3)
Refined moonstone           → elven gear   (standard forge, rank 3)
Malachite + moonstone       → glass gear   (master forge, rank 4)
Ebony ingot                 → ebony gear   (master forge, rank 4)
Ebony ingot + daedra heart  → daedric gear (master forge, rank 5)
```

### Smelter Queue Mechanic

- Smelter is an **attachment to an owned forge property**, not a standalone property
- Owner charges 5g per piece to use (via shop access request)
- Player loads ore into smelter queue
- Smelter auto-processes every 60 seconds, outputs ingots
- Conversion is intentionally lossy (3 ore → 1 ingot) — the loss is the cost of the service
- Commodity floor: 10g per ingot (market price will be higher)

### Property Structure Attachments

Structures are attached to owned properties, not separate purchasable entities:

| Attachment | Function | Property Type |
|---|---|---|
| Smelter | Ore → ingot queue, 60s auto-cycle | Forge property |
| Charcoal kiln | Firewood → charcoal | Lumber or forge property |
| Tanning rack | Hides → leather/leather strips | Any property |
| Alchemy lab | Ingredient → potion (skill-gated) | Any property |
| Enchanting table | Item + soul gem → enchanted item | Any property |

Owner unlocks the attachment. Other players request access via `/shop`.

### Geographic Dependencies

Every hold depends on at least one other for core materials:
- **The Pale**: iron + quicksilver, but no food and no lumber — can't make steel without a charcoal trade partner
- **The Reach**: best metals (silver, gold, iron) but almost no food — must import
- **Falkreath**: firewood/charcoal supply, but no quality forge — needs a smith partner
- **Winterhold**: produces almost nothing physical — pure magic/service economy
- **Whiterun**: breadbasket + iron, but no silver/gold/rare metals — smith hub that needs imports for high-tier work

---

## Instancing / Tavern Rooms

Interior cells from Red House's `coc-markers.json` provide coordinates for every named interior in Skyrim. Instancing works by placing a player's actor in an interior cell via `createActor` or teleport.

**Tavern room rental:**
- Player pays 10g/night to innkeeper (player-owned business)
- Server places player in a private instance of the inn interior cell
- Other players in the same exterior hold can also rent rooms — they go into the same cell or a separate instance depending on design choice
- If the inn is player-owned, the 10g (minus hold tax) goes to the innkeeper's business income

---

## Red House Assets to Reuse

| Asset | Location | How We Use It |
|---|---|---|
| `coc-markers.json` | `server/data/xelib/` | Cell coordinates for instancing, mine/farm locations |
| `COBJ.json` | `server/data/xelib/` | Smithing recipe database for crafting validation |
| `cooking-COBJ.json` | `server/data/xelib/` | Food crafting recipes |
| `KYWD.json` | `server/data/xelib/` | Item keyword classification |
| `chat.ts` + WebSocket UI | `server-build/src/` | Proximity chat + shop trade UI bridge |
| Spawn system | `server-build/src/systems/spawn.ts` | Actor creation, race menu, reconnect |
| Login system | `server-build/src/systems/login.ts` | skymp.io master auth |

Credit Red House publicly. Open-source Frostfall under the same terms.

---

## Planned Modules (Economy Layer)

These follow Plan 9 (governance/staff commands). Suggested order:

| Plan | Modules | Depends On |
|---|---|---|
| Plan 10 | `holdTreasury.ts`, extend `housing.ts` (setprice, escrow, summons/hearing/deny) | Plan 9 (leader commands) |
| Plan 11 | `production.ts` (unified work-timer extraction for all site types), commodity exchange containers | `housing.ts`, `economy.ts` |
| Plan 12 | `shop.ts` (trade UI via Red House WebSocket bridge, tax deduction, forge/structure access requests) | `holdTreasury.ts`, `production.ts` |
| Plan 13 | `crafting.ts` (full material chain, smelter queue, kiln, forge tier + rank gating, XP on craft) | `skills.ts`, `shop.ts`, COBJ.json |
| Plan 14 | `instancing.ts` (cell teleport, tavern room rental, mine instancing) | `housing.ts`, `economy.ts`, coc-markers.json |
| Plan 15 | `transport.ts` (cart actors, load/unload inventory, rideable spike) | All economy modules |

---

## Open Questions (resolve before planning each module)

- **Cart rideable:** Does SkyMP support mounting player to a moving cart actor? Needs early technical spike — most uncertain piece of the whole economy.
- **Farm work model:** RESOLVED — see Resolved section.
- **Hearing timeout:** RESOLVED — see Resolved section.
- **Brewery output:** RESOLVED — see Resolved section.
- **Wheat/flour/brewing numbers:** RESOLVED — see Resolved section.
- **Black-Briar / berry brewing:** RESOLVED — see Resolved section.
- **Smelter/attachment unlocking:** RESOLVED — see Resolved section.
- **Forge/structure access fee:** RESOLVED — player-managed, not coded. See Resolved section.

## Resolved Questions

- **Crafting at public vs. owned forge:** Public forges (dungeons, wilderness) are free, no owner cut. Owned city forges require access request via `/shop` — owner sets fee and approves.
- **Forge quality tiers:** Basic (dungeons), Standard (city), Master (1–2 per hold). Both forge tier AND smithing rank must be satisfied to execute a recipe.
- **Property purchase flow:** Gold-denominated, goes through Steward panel to Jarl. Three outcomes: Approve (gold to treasury), Summon (gold returned, player summoned to court), Deny (gold returned). Smart players go directly to the Jarl online.
- **Treasury model:** Hold treasury balance, not Jarl's personal purse. Sources: shop taxes, property purchases, sentencing fines. Jarl/Steward withdraw via staff command.
- **Escrow on summons/denial:** Gold returns to player immediately on summons or denial. Only transfers to treasury on approval.
- **Brewery system (full):**
  - *Passive ale*: 1 cask/day automatic, no ingredients. 1 cask = 10 bottles. Refills inn stock baseline.
  - *Manual brew*: 1 hour online time per activator barrel. Yields 3 casks = 30 bottles. Rewards being online.
  - *Honningbrew Mead* (Whiterun): 10 honey + 10 flour per batch. Minor health buff + elevated drunk bar. Honey from Goldenglow apiary (Rift) or traded. Flour from milling wheat.
  - *Black-Briar Reserve* (Riften): any berry type per batch (jazbay grapes, snowberries, juniper berries, etc.). Buff: **magicka regen**. Ideal for College mages — creates a natural Riften → Winterhold trade corridor. Frozen Hearth Inn stocks it; mages buy pre-dungeon. "Any berry" gives Rift foragers a reliable buyer. Mostly self-contained Rift supply chain.
  - Riften also has apiaries — honey available locally for any future use.
- **Wheat/flour economy:**
  - Public fields: cap 100, replenish to 100 every 90 minutes. Per-player take limit: 10 wheat per 4 IRL hours — forces spreading out or buying.
  - Owned farm wheat spawner: 50/day, refills once per 24h, exclusive to owner. Sellable en masse.
  - Mill grinds wheat → flour (vanilla activatable). No rank required — anyone can mill.
  - Milling is a viable low-skill service job: buy bulk wheat from farm owners, sell flour to breweries/cooks.
- **Hearing timeout:** 72h wall-clock from moment of summons. Player must physically appear at hold court within that window — auto-deny triggers at 72h if they never showed. Showing up fulfills the summons even if the Jarl is offline; player can wait. Jarl panel shows "Player X present, awaiting hearing." No auto-resolution if player showed up but Jarl hasn't held the hearing — that's on the Jarl.
- **Smelter/attachment unlocking:** Attachments (smelter, kiln, tanning rack, alchemy lab, enchanting table) are a one-time purchase cost to add to a property permanently. Forge tier (basic/standard/master) is fixed by location — cannot be upgraded. What you see is what you get for the forge itself.
- **Forge/structure access:** Panel is approve/deny only. No coded fee — owner handles pricing via normal player interaction (player pays via `/pay` before owner approves, or it's free). Player agency, not scripted enforcement.
- **Material chain:** Full dependency chain — ore → smelter → ingot → forge → gear. Steel requires charcoal (from kiln) + iron ingot + rank 2. Every hold depends on at least one other for core materials.
- **Farm work model (two-tier):**
  - *Public wheat fields* (Pelagia, Chillfurrow, etc.) — passive, auto-replenish to cap of 100 wheat every 24h real-time. Free access, no ownership. Mill grinds wheat → flour (vanilla activatable). Feeds the server baseline without requiring a player farmer online.
  - *Private garden plots* (owned properties only, Hearthfire-style) — plant seed (consumed, lasts 3 harvests), grow timer (real-time delay TBD), harvest when ready. Applies to non-wheat crops: cabbage, potatoes, leeks, gourds, snowberries, etc. Seeds are tradeable. Gives cook/homeowner a production edge over commodity wheat.
