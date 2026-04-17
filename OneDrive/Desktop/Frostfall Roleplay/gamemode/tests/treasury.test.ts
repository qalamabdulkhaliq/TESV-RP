import { getTreasuryBalance, getAllTreasuryBalances, depositToTreasury, withdrawFromTreasury } from '../src/treasury';
import { EventBus } from '../src/events';
import { ALL_HOLDS } from '../src/types';

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

describe('getTreasuryBalance', () => {
  it('returns 0 for a fresh hold', () => {
    const mp = makeMp();
    expect(getTreasuryBalance(mp, 'whiterun')).toBe(0);
  });
});

describe('depositToTreasury', () => {
  it('increases balance correctly', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'whiterun', 500);
    expect(getTreasuryBalance(mp, 'whiterun')).toBe(500);
  });

  it('accumulates across multiple deposits', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'rift', 200);
    depositToTreasury(mp, bus, 'rift', 300);
    expect(getTreasuryBalance(mp, 'rift')).toBe(500);
  });

  it('dispatches treasuryChanged with correct delta and newBalance', () => {
    const mp = makeMp();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('treasuryChanged', (e) => events.push(e));

    depositToTreasury(mp, bus, 'eastmarch', 1000);

    expect(events).toHaveLength(1);
    const payload = (events[0] as any).payload;
    expect(payload.holdId).toBe('eastmarch');
    expect(payload.delta).toBe(1000);
    expect(payload.newBalance).toBe(1000);
  });
});

describe('withdrawFromTreasury', () => {
  it('returns false if balance is insufficient', () => {
    const mp = makeMp();
    const bus = new EventBus();
    expect(withdrawFromTreasury(mp, bus, 'pale', 100)).toBe(false);
  });

  it('returns true and decreases balance when funds are sufficient', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'reach', 1000);
    const ok = withdrawFromTreasury(mp, bus, 'reach', 400);
    expect(ok).toBe(true);
    expect(getTreasuryBalance(mp, 'reach')).toBe(600);
  });

  it('returns false and does not change balance for exact-zero edge case', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'haafingar', 100);
    expect(withdrawFromTreasury(mp, bus, 'haafingar', 101)).toBe(false);
    expect(getTreasuryBalance(mp, 'haafingar')).toBe(100);
  });

  it('allows withdrawing exact balance', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'falkreath', 250);
    const ok = withdrawFromTreasury(mp, bus, 'falkreath', 250);
    expect(ok).toBe(true);
    expect(getTreasuryBalance(mp, 'falkreath')).toBe(0);
  });

  it('dispatches treasuryChanged with negative delta', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'hjaalmarch', 500);

    const events: unknown[] = [];
    bus.on('treasuryChanged', (e) => events.push(e));
    withdrawFromTreasury(mp, bus, 'hjaalmarch', 200);

    const payload = (events[0] as any).payload;
    expect(payload.delta).toBe(-200);
    expect(payload.newBalance).toBe(300);
  });
});

describe('getAllTreasuryBalances', () => {
  it('returns all 9 holds', () => {
    const mp = makeMp();
    const balances = getAllTreasuryBalances(mp);
    expect(Object.keys(balances).sort()).toEqual([...ALL_HOLDS].sort());
  });

  it('untouched holds are 0', () => {
    const mp = makeMp();
    const bus = new EventBus();
    depositToTreasury(mp, bus, 'winterhold', 100);
    const balances = getAllTreasuryBalances(mp);
    for (const hold of ALL_HOLDS) {
      if (hold !== 'winterhold') expect(balances[hold]).toBe(0);
    }
    expect(balances['winterhold']).toBe(100);
  });
});
