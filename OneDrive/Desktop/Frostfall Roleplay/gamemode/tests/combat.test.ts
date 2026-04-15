import { isDowned, downPlayer, risePlayer, LOOT_CAP_GOLD, LOOT_CAP_ITEMS } from '../src/combat';
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
  store.registerPlayer(2, 0xff000002, 'Valdis');
  return { mp, store, bus };
}

describe('loot cap constants', () => {
  it('LOOT_CAP_GOLD is positive', () => {
    expect(LOOT_CAP_GOLD).toBeGreaterThan(0);
  });

  it('LOOT_CAP_ITEMS is positive', () => {
    expect(LOOT_CAP_ITEMS).toBeGreaterThan(0);
  });
});

describe('isDowned', () => {
  it('returns false for a standing player', () => {
    const { store } = setup();
    expect(isDowned(store, 1)).toBe(false);
  });

  it('returns false for unknown player', () => {
    const { store } = setup();
    expect(isDowned(store, 99)).toBe(false);
  });
});

describe('downPlayer', () => {
  it('sets isDown to true', () => {
    const { mp, store, bus } = setup();
    downPlayer(mp, store, bus, 1, 2);
    expect(isDowned(store, 1)).toBe(true);
  });

  it('sets downedAt to a recent timestamp', () => {
    const { mp, store, bus } = setup();
    const before = Date.now();
    downPlayer(mp, store, bus, 1, 2);
    const after = Date.now();
    const downedAt = store.get(1)!.downedAt!;
    expect(downedAt).toBeGreaterThanOrEqual(before);
    expect(downedAt).toBeLessThanOrEqual(after);
  });

  it('dispatches playerDowned event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerDowned', handler);
    downPlayer(mp, store, bus, 1, 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.victimId).toBe(1);
    expect((handler.mock.calls[0][0] as any).payload.attackerId).toBe(2);
  });

  it('sends customPacket to both victim and attacker', () => {
    const { mp, store, bus } = setup();
    downPlayer(mp, store, bus, 1, 2);
    expect(mp.sendCustomPacket).toHaveBeenCalledTimes(2);
  });

  it('returns false for unknown victim', () => {
    const { mp, store, bus } = setup();
    expect(downPlayer(mp, store, bus, 99, 2)).toBe(false);
  });

  it('returns false if victim is already downed', () => {
    const { mp, store, bus } = setup();
    downPlayer(mp, store, bus, 1, 2);
    expect(downPlayer(mp, store, bus, 1, 2)).toBe(false);
  });
});

describe('risePlayer', () => {
  it('clears isDown', () => {
    const { mp, store, bus } = setup();
    downPlayer(mp, store, bus, 1, 2);
    risePlayer(mp, store, bus, 1);
    expect(isDowned(store, 1)).toBe(false);
  });

  it('preserves downedAt after rising (NVFL window persists)', () => {
    const { mp, store, bus } = setup();
    downPlayer(mp, store, bus, 1, 2);
    risePlayer(mp, store, bus, 1);
    expect(store.get(1)!.downedAt).not.toBeNull();
  });

  it('dispatches playerRisen event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerRisen', handler);
    downPlayer(mp, store, bus, 1, 2);
    risePlayer(mp, store, bus, 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false if player is not downed', () => {
    const { mp, store, bus } = setup();
    expect(risePlayer(mp, store, bus, 1)).toBe(false);
  });

  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(risePlayer(mp, store, bus, 99)).toBe(false);
  });
});
