# Plan 7: Skill Caps + Training System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-skill progression system where skills have low default XP caps, faction rank raises those caps, and attending teacher-led in-person training grants a 2× XP multiplier that drains over 24h of actual online time (not wall-clock).

**Architecture:** Skills are server-side custom values stored via `mp.set`, invisible to Skyrim's native skill system. Skill caps are pure functions of faction membership — no extra stored state. Training sessions are in-memory like lecture sessions. Study boosts persist across disconnects by storing remaining online-milliseconds in `mp.set`, updated on every disconnect event.

**Tech Stack:** TypeScript, Jest/ts-jest, SkyMP `mp.set`, existing `PlayerStore` / `EventBus` / `makeProperty` patterns.

---

## File Map

| File | Action |
|------|--------|
| `gamemode/src/types/index.ts` | Modify — add `SkillId`, 2 new `GameEventType` values |
| `gamemode/src/skills.ts` | Create — XP storage, cap derivation, boost management, online-time tracking |
| `gamemode/src/training.ts` | Create — in-person training sessions, location check, boost distribution |
| `gamemode/src/index.ts` | Modify — wire `initSkills`, `initTraining` |
| `gamemode/tests/skills.test.ts` | Create |
| `gamemode/tests/training.test.ts` | Create |
| `CHANGELOG.md` | Modify |

---

## Task 1 — Update types/index.ts

**Files:**
- Modify: `gamemode/src/types/index.ts`

- [ ] **Step 1: Add `SkillId` after the `CollegeRank` line**

```typescript
export const SKILL_IDS = [
  'destruction', 'restoration', 'alteration', 'conjuration', 'illusion',
  'smithing', 'enchanting', 'alchemy',
] as const;

export type SkillId = typeof SKILL_IDS[number];
```

- [ ] **Step 2: Add 2 values to `GameEventType`**

```typescript
  | 'trainingStarted'
  | 'trainingEnded'
```

- [ ] **Step 3: Run the existing test suite — expect all to still pass**

```
cd gamemode && npm test
```

Expected: all tests green, no new failures.

- [ ] **Step 4: Commit**

```
git add gamemode/src/types/index.ts
git commit -m "types: add SkillId and training event types"
```

---

## Task 2 — skills.ts

**Files:**
- Create: `gamemode/src/skills.ts`
- Create: `gamemode/tests/skills.test.ts`

### Constants and types

```typescript
import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, FactionId, SkillId, SKILL_IDS } from './types';
import { getPlayerMemberships } from './factions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** XP per skill level. Skill level = Math.floor(xp / SKILL_LEVEL_XP). */
export const SKILL_LEVEL_XP = 10;

/** XP cap for a skill with no faction bonuses. */
export const DEFAULT_SKILL_CAP: Record<SkillId, number> = {
  destruction:  250,
  restoration:  250,
  alteration:   250,
  conjuration:  250,
  illusion:     250,
  smithing:     250,
  enchanting:   250,
  alchemy:      250,
};

/**
 * Per-faction cap overrides, keyed by FactionId.
 * Each entry is a list of { minRank, caps } sorted ascending by minRank.
 * The highest applicable tier wins.
 */
export const FACTION_SKILL_CAP_BONUSES: Partial<Record<FactionId, Array<{
  minRank: number;
  caps: Partial<Record<SkillId, number>>;
}>>> = {
  collegeOfWinterhold: [
    { minRank: 1, caps: { destruction: 500, restoration: 500, alteration: 500, conjuration: 500, illusion: 500 } },
    { minRank: 2, caps: { destruction: 750, restoration: 750, alteration: 750, conjuration: 750, illusion: 750 } },
    { minRank: 3, caps: { destruction: 1000, restoration: 1000, alteration: 1000, conjuration: 1000, illusion: 1000 } },
  ],
  companions: [
    { minRank: 1, caps: { smithing: 500 } },
    { minRank: 2, caps: { smithing: 750 } },
    { minRank: 3, caps: { smithing: 1000 } },
  ],
  eastEmpireCompany: [
    { minRank: 1, caps: { smithing: 500, enchanting: 500, alchemy: 500 } },
    { minRank: 2, caps: { smithing: 750, enchanting: 750, alchemy: 750 } },
  ],
  thievesGuild: [
    { minRank: 1, caps: { alchemy: 500 } },
    { minRank: 2, caps: { alchemy: 750 } },
  ],
  bardsCollege: [
    { minRank: 1, caps: { enchanting: 500 } },
    { minRank: 2, caps: { enchanting: 750 } },
  ],
};

export interface StudyBoost {
  skillId: SkillId;
  multiplier: number;
  /** Online-milliseconds remaining before this boost expires. */
  remainingOnlineMs: number;
}

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

const XP_KEY    = 'ff_skill_xp';
const BOOST_KEY = 'ff_study_boosts';

// ---------------------------------------------------------------------------
// In-memory session start tracking (for online-time drain)
// ---------------------------------------------------------------------------

const sessionStartMs = new Map<PlayerId, number>();

export function _recordSessionStart(playerId: PlayerId, now = Date.now()): void {
  sessionStartMs.set(playerId, now);
}

export function _getSessionOnlineMs(playerId: PlayerId, now = Date.now()): number {
  const start = sessionStartMs.get(playerId);
  return start !== undefined ? now - start : 0;
}

/** Drain elapsed online time from all boosts for a player, then reset session start. */
export function _consumeBoostTime(mp: Mp, playerId: PlayerId, now = Date.now()): void {
  const elapsed = _getSessionOnlineMs(playerId, now);
  if (elapsed <= 0) return;
  const boosts = _loadBoosts(mp, playerId);
  const updated = boosts
    .map(b => ({ ...b, remainingOnlineMs: b.remainingOnlineMs - elapsed }))
    .filter(b => b.remainingOnlineMs > 0);
  mp.set(playerId, BOOST_KEY, updated);
  sessionStartMs.set(playerId, now);
}

export function onSkillPlayerDisconnect(mp: Mp, playerId: PlayerId, now = Date.now()): void {
  _consumeBoostTime(mp, playerId, now);
  sessionStartMs.delete(playerId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _loadXp(mp: Mp, playerId: PlayerId): Partial<Record<SkillId, number>> {
  return (mp.get(playerId, XP_KEY) as Partial<Record<SkillId, number>>) ?? {};
}

function _loadBoosts(mp: Mp, playerId: PlayerId): StudyBoost[] {
  return (mp.get(playerId, BOOST_KEY) as StudyBoost[]) ?? [];
}

// ---------------------------------------------------------------------------
// Public API — pure functions
// ---------------------------------------------------------------------------

/** Derive skill level from XP. */
export function getSkillLevel(xp: number): number {
  return Math.floor(xp / SKILL_LEVEL_XP);
}

// ---------------------------------------------------------------------------
// Public API — requires mp
// ---------------------------------------------------------------------------

export function getSkillXp(mp: Mp, playerId: PlayerId, skillId: SkillId): number {
  return _loadXp(mp, playerId)[skillId] ?? 0;
}

/**
 * Derive the XP cap for a skill from the player's faction memberships.
 * Takes the highest cap offered by any faction they belong to at their current rank.
 */
export function getSkillCap(mp: Mp, store: PlayerStore, playerId: PlayerId, skillId: SkillId): number {
  const memberships = getPlayerMemberships(mp, store, playerId);
  let cap = DEFAULT_SKILL_CAP[skillId];
  for (const m of memberships) {
    const tiers = FACTION_SKILL_CAP_BONUSES[m.factionId];
    if (!tiers) continue;
    for (const tier of [...tiers].reverse()) {
      if (m.rank >= tier.minRank) {
        const bonus = tier.caps[skillId];
        if (bonus !== undefined && bonus > cap) cap = bonus;
        break;
      }
    }
  }
  return cap;
}

/**
 * Add XP to a skill, capped by faction rank.
 * Applies any active study boost multiplier.
 * Returns the actual XP added (may be less than baseXp if near cap).
 */
export function addSkillXp(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  skillId: SkillId,
  baseXp: number,
  now = Date.now(),
): number {
  if (!store.get(playerId)) return 0;
  const boost = getActiveStudyBoost(mp, playerId, skillId, now);
  const xpToAdd = Math.floor(baseXp * (boost ? boost.multiplier : 1.0));
  const cap = getSkillCap(mp, store, playerId, skillId);
  const current = getSkillXp(mp, playerId, skillId);
  const actual = Math.min(xpToAdd, cap - current);
  if (actual <= 0) return 0;
  const xpMap = _loadXp(mp, playerId);
  xpMap[skillId] = current + actual;
  mp.set(playerId, XP_KEY, xpMap);
  return actual;
}

export function getStudyBoosts(mp: Mp, playerId: PlayerId): StudyBoost[] {
  return _loadBoosts(mp, playerId);
}

/**
 * Return active boost for a specific skill, consuming elapsed online time first.
 * Returns null if no boost or boost has expired.
 */
export function getActiveStudyBoost(
  mp: Mp,
  playerId: PlayerId,
  skillId: SkillId,
  now = Date.now(),
): StudyBoost | null {
  _consumeBoostTime(mp, playerId, now);
  return _loadBoosts(mp, playerId).find(b => b.skillId === skillId) ?? null;
}

/**
 * Grant a study boost. Overwrites any existing boost for the same skill.
 * Does not consume existing session time — boost starts fresh.
 */
export function grantStudyBoost(
  mp: Mp,
  playerId: PlayerId,
  skillId: SkillId,
  multiplier: number,
  onlineMs: number,
): void {
  const boosts = _loadBoosts(mp, playerId).filter(b => b.skillId !== skillId);
  boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs });
  mp.set(playerId, BOOST_KEY, boosts);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initSkills(mp: Mp, store: PlayerStore, bus: EventBus): void {
  mp.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  });
  mp.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  });

  bus.on('playerJoined', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    _recordSessionStart(playerId);
  });

  bus.on('playerLeft', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    onSkillPlayerDisconnect(mp, playerId);
  });
}
```

- [ ] **Step 1: Write the file**

Create `gamemode/src/skills.ts` with the full content above.

- [ ] **Step 2: Write `gamemode/tests/skills.test.ts`**

```typescript
import {
  getSkillLevel,
  getSkillXp,
  getSkillCap,
  addSkillXp,
  grantStudyBoost,
  getActiveStudyBoost,
  getStudyBoosts,
  _consumeBoostTime,
  _recordSessionStart,
  onSkillPlayerDisconnect,
  DEFAULT_SKILL_CAP,
  SKILL_LEVEL_XP,
  FACTION_SKILL_CAP_BONUSES,
} from '../src/skills';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';
import { joinFaction } from '../src/factions';

function makeMp(): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => storage[`${actorId}:${key}`]),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup() {
  const mp = makeMp();
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Brelyna');
  store.registerPlayer(2, 0xff000002, 'Onmund');
  return { mp, store, bus };
}

// ---------------------------------------------------------------------------
// getSkillLevel — pure
// ---------------------------------------------------------------------------

describe('getSkillLevel', () => {
  it('returns 0 at 0 XP', () => {
    expect(getSkillLevel(0)).toBe(0);
  });
  it('returns 0 below first threshold', () => {
    expect(getSkillLevel(SKILL_LEVEL_XP - 1)).toBe(0);
  });
  it('returns 1 at exactly SKILL_LEVEL_XP', () => {
    expect(getSkillLevel(SKILL_LEVEL_XP)).toBe(1);
  });
  it('returns 24 at 249 XP', () => {
    expect(getSkillLevel(249)).toBe(24);
  });
  it('returns 25 at 250 XP', () => {
    expect(getSkillLevel(250)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// getSkillXp
// ---------------------------------------------------------------------------

describe('getSkillXp', () => {
  it('returns 0 for a new player', () => {
    const { mp } = setup();
    expect(getSkillXp(mp, 1, 'destruction')).toBe(0);
  });
  it('returns accumulated value after addSkillXp', () => {
    const { mp, store } = setup();
    addSkillXp(mp, store, 1, 'destruction', 15);
    expect(getSkillXp(mp, 1, 'destruction')).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// getSkillCap
// ---------------------------------------------------------------------------

describe('getSkillCap', () => {
  it('returns DEFAULT_SKILL_CAP when player has no factions', () => {
    const { mp, store } = setup();
    expect(getSkillCap(mp, store, 1, 'destruction')).toBe(DEFAULT_SKILL_CAP.destruction);
  });

  it('returns raised cap when player is in College at rank 1', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'collegeOfWinterhold', 1);
    expect(getSkillCap(mp, store, 1, 'destruction')).toBe(500);
  });

  it('returns highest cap when player has rank 3', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'collegeOfWinterhold', 3);
    expect(getSkillCap(mp, store, 1, 'destruction')).toBe(1000);
  });

  it('does not raise a cap for a skill not covered by that faction', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'collegeOfWinterhold', 3);
    // College covers magic skills, not smithing
    expect(getSkillCap(mp, store, 1, 'smithing')).toBe(DEFAULT_SKILL_CAP.smithing);
  });

  it('takes highest cap when player is in multiple factions', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 1);       // smithing → 500
    joinFaction(mp, store, bus, 1, 'eastEmpireCompany', 2); // smithing → 750
    expect(getSkillCap(mp, store, 1, 'smithing')).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// addSkillXp
// ---------------------------------------------------------------------------

describe('addSkillXp', () => {
  it('returns 0 for unknown player', () => {
    const { mp, store } = setup();
    expect(addSkillXp(mp, store, 999, 'destruction', 50)).toBe(0);
  });

  it('adds XP and returns actual amount added', () => {
    const { mp, store } = setup();
    const added = addSkillXp(mp, store, 1, 'destruction', 50);
    expect(added).toBe(50);
    expect(getSkillXp(mp, 1, 'destruction')).toBe(50);
  });

  it('accumulates across multiple calls', () => {
    const { mp, store } = setup();
    addSkillXp(mp, store, 1, 'destruction', 30);
    addSkillXp(mp, store, 1, 'destruction', 20);
    expect(getSkillXp(mp, 1, 'destruction')).toBe(50);
  });

  it('caps at DEFAULT_SKILL_CAP when no faction', () => {
    const { mp, store } = setup();
    addSkillXp(mp, store, 1, 'destruction', DEFAULT_SKILL_CAP.destruction + 100);
    expect(getSkillXp(mp, 1, 'destruction')).toBe(DEFAULT_SKILL_CAP.destruction);
  });

  it('returns actual XP added, not requested, when near cap', () => {
    const { mp, store } = setup();
    addSkillXp(mp, store, 1, 'destruction', DEFAULT_SKILL_CAP.destruction - 5);
    const added = addSkillXp(mp, store, 1, 'destruction', 50);
    expect(added).toBe(5);
  });

  it('applies active study boost multiplier', () => {
    const { mp, store } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 60_000);
    addSkillXp(mp, store, 1, 'destruction', 10, 1000);
    expect(getSkillXp(mp, 1, 'destruction')).toBe(20);
  });

  it('does not apply boost to a different skill', () => {
    const { mp, store } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 60_000);
    addSkillXp(mp, store, 1, 'restoration', 10, 1000);
    expect(getSkillXp(mp, 1, 'restoration')).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// grantStudyBoost
// ---------------------------------------------------------------------------

describe('grantStudyBoost', () => {
  it('stores a boost', () => {
    const { mp } = setup();
    grantStudyBoost(mp, 1, 'smithing', 2.0, 50_000);
    const boosts = getStudyBoosts(mp, 1);
    expect(boosts).toHaveLength(1);
    expect(boosts[0]).toMatchObject({ skillId: 'smithing', multiplier: 2.0, remainingOnlineMs: 50_000 });
  });

  it('overwrites an existing boost for the same skill', () => {
    const { mp } = setup();
    grantStudyBoost(mp, 1, 'smithing', 2.0, 50_000);
    grantStudyBoost(mp, 1, 'smithing', 1.5, 30_000);
    const boosts = getStudyBoosts(mp, 1);
    expect(boosts).toHaveLength(1);
    expect(boosts[0].remainingOnlineMs).toBe(30_000);
  });

  it('stores boosts for different skills independently', () => {
    const { mp } = setup();
    grantStudyBoost(mp, 1, 'smithing', 2.0, 50_000);
    grantStudyBoost(mp, 1, 'enchanting', 2.0, 40_000);
    expect(getStudyBoosts(mp, 1)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getActiveStudyBoost
// ---------------------------------------------------------------------------

describe('getActiveStudyBoost', () => {
  it('returns null when no boost exists', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    expect(getActiveStudyBoost(mp, 1, 'destruction', 1000)).toBeNull();
  });

  it('returns boost when online time has not elapsed', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 60_000);
    expect(getActiveStudyBoost(mp, 1, 'destruction', 1_000)).not.toBeNull();
  });

  it('returns null after remainingOnlineMs is exhausted', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 5_000);
    // 10 seconds online — boost had 5s remaining
    expect(getActiveStudyBoost(mp, 1, 'destruction', 10_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// _consumeBoostTime
// ---------------------------------------------------------------------------

describe('_consumeBoostTime', () => {
  it('drains remainingOnlineMs by elapsed session time', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'smithing', 2.0, 60_000);
    _consumeBoostTime(mp, 1, 10_000);
    const boosts = getStudyBoosts(mp, 1);
    expect(boosts[0].remainingOnlineMs).toBe(50_000);
  });

  it('removes boosts that reach zero', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'smithing', 2.0, 5_000);
    _consumeBoostTime(mp, 1, 10_000);
    expect(getStudyBoosts(mp, 1)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// onSkillPlayerDisconnect
// ---------------------------------------------------------------------------

describe('onSkillPlayerDisconnect', () => {
  it('persists consumed boost time on disconnect', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 60_000);
    onSkillPlayerDisconnect(mp, 1, 30_000);
    const boosts = getStudyBoosts(mp, 1);
    expect(boosts[0].remainingOnlineMs).toBe(30_000);
  });

  it('removes expired boosts on disconnect', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 5_000);
    onSkillPlayerDisconnect(mp, 1, 10_000);
    expect(getStudyBoosts(mp, 1)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run skills tests — expect all to fail (functions not yet written)**

```
cd gamemode && npm test -- --testPathPattern="skills"
```

Expected: FAIL — import errors.

- [ ] **Step 4: Write `gamemode/src/skills.ts`** with the implementation shown above in the constants/types block.

- [ ] **Step 5: Run skills tests — expect all to pass**

```
cd gamemode && npm test -- --testPathPattern="skills"
```

Expected: all green.

- [ ] **Step 6: Run full suite — expect no regressions**

```
cd gamemode && npm test
```

- [ ] **Step 7: Commit**

```
git add gamemode/src/skills.ts gamemode/tests/skills.test.ts
git commit -m "feat: skill XP tracking, cap derivation, and study boosts"
```

---

## Task 3 — training.ts

**Files:**
- Create: `gamemode/src/training.ts`
- Create: `gamemode/tests/training.test.ts`

### Implementation

```typescript
import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, SkillId } from './types';
import { grantStudyBoost } from './skills';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** XP multiplier granted to attendees of a training session. */
export const TRAINING_BOOST_MULTIPLIER = 2.0;

/**
 * Online-milliseconds the boost lasts.
 * 24 IRL hours of time spent actually connected.
 */
export const TRAINING_BOOST_ONLINE_MS = 24 * 60 * 60 * 1000;

/**
 * Max Skyrim-unit distance between trainer and student for /train join.
 * Roughly 70 metres — close enough to be "in the room".
 */
export const TRAINING_LOCATION_RADIUS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingSession {
  trainerId: PlayerId;
  skillId: SkillId;
  startedAt: number;
  attendees: PlayerId[];
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const activeSessions = new Map<PlayerId, TrainingSession>();

export function _resetTrainingSessions(): void {
  activeSessions.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function distance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a training session for a skill.
 * Returns false if: unknown player, or trainer already has an active session.
 */
export function startTraining(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  trainerId: PlayerId,
  skillId: SkillId,
): boolean {
  if (!store.get(trainerId)) return false;
  if (activeSessions.has(trainerId)) return false;
  activeSessions.set(trainerId, { trainerId, skillId, startedAt: Date.now(), attendees: [] });
  bus.dispatch({ type: 'trainingStarted', payload: { trainerId, skillId }, timestamp: Date.now() });
  return true;
}

/**
 * Join a training session.
 * Returns false if: unknown player, no active session for trainer,
 * player is the trainer, already attending, or out of location range.
 */
export function joinTraining(
  mp: Mp,
  store: PlayerStore,
  _bus: EventBus,
  playerId: PlayerId,
  trainerId: PlayerId,
): boolean {
  if (!store.get(playerId)) return false;
  const session = activeSessions.get(trainerId);
  if (!session) return false;
  if (playerId === trainerId) return false;
  if (session.attendees.includes(playerId)) return false;

  const trainerPos = mp.get(store.get(trainerId)!.actorId, 'pos') as { x: number; y: number; z: number } | null;
  const attendeePos = mp.get(store.get(playerId)!.actorId, 'pos') as { x: number; y: number; z: number } | null;
  if (!trainerPos || !attendeePos) return false;
  if (distance(trainerPos, attendeePos) > TRAINING_LOCATION_RADIUS) return false;

  session.attendees.push(playerId);
  return true;
}

/**
 * End a training session and distribute study boosts to attendees.
 * Returns false if no active session.
 */
export function endTraining(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  trainerId: PlayerId,
): boolean {
  const session = activeSessions.get(trainerId);
  if (!session) return false;

  for (const attendeeId of session.attendees) {
    grantStudyBoost(mp, attendeeId, session.skillId, TRAINING_BOOST_MULTIPLIER, TRAINING_BOOST_ONLINE_MS);
  }

  bus.dispatch({
    type: 'trainingEnded',
    payload: { trainerId, skillId: session.skillId, attendeeCount: session.attendees.length },
    timestamp: Date.now(),
  });

  activeSessions.delete(trainerId);
  return true;
}

export function getActiveTraining(trainerId: PlayerId): TrainingSession | null {
  return activeSessions.get(trainerId) ?? null;
}

export function initTraining(_mp: Mp, _store: PlayerStore, _bus: EventBus): void {
  // Sessions are in-memory only — no init work needed.
  // Wire /train start|join|end commands here once the command layer is built.
}
```

- [ ] **Step 1: Write `gamemode/tests/training.test.ts`**

```typescript
import {
  startTraining,
  joinTraining,
  endTraining,
  getActiveTraining,
  TRAINING_BOOST_MULTIPLIER,
  TRAINING_BOOST_ONLINE_MS,
  TRAINING_LOCATION_RADIUS,
  _resetTrainingSessions,
} from '../src/training';
import { getStudyBoosts } from '../src/skills';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(positions: Record<number, { x: number; y: number; z: number }> = {}): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => {
      if (key === 'pos') return positions[actorId] ?? null;
      return storage[`${actorId}:${key}`];
    }),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup(positions: Record<number, { x: number; y: number; z: number }> = {}) {
  const mp = makeMp(positions);
  const store = new PlayerStore();
  const bus = new EventBus();
  // actorIds: trainer=0xff000001, student1=0xff000002, student2=0xff000003
  store.registerPlayer(1, 0xff000001, 'Colette');
  store.registerPlayer(2, 0xff000002, 'Onmund');
  store.registerPlayer(3, 0xff000003, 'Brelyna');
  return { mp, store, bus };
}

const NEAR  = { x: 0, y: 0, z: 0 };
const CLOSE = { x: 100, y: 0, z: 0 };
const FAR   = { x: TRAINING_LOCATION_RADIUS + 1, y: 0, z: 0 };

beforeEach(() => _resetTrainingSessions());

// ---------------------------------------------------------------------------
// startTraining
// ---------------------------------------------------------------------------

describe('startTraining', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(startTraining(mp, store, bus, 999, 'destruction')).toBe(false);
  });

  it('creates a session and returns true', () => {
    const { mp, store, bus } = setup();
    expect(startTraining(mp, store, bus, 1, 'destruction')).toBe(true);
    expect(getActiveTraining(1)).not.toBeNull();
  });

  it('dispatches trainingStarted', () => {
    const { mp, store, bus } = setup();
    const events: any[] = [];
    bus.on('trainingStarted', e => events.push(e));
    startTraining(mp, store, bus, 1, 'destruction');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ trainerId: 1, skillId: 'destruction' });
  });

  it('returns false if trainer already has an active session', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'destruction');
    expect(startTraining(mp, store, bus, 1, 'restoration')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// joinTraining
// ---------------------------------------------------------------------------

describe('joinTraining', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 999, 1)).toBe(false);
  });

  it('returns false when no active session', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('returns false if player is the trainer', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 1, 1)).toBe(false);
  });

  it('returns false if already attending', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('returns false if player is out of range', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: FAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('adds player to attendees when in range', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(true);
    expect(getActiveTraining(1)!.attendees).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// endTraining
// ---------------------------------------------------------------------------

describe('endTraining', () => {
  it('returns false when no active session', () => {
    const { mp, store, bus } = setup();
    expect(endTraining(mp, store, bus, 1)).toBe(false);
  });

  it('grants study boost to each attendee', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE, [0xff000003]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    joinTraining(mp, store, bus, 3, 1);
    endTraining(mp, store, bus, 1);
    expect(getStudyBoosts(mp, 2).find(b => b.skillId === 'destruction')).toMatchObject({
      multiplier: TRAINING_BOOST_MULTIPLIER,
      remainingOnlineMs: TRAINING_BOOST_ONLINE_MS,
    });
    expect(getStudyBoosts(mp, 3).find(b => b.skillId === 'destruction')).not.toBeUndefined();
  });

  it('does not grant boost to trainer', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    endTraining(mp, store, bus, 1);
    expect(getStudyBoosts(mp, 1)).toHaveLength(0);
  });

  it('dispatches trainingEnded with correct attendeeCount', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    const events: any[] = [];
    bus.on('trainingEnded', e => events.push(e));
    endTraining(mp, store, bus, 1);
    expect(events[0].payload).toMatchObject({ trainerId: 1, skillId: 'destruction', attendeeCount: 1 });
  });

  it('removes the session', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'destruction');
    endTraining(mp, store, bus, 1);
    expect(getActiveTraining(1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getActiveTraining
// ---------------------------------------------------------------------------

describe('getActiveTraining', () => {
  it('returns null before session starts', () => {
    expect(getActiveTraining(1)).toBeNull();
  });
  it('returns session after start', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'alchemy');
    expect(getActiveTraining(1)).toMatchObject({ trainerId: 1, skillId: 'alchemy' });
  });
  it('returns null after session ends', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'alchemy');
    endTraining(mp, store, bus, 1);
    expect(getActiveTraining(1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run training tests — expect all to fail**

```
cd gamemode && npm test -- --testPathPattern="training"
```

Expected: FAIL — import errors.

- [ ] **Step 3: Write `gamemode/src/training.ts`** with the full implementation above.

- [ ] **Step 4: Run training tests — expect all to pass**

```
cd gamemode && npm test -- --testPathPattern="training"
```

- [ ] **Step 5: Run full suite — expect no regressions**

```
cd gamemode && npm test
```

- [ ] **Step 6: Commit**

```
git add gamemode/src/training.ts gamemode/tests/training.test.ts
git commit -m "feat: training sessions with location check and online-time study boosts"
```

---

## Task 4 — Wire and CHANGELOG

**Files:**
- Modify: `gamemode/src/index.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add imports to `gamemode/src/index.ts`**

```typescript
import { initSkills } from './skills';
import { initTraining } from './training';
```

- [ ] **Step 2: Add init calls after `initCollege`**

```typescript
initSkills(mp, store, bus);
initTraining(mp, store, bus);
```

- [ ] **Step 3: Add CHANGELOG entry**

Under a new `[0.7.0]` heading:

```markdown
## [0.7.0] — 2026-04-17

### Added
- `skills.ts` — per-skill XP tracking with faction-rank-derived caps. Default cap 250 XP (~skill level 25). College membership raises magic skill caps to 500/750/1000 at ranks 1/2/3. Companions and EEC raise smithing/crafting equivalently. Cap derivation is a pure function of faction memberships — no extra stored state.
- `training.ts` — in-person training sessions. Trainer runs `/train start [skill]`, nearby players run `/train join`. Ending the session grants attendees a 2× XP multiplier lasting 24h of online time (not wall-clock). Boost persists across disconnects via `ff_study_boosts` in `mp.set`.
- Online-time tracking for study boosts: elapsed session time drains `remainingOnlineMs` on every disconnect, so a player who logs off mid-boost resumes with the correct amount remaining.

### Architecture notes
- Skills are entirely server-side custom values — Skyrim's native skill system is bypassed.
- Skill caps are derived on read from faction membership; adding a new faction tier requires only a FACTION_SKILL_CAP_BONUSES entry, no schema change.
- Training sessions are in-memory only (intentional — sessions shouldn't survive a server restart).
```

- [ ] **Step 4: Run full suite**

```
cd gamemode && npm test
```

Expected: all tests passing.

- [ ] **Step 5: Build**

```
cd gamemode && npm run build
```

Expected: compiles clean.

- [ ] **Step 6: Final commit**

```
git add gamemode/src/index.ts CHANGELOG.md
git commit -m "feat: Plan 7 — skill caps and training system"
```

---

## Verification

1. `npm test` — all suites green
2. `npm run build` — no compile errors
3. Manually verify: `getSkillCap(mp, store, playerId, 'destruction')` with no faction → `250`. With College rank 2 → `750`.
4. Manually verify: `getActiveStudyBoost` returns null after `remainingOnlineMs` is exhausted via `_consumeBoostTime`.
5. Regression: `hasKoidPermission('thalmor', 'stormcloakUnderground')` → `true`.

---

## Out of Scope (future plans)

- **XP grant hooks** — wiring `addSkillXp` to SkyMP activation events (forge use → smithing XP, spell cast → magic school XP). SkyMP's event surface for these needs investigation; stub functions are in place.
- **Command interface** — `/train start|join|end` chat commands
- **City cell spooling** — server infrastructure, not gamemode TypeScript
- **Dungeon events** — separate system
