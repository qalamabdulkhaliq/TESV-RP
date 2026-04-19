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
  TIER_XP,
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
  it('returns 0 just below tier 1 threshold', () => {
    expect(getSkillLevel(TIER_XP[1] - 1)).toBe(0);
  });
  it('returns 1 at exactly tier 1 threshold', () => {
    expect(getSkillLevel(TIER_XP[1])).toBe(1);
  });
  it('returns 2 at tier 2 threshold', () => {
    expect(getSkillLevel(TIER_XP[2])).toBe(2);
  });
  it('returns 5 at master tier threshold', () => {
    expect(getSkillLevel(TIER_XP[5])).toBe(5);
  });
  it('returns 0 for XP below tier 1 (e.g. 250)', () => {
    expect(getSkillLevel(250)).toBe(0);
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
    expect(getSkillCap(mp, store, 1, 'destruction')).toBe(TIER_XP[2]);
  });

  it('returns highest cap when player has rank 3', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'collegeOfWinterhold', 3);
    expect(getSkillCap(mp, store, 1, 'destruction')).toBe(TIER_XP[4]);
  });

  it('does not raise a cap for a skill not covered by that faction', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'collegeOfWinterhold', 3);
    expect(getSkillCap(mp, store, 1, 'smithing')).toBe(DEFAULT_SKILL_CAP.smithing);
  });

  it('takes highest cap when player is in multiple factions', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 1);
    joinFaction(mp, store, bus, 1, 'eastEmpireCompany', 2);
    expect(getSkillCap(mp, store, 1, 'smithing')).toBe(TIER_XP[3]);
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

  it('returns actual XP added when near cap', () => {
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
    expect(getStudyBoosts(mp, 1)[0].remainingOnlineMs).toBe(50_000);
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
    expect(getStudyBoosts(mp, 1)[0].remainingOnlineMs).toBe(30_000);
  });

  it('removes expired boosts on disconnect', () => {
    const { mp } = setup();
    _recordSessionStart(1, 0);
    grantStudyBoost(mp, 1, 'destruction', 2.0, 5_000);
    onSkillPlayerDisconnect(mp, 1, 10_000);
    expect(getStudyBoosts(mp, 1)).toHaveLength(0);
  });
});
