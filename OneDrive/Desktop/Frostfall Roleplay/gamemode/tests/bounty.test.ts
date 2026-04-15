import {
  getBounty,
  getAllBounties,
  isGuardKoid,
  addBounty,
  clearBounty,
  GUARD_KOID_THRESHOLD,
} from '../src/bounty';
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
  return { mp, store, bus };
}

// ---------------------------------------------------------------------------
// getBounty / getAllBounties
// ---------------------------------------------------------------------------

describe('getBounty', () => {
  it('returns 0 for player with no bounty', () => {
    const { mp, store } = setup();
    expect(getBounty(mp, store, 1, 'whiterun')).toBe(0);
  });

  it('returns 0 for unknown player', () => {
    const { mp, store } = setup();
    expect(getBounty(mp, store, 99, 'whiterun')).toBe(0);
  });

  it('returns bounty after addBounty', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 500);
    expect(getBounty(mp, store, 1, 'whiterun')).toBe(500);
  });

  it('returns 0 for a different hold', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 500);
    expect(getBounty(mp, store, 1, 'eastmarch')).toBe(0);
  });
});

describe('getAllBounties', () => {
  it('returns empty for player with no bounty', () => {
    const { mp, store } = setup();
    expect(getAllBounties(mp, store, 1)).toHaveLength(0);
  });

  it('returns entries for each hold with bounty', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 200);
    addBounty(mp, store, bus, 1, 'eastmarch', 100);
    const bounties = getAllBounties(mp, store, 1);
    expect(bounties).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// addBounty
// ---------------------------------------------------------------------------

describe('addBounty', () => {
  it('returns false for zero amount', () => {
    const { mp, store, bus } = setup();
    expect(addBounty(mp, store, bus, 1, 'whiterun', 0)).toBe(false);
  });

  it('returns false for negative amount', () => {
    const { mp, store, bus } = setup();
    expect(addBounty(mp, store, bus, 1, 'whiterun', -50)).toBe(false);
  });

  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(addBounty(mp, store, bus, 99, 'whiterun', 100)).toBe(false);
  });

  it('accumulates bounty across multiple calls', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 300);
    addBounty(mp, store, bus, 1, 'whiterun', 200);
    expect(getBounty(mp, store, 1, 'whiterun')).toBe(500);
  });

  it('dispatches bountyChanged event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('bountyChanged', handler);
    addBounty(mp, store, bus, 1, 'whiterun', 100);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('updates store bounty map', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 250);
    expect(store.get(1)!.bounty['whiterun']).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// clearBounty
// ---------------------------------------------------------------------------

describe('clearBounty', () => {
  it('clears bounty in the specified hold', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 500);
    clearBounty(mp, store, bus, 1, 'whiterun');
    expect(getBounty(mp, store, 1, 'whiterun')).toBe(0);
  });

  it('returns false when there is no bounty to clear', () => {
    const { mp, store, bus } = setup();
    expect(clearBounty(mp, store, bus, 1, 'whiterun')).toBe(false);
  });

  it('does not affect bounty in other holds', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 500);
    addBounty(mp, store, bus, 1, 'eastmarch', 300);
    clearBounty(mp, store, bus, 1, 'whiterun');
    expect(getBounty(mp, store, 1, 'eastmarch')).toBe(300);
  });

  it('updates store bounty map after clearing', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', 500);
    clearBounty(mp, store, bus, 1, 'whiterun');
    expect(store.get(1)!.bounty['whiterun']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isGuardKoid
// ---------------------------------------------------------------------------

describe('isGuardKoid', () => {
  it('returns false below threshold', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', GUARD_KOID_THRESHOLD - 1);
    expect(isGuardKoid(mp, store, 1, 'whiterun')).toBe(false);
  });

  it('returns true at threshold', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', GUARD_KOID_THRESHOLD);
    expect(isGuardKoid(mp, store, 1, 'whiterun')).toBe(true);
  });

  it('returns false for a different hold even if threshold met elsewhere', () => {
    const { mp, store, bus } = setup();
    addBounty(mp, store, bus, 1, 'whiterun', GUARD_KOID_THRESHOLD);
    expect(isGuardKoid(mp, store, 1, 'eastmarch')).toBe(false);
  });
});
