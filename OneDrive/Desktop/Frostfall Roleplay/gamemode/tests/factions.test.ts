import {
  getFactionDocument,
  setFactionDocument,
  joinFaction,
  leaveFaction,
  isFactionMember,
  getPlayerFactionRank,
  getPlayerMemberships,
} from '../src/factions';
import type { FactionDocument } from '../src/factions';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

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
  store.registerPlayer(1, 0xff000001, 'Thorald');
  store.registerPlayer(2, 0xff000002, 'Miria');
  return { mp, store, bus };
}

const DOC: FactionDocument = {
  factionId: 'companions',
  benefits: 'Access to Jorrvaskr mead hall. Companions equipment loans.',
  burdens: 'Must answer the call when Harbinger summons. No betraying a shield-sibling.',
  bylaws: 'Honour in all things. No contracts against non-criminal Hold residents without Harbinger approval.',
  updatedAt: 1000000,
  updatedBy: 99,
};

// ---------------------------------------------------------------------------
// BBB documents
// ---------------------------------------------------------------------------

describe('getFactionDocument', () => {
  it('returns null when no document has been authored', () => {
    const { mp } = setup();
    expect(getFactionDocument(mp, 'companions')).toBeNull();
  });

  it('returns document after setFactionDocument', () => {
    const { mp } = setup();
    setFactionDocument(mp, DOC);
    const result = getFactionDocument(mp, 'companions');
    expect(result).not.toBeNull();
    expect(result!.benefits).toBe(DOC.benefits);
    expect(result!.burdens).toBe(DOC.burdens);
    expect(result!.bylaws).toBe(DOC.bylaws);
  });
});

describe('setFactionDocument', () => {
  it('persists to mp storage', () => {
    const { mp } = setup();
    setFactionDocument(mp, DOC);
    expect(mp.set).toHaveBeenCalled();
  });

  it('overwrites existing document on second call', () => {
    const { mp } = setup();
    setFactionDocument(mp, DOC);
    setFactionDocument(mp, { ...DOC, benefits: 'Updated benefits' });
    expect(getFactionDocument(mp, 'companions')!.benefits).toBe('Updated benefits');
  });

  it('different factions do not overwrite each other', () => {
    const { mp } = setup();
    setFactionDocument(mp, DOC);
    setFactionDocument(mp, { ...DOC, factionId: 'thievesGuild', benefits: 'Fence access' });
    expect(getFactionDocument(mp, 'companions')!.benefits).toBe(DOC.benefits);
    expect(getFactionDocument(mp, 'thievesGuild')!.benefits).toBe('Fence access');
  });
});

// ---------------------------------------------------------------------------
// joinFaction
// ---------------------------------------------------------------------------

describe('joinFaction', () => {
  it('adds factionId to store.factions[]', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    expect(store.get(1)!.factions).toContain('companions');
  });

  it('persists FactionMembership to mp', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    expect(mp.set).toHaveBeenCalled();
  });

  it('dispatches factionJoined event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('factionJoined', handler);
    joinFaction(mp, store, bus, 1, 'companions');
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.factionId).toBe('companions');
  });

  it('defaults rank to 0 when not specified', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    expect(getPlayerFactionRank(mp, store, 1, 'companions')).toBe(0);
  });

  it('accepts explicit rank value', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 3);
    expect(getPlayerFactionRank(mp, store, 1, 'companions')).toBe(3);
  });

  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(joinFaction(mp, store, bus, 99, 'companions')).toBe(false);
  });

  it('returns false for duplicate join', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    expect(joinFaction(mp, store, bus, 1, 'companions')).toBe(false);
  });

  it('can join multiple factions independently', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    joinFaction(mp, store, bus, 1, 'thievesGuild');
    expect(store.get(1)!.factions).toContain('companions');
    expect(store.get(1)!.factions).toContain('thievesGuild');
  });
});

// ---------------------------------------------------------------------------
// leaveFaction
// ---------------------------------------------------------------------------

describe('leaveFaction', () => {
  it('removes factionId from store.factions[]', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    leaveFaction(mp, store, bus, 1, 'companions');
    expect(store.get(1)!.factions).not.toContain('companions');
  });

  it('dispatches factionLeft event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('factionLeft', handler);
    joinFaction(mp, store, bus, 1, 'companions');
    leaveFaction(mp, store, bus, 1, 'companions');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false if not a member', () => {
    const { mp, store, bus } = setup();
    expect(leaveFaction(mp, store, bus, 1, 'companions')).toBe(false);
  });

  it('does not affect membership in other factions', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    joinFaction(mp, store, bus, 1, 'thievesGuild');
    leaveFaction(mp, store, bus, 1, 'companions');
    expect(store.get(1)!.factions).toContain('thievesGuild');
  });
});

// ---------------------------------------------------------------------------
// isFactionMember
// ---------------------------------------------------------------------------

describe('isFactionMember', () => {
  it('returns false before joining', () => {
    const { mp, store } = setup();
    expect(isFactionMember(mp, store, 1, 'companions')).toBe(false);
  });

  it('returns true after joining', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    expect(isFactionMember(mp, store, 1, 'companions')).toBe(true);
  });

  it('returns false after leaving', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions');
    leaveFaction(mp, store, bus, 1, 'companions');
    expect(isFactionMember(mp, store, 1, 'companions')).toBe(false);
  });

  it('returns false for unknown player', () => {
    const { mp, store } = setup();
    expect(isFactionMember(mp, store, 99, 'companions')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlayerFactionRank
// ---------------------------------------------------------------------------

describe('getPlayerFactionRank', () => {
  it('returns null before joining', () => {
    const { mp, store } = setup();
    expect(getPlayerFactionRank(mp, store, 1, 'companions')).toBeNull();
  });

  it('returns rank after joining', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 5);
    expect(getPlayerFactionRank(mp, store, 1, 'companions')).toBe(5);
  });

  it('returns null after leaving', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 2);
    leaveFaction(mp, store, bus, 1, 'companions');
    expect(getPlayerFactionRank(mp, store, 1, 'companions')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getPlayerMemberships
// ---------------------------------------------------------------------------

describe('getPlayerMemberships', () => {
  it('returns empty array for new player', () => {
    const { mp, store } = setup();
    expect(getPlayerMemberships(mp, store, 1)).toHaveLength(0);
  });

  it('returns membership records with correct shape', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 2);
    const memberships = getPlayerMemberships(mp, store, 1);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].factionId).toBe('companions');
    expect(memberships[0].rank).toBe(2);
    expect(typeof memberships[0].joinedAt).toBe('number');
  });

  it('returns all memberships when in multiple factions', () => {
    const { mp, store, bus } = setup();
    joinFaction(mp, store, bus, 1, 'companions', 1);
    joinFaction(mp, store, bus, 1, 'bardsCollege', 0);
    expect(getPlayerMemberships(mp, store, 1)).toHaveLength(2);
  });

  it('returns empty for unknown player', () => {
    const { mp, store } = setup();
    expect(getPlayerMemberships(mp, store, 99)).toHaveLength(0);
  });
});
