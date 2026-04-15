import {
  calcNewDrunkLevel,
  shouldSober,
  getAlcoholStrength,
  drinkAlcohol,
  soberPlayer,
  DRUNK_MAX,
  DRUNK_MIN,
  SOBER_DRAIN_INTERVAL_MINUTES,
  ALCOHOL_STRENGTHS,
} from '../src/drunkBar';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    makeProperty: jest.fn(),
    makeEventSource: jest.fn(),
    on: jest.fn(),
    sendCustomPacket: jest.fn(),
  } as unknown as import('../src/skymp').Mp;
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

describe('calcNewDrunkLevel', () => {
  it('increases by given delta', () => {
    expect(calcNewDrunkLevel(3, 2)).toBe(5);
  });

  it('clamps at DRUNK_MAX', () => {
    expect(calcNewDrunkLevel(9, 5)).toBe(DRUNK_MAX);
  });

  it('clamps at DRUNK_MIN', () => {
    expect(calcNewDrunkLevel(0, -1)).toBe(DRUNK_MIN);
  });
});

describe('shouldSober', () => {
  it('returns true at sober interval', () => {
    expect(shouldSober(SOBER_DRAIN_INTERVAL_MINUTES)).toBe(true);
  });

  it('returns true at multiples of sober interval', () => {
    expect(shouldSober(SOBER_DRAIN_INTERVAL_MINUTES * 3)).toBe(true);
  });

  it('returns false at 0', () => {
    expect(shouldSober(0)).toBe(false);
  });

  it('returns false at non-interval minutes', () => {
    expect(shouldSober(SOBER_DRAIN_INTERVAL_MINUTES + 2)).toBe(false);
  });
});

describe('getAlcoholStrength', () => {
  it('returns strength for known alcohol items', () => {
    for (const [baseId, strength] of Object.entries(ALCOHOL_STRENGTHS)) {
      expect(getAlcoholStrength(Number(baseId))).toBe(strength);
    }
  });

  it('returns 0 for non-alcohol items', () => {
    expect(getAlcoholStrength(0x0000000f)).toBe(0); // gold
    expect(getAlcoholStrength(0x00013926)).toBe(0); // iron sword
  });
});

// ---------------------------------------------------------------------------
// drinkAlcohol
// ---------------------------------------------------------------------------

describe('drinkAlcohol', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: ReturnType<typeof makeMp>;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.update(1, { drunkLevel: 2 });
  });

  it('increases drunk level by item strength', () => {
    drinkAlcohol(mp, store, bus, 1, 0x034c5f); // Mead = 2
    expect(store.get(1)!.drunkLevel).toBe(4);
  });

  it('clamps at DRUNK_MAX', () => {
    store.update(1, { drunkLevel: 9 });
    drinkAlcohol(mp, store, bus, 1, 0x034c60); // Black-Briar = 3
    expect(store.get(1)!.drunkLevel).toBe(DRUNK_MAX);
  });

  it('does nothing for non-alcohol items', () => {
    const before = store.get(1)!.drunkLevel;
    drinkAlcohol(mp, store, bus, 1, 0x0000000f); // gold
    expect(store.get(1)!.drunkLevel).toBe(before);
  });

  it('calls mp.set with new drunk level', () => {
    drinkAlcohol(mp, store, bus, 1, 0x034c5f); // Mead
    expect(mp.set).toHaveBeenCalledWith(0xff000001, 'ff_drunk', 4);
  });

  it('dispatches drunkChanged event', () => {
    const handler = jest.fn();
    bus.on('drunkChanged', handler);
    drinkAlcohol(mp, store, bus, 1, 0x034c5f);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.drunkLevel).toBe(4);
  });

  it('returns -1 for unknown player', () => {
    expect(drinkAlcohol(mp, store, bus, 99, 0x034c5f)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// soberPlayer
// ---------------------------------------------------------------------------

describe('soberPlayer', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: ReturnType<typeof makeMp>;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.update(1, { drunkLevel: 7 });
  });

  it('sets drunk level to 0', () => {
    soberPlayer(mp, store, bus, 1);
    expect(store.get(1)!.drunkLevel).toBe(0);
  });

  it('calls mp.set with 0', () => {
    soberPlayer(mp, store, bus, 1);
    expect(mp.set).toHaveBeenCalledWith(0xff000001, 'ff_drunk', 0);
  });

  it('dispatches drunkChanged event with level 0', () => {
    const handler = jest.fn();
    bus.on('drunkChanged', handler);
    soberPlayer(mp, store, bus, 1);
    expect((handler.mock.calls[0][0] as any).payload.drunkLevel).toBe(0);
  });

  it('does nothing for unknown player', () => {
    expect(() => soberPlayer(mp, store, bus, 99)).not.toThrow();
  });
});
