import { isNvflRestricted, getNvflRemainingMs, clearNvfl, NVFL_WINDOW_MS } from '../src/nvfl';
import { PlayerStore } from '../src/store';

function makeStore(): PlayerStore {
  const store = new PlayerStore();
  store.registerPlayer(1, 0xff000001, 'Thorald');
  return store;
}

describe('NVFL_WINDOW_MS', () => {
  it('is 24 hours in milliseconds', () => {
    expect(NVFL_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('isNvflRestricted', () => {
  it('returns false when player has never been downed', () => {
    const store = makeStore();
    expect(isNvflRestricted(store, 1)).toBe(false);
  });

  it('returns false for unknown player', () => {
    const store = makeStore();
    expect(isNvflRestricted(store, 99)).toBe(false);
  });

  it('returns true immediately after being downed', () => {
    const store = makeStore();
    const now = Date.now();
    store.update(1, { downedAt: now });
    expect(isNvflRestricted(store, 1, now + 1000)).toBe(true);
  });

  it('returns true within the window', () => {
    const store = makeStore();
    const now = Date.now();
    store.update(1, { downedAt: now - (NVFL_WINDOW_MS - 1) });
    expect(isNvflRestricted(store, 1, now)).toBe(true);
  });

  it('returns false after window has passed', () => {
    const store = makeStore();
    const now = Date.now();
    store.update(1, { downedAt: now - NVFL_WINDOW_MS });
    expect(isNvflRestricted(store, 1, now)).toBe(false);
  });
});

describe('getNvflRemainingMs', () => {
  it('returns 0 when not restricted', () => {
    const store = makeStore();
    expect(getNvflRemainingMs(store, 1)).toBe(0);
  });

  it('returns positive ms when restricted', () => {
    const store = makeStore();
    const now = Date.now();
    store.update(1, { downedAt: now - 1000 });
    expect(getNvflRemainingMs(store, 1, now)).toBe(NVFL_WINDOW_MS - 1000);
  });

  it('returns 0 once window expires', () => {
    const store = makeStore();
    const now = Date.now();
    store.update(1, { downedAt: now - NVFL_WINDOW_MS - 1 });
    expect(getNvflRemainingMs(store, 1, now)).toBe(0);
  });
});

describe('clearNvfl', () => {
  it('clears downedAt so player is no longer restricted', () => {
    const store = makeStore();
    store.update(1, { downedAt: Date.now() });
    clearNvfl(store, 1);
    expect(isNvflRestricted(store, 1)).toBe(false);
    expect(store.get(1)!.downedAt).toBeNull();
  });

  it('returns false for unknown player', () => {
    const store = makeStore();
    expect(clearNvfl(store, 99)).toBe(false);
  });
});
