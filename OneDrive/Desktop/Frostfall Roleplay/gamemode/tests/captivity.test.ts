import {
  isCaptive,
  getCaptivityRemainingMs,
  capturePlayer,
  releasePlayer,
  checkExpiredCaptivity,
  MAX_CAPTIVITY_MS,
} from '../src/captivity';
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
  store.registerPlayer(1, 0xff000001, 'Thorald');  // captive
  store.registerPlayer(2, 0xff000002, 'Valdis');   // captor
  return { mp, store, bus };
}

describe('MAX_CAPTIVITY_MS', () => {
  it('is 24 hours', () => {
    expect(MAX_CAPTIVITY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isCaptive', () => {
  it('returns false before capture', () => {
    const { store } = setup();
    expect(isCaptive(store, 1)).toBe(false);
  });

  it('returns false for unknown player', () => {
    const { store } = setup();
    expect(isCaptive(store, 99)).toBe(false);
  });
});

describe('capturePlayer', () => {
  it('sets isCaptive to true', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    expect(isCaptive(store, 1)).toBe(true);
  });

  it('sets captiveAt to a recent timestamp', () => {
    const { mp, store, bus } = setup();
    const before = Date.now();
    capturePlayer(mp, store, bus, 1, 2);
    const after = Date.now();
    const captiveAt = store.get(1)!.captiveAt!;
    expect(captiveAt).toBeGreaterThanOrEqual(before);
    expect(captiveAt).toBeLessThanOrEqual(after);
  });

  it('dispatches playerCaptured event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerCaptured', handler);
    capturePlayer(mp, store, bus, 1, 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.captiveId).toBe(1);
    expect((handler.mock.calls[0][0] as any).payload.captorId).toBe(2);
  });

  it('sends customPackets to both parties', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    expect(mp.sendCustomPacket).toHaveBeenCalledTimes(2);
  });

  it('returns false for unknown captive', () => {
    const { mp, store, bus } = setup();
    expect(capturePlayer(mp, store, bus, 99, 2)).toBe(false);
  });

  it('returns false if already captive', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    expect(capturePlayer(mp, store, bus, 1, 2)).toBe(false);
  });
});

describe('releasePlayer', () => {
  it('clears isCaptive and captiveAt', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    releasePlayer(mp, store, bus, 1);
    expect(isCaptive(store, 1)).toBe(false);
    expect(store.get(1)!.captiveAt).toBeNull();
  });

  it('dispatches playerReleased event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerReleased', handler);
    capturePlayer(mp, store, bus, 1, 2);
    releasePlayer(mp, store, bus, 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false if not captive', () => {
    const { mp, store, bus } = setup();
    expect(releasePlayer(mp, store, bus, 1)).toBe(false);
  });
});

describe('getCaptivityRemainingMs', () => {
  it('returns 0 when not captive', () => {
    const { store } = setup();
    expect(getCaptivityRemainingMs(store, 1)).toBe(0);
  });

  it('returns close to MAX_CAPTIVITY_MS immediately after capture', () => {
    const { mp, store, bus } = setup();
    const before = Date.now();
    capturePlayer(mp, store, bus, 1, 2);
    const remaining = getCaptivityRemainingMs(store, 1, before);
    expect(remaining).toBeLessThanOrEqual(MAX_CAPTIVITY_MS);
    expect(remaining).toBeGreaterThan(MAX_CAPTIVITY_MS - 1000);
  });

  it('returns 0 after timer expires', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    const futureTime = Date.now() + MAX_CAPTIVITY_MS + 1;
    expect(getCaptivityRemainingMs(store, 1, futureTime)).toBe(0);
  });
});

describe('checkExpiredCaptivity', () => {
  it('releases players whose timer has expired', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    const futureTime = Date.now() + MAX_CAPTIVITY_MS + 1;
    const released = checkExpiredCaptivity(mp, store, bus, futureTime);
    expect(released).toContain(1);
    expect(isCaptive(store, 1)).toBe(false);
  });

  it('does not release players still within timer', () => {
    const { mp, store, bus } = setup();
    capturePlayer(mp, store, bus, 1, 2);
    const released = checkExpiredCaptivity(mp, store, bus, Date.now() + 1000);
    expect(released).toHaveLength(0);
    expect(isCaptive(store, 1)).toBe(true);
  });

  it('returns list of released player IDs', () => {
    const { mp, store, bus } = setup();
    store.registerPlayer(3, 0xff000003, 'Erki');
    capturePlayer(mp, store, bus, 1, 2);
    capturePlayer(mp, store, bus, 3, 2);
    const futureTime = Date.now() + MAX_CAPTIVITY_MS + 1;
    const released = checkExpiredCaptivity(mp, store, bus, futureTime);
    expect(released).toHaveLength(2);
  });
});
