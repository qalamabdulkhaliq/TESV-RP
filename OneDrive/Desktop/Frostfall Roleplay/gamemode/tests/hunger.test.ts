import {
  calcNewHunger,
  shouldDrainHunger,
  feedPlayer,
  HUNGER_MAX,
  HUNGER_MIN,
  HUNGER_DRAIN_INTERVAL_MINUTES,
} from '../src/hunger';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

describe('calcNewHunger', () => {
  it('reduces hunger by 1', () => {
    expect(calcNewHunger(7, -1)).toBe(6);
  });

  it('clamps at HUNGER_MIN (0)', () => {
    expect(calcNewHunger(0, -1)).toBe(0);
    expect(calcNewHunger(1, -5)).toBe(0);
  });

  it('clamps at HUNGER_MAX (10)', () => {
    expect(calcNewHunger(10, 1)).toBe(10);
    expect(calcNewHunger(8, 99)).toBe(10);
  });

  it('increases hunger by given delta', () => {
    expect(calcNewHunger(4, 3)).toBe(7);
  });
});

describe('shouldDrainHunger', () => {
  it('returns true at exactly the drain interval', () => {
    expect(shouldDrainHunger(HUNGER_DRAIN_INTERVAL_MINUTES)).toBe(true);
  });

  it('returns true at multiples of the drain interval', () => {
    expect(shouldDrainHunger(HUNGER_DRAIN_INTERVAL_MINUTES * 2)).toBe(true);
    expect(shouldDrainHunger(HUNGER_DRAIN_INTERVAL_MINUTES * 5)).toBe(true);
  });

  it('returns false at 0 minutes', () => {
    expect(shouldDrainHunger(0)).toBe(false);
  });

  it('returns false at non-interval minutes', () => {
    expect(shouldDrainHunger(1)).toBe(false);
    expect(shouldDrainHunger(HUNGER_DRAIN_INTERVAL_MINUTES - 1)).toBe(false);
    expect(shouldDrainHunger(HUNGER_DRAIN_INTERVAL_MINUTES + 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// feedPlayer — uses mocked mp
// ---------------------------------------------------------------------------

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

describe('feedPlayer', () => {
  let store: PlayerStore;
  let bus: EventBus;
  let mp: ReturnType<typeof makeMp>;

  beforeEach(() => {
    store = new PlayerStore();
    bus = new EventBus();
    mp = makeMp();
    store.registerPlayer(1, 0xff000001, 'Thorald');
    store.update(1, { hungerLevel: 4 });
  });

  it('increases hunger level by the given amount', () => {
    feedPlayer(mp, store, bus, 1, 3);
    expect(store.get(1)!.hungerLevel).toBe(7);
  });

  it('clamps at HUNGER_MAX', () => {
    feedPlayer(mp, store, bus, 1, 99);
    expect(store.get(1)!.hungerLevel).toBe(HUNGER_MAX);
  });

  it('calls mp.set with new hunger value', () => {
    feedPlayer(mp, store, bus, 1, 2);
    expect(mp.set).toHaveBeenCalledWith(0xff000001, 'ff_hunger', 6);
  });

  it('dispatches a hungerTick event', () => {
    const handler = jest.fn();
    bus.on('hungerTick', handler);
    feedPlayer(mp, store, bus, 1, 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.hungerLevel).toBe(6);
  });

  it('returns -1 for unknown player', () => {
    expect(feedPlayer(mp, store, bus, 99, 3)).toBe(-1);
  });

  it('returns the new hunger level', () => {
    const result = feedPlayer(mp, store, bus, 1, 3);
    expect(result).toBe(7);
  });
});
