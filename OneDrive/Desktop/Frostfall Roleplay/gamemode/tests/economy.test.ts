import {
  isStipendEligible,
  shouldPayStipend,
  transferGold,
  STIPEND_PER_HOUR,
  STIPEND_MAX_HOURS,
  STIPEND_INTERVAL_MINUTES,
  STIPEND_TOTAL,
} from '../src/economy';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(goldA = 0, goldB = 0): any {
  const inventories: Record<number, { entries: Array<{ baseId: number; count: number }> }> = {
    [0xff000001]: { entries: goldA > 0 ? [{ baseId: 0xf, count: goldA }] : [] },
    [0xff000002]: { entries: goldB > 0 ? [{ baseId: 0xf, count: goldB }] : [] },
  };

  return {
    get: jest.fn((actorId: number, prop: string) => {
      if (prop === 'inventory') return inventories[actorId];
      return undefined;
    }),
    set: jest.fn((actorId: number, prop: string, value: unknown) => {
      if (prop === 'inventory') inventories[actorId] = value as any;
    }),
    makeProperty: jest.fn(),
    on: jest.fn(),
    sendCustomPacket: jest.fn(),
    inventories,
  } as unknown as ReturnType<typeof makeMp> & { inventories: typeof inventories };
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

describe('isStipendEligible', () => {
  it('returns true when hours paid is below max', () => {
    expect(isStipendEligible(0)).toBe(true);
    expect(isStipendEligible(STIPEND_MAX_HOURS - 1)).toBe(true);
  });

  it('returns false when max hours reached', () => {
    expect(isStipendEligible(STIPEND_MAX_HOURS)).toBe(false);
    expect(isStipendEligible(STIPEND_MAX_HOURS + 5)).toBe(false);
  });
});

describe('shouldPayStipend', () => {
  it('returns true at exactly the interval', () => {
    expect(shouldPayStipend(STIPEND_INTERVAL_MINUTES, 0)).toBe(true);
  });

  it('returns true at multiples of the interval when eligible', () => {
    expect(shouldPayStipend(STIPEND_INTERVAL_MINUTES * 3, 2)).toBe(true);
  });

  it('returns false when stipend hours maxed out', () => {
    expect(shouldPayStipend(STIPEND_INTERVAL_MINUTES, STIPEND_MAX_HOURS)).toBe(false);
  });

  it('returns false at 0 minutes', () => {
    expect(shouldPayStipend(0, 0)).toBe(false);
  });

  it('total stipend is correct', () => {
    expect(STIPEND_TOTAL).toBe(STIPEND_PER_HOUR * STIPEND_MAX_HOURS);
  });
});

// ---------------------------------------------------------------------------
// transferGold
// ---------------------------------------------------------------------------

describe('transferGold', () => {
  let store: PlayerStore;
  let bus: EventBus;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.registerPlayer(2, 0xff000002, 'Valdis');
    store.update(1, { septims: 500 });
    store.update(2, { septims: 100 });
  });

  it('transfers gold from one player to another', () => {
    const mp = makeMp(500, 100) as any;
    const result = transferGold(mp, store, 1, 2, 200);
    expect(result).toBe(true);
    expect(store.get(1)!.septims).toBe(300);
    expect(store.get(2)!.septims).toBe(300);
  });

  it('returns false when sender has insufficient funds', () => {
    const mp = makeMp(50, 100) as any;
    const result = transferGold(mp, store, 1, 2, 200);
    expect(result).toBe(false);
    expect(store.get(1)!.septims).toBe(500); // unchanged in store
  });

  it('returns false for unknown sender', () => {
    const mp = makeMp(500, 100) as any;
    expect(transferGold(mp, store, 99, 2, 100)).toBe(false);
  });

  it('returns false for unknown receiver', () => {
    const mp = makeMp(500, 100) as any;
    expect(transferGold(mp, store, 1, 99, 100)).toBe(false);
  });

  it('returns false for zero amount', () => {
    const mp = makeMp(500, 100) as any;
    expect(transferGold(mp, store, 1, 2, 0)).toBe(false);
  });
});
