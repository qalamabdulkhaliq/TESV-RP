import {
  getQueue,
  isQueued,
  queueForSentencing,
  sentencePlayer,
} from '../src/prison';
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
  store.registerPlayer(1, 0xff000001, 'Thorald');   // prisoner
  store.registerPlayer(2, 0xff000002, 'Guard');      // arresting officer
  store.registerPlayer(10, 0xff00000a, 'Jarl');      // presiding Jarl
  return { mp, store, bus };
}

// ---------------------------------------------------------------------------
// getQueue / isQueued
// ---------------------------------------------------------------------------

describe('getQueue', () => {
  it('returns empty queue initially', () => {
    const { mp } = setup();
    expect(getQueue(mp)).toHaveLength(0);
  });

  it('filters by holdId when provided', () => {
    const { mp, store, bus } = setup();
    store.registerPlayer(3, 0xff000003, 'Erki');
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    queueForSentencing(mp, store, bus, 3, 'eastmarch', 2, 10);
    expect(getQueue(mp, 'whiterun')).toHaveLength(1);
    expect(getQueue(mp, 'eastmarch')).toHaveLength(1);
  });
});

describe('isQueued', () => {
  it('returns false before arrest', () => {
    const { mp } = setup();
    expect(isQueued(mp, 1)).toBe(false);
  });

  it('returns true after arrest', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    expect(isQueued(mp, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// queueForSentencing
// ---------------------------------------------------------------------------

describe('queueForSentencing', () => {
  it('adds player to queue', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    expect(getQueue(mp)).toHaveLength(1);
    expect(getQueue(mp)[0].playerId).toBe(1);
    expect(getQueue(mp)[0].holdId).toBe('whiterun');
  });

  it('dispatches playerArrested event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerArrested', handler);
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('sends courier notification to Jarl', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    // Courier calls sendCustomPacket to the online Jarl (actorId 10)
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(10, expect.any(String));
  });

  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(queueForSentencing(mp, store, bus, 99, 'whiterun', 2, 10)).toBe(false);
  });

  it('returns false if player is already queued', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    expect(queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sentencePlayer
// ---------------------------------------------------------------------------

describe('sentencePlayer — release', () => {
  it('removes player from queue', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'release' });
    expect(isQueued(mp, 1)).toBe(false);
  });

  it('dispatches playerSentenced event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('playerSentenced', handler);
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'release' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.sentence.type).toBe('release');
  });

  it('returns false when player is not queued', () => {
    const { mp, store, bus } = setup();
    expect(sentencePlayer(mp, store, bus, 1, 10, { type: 'release' })).toBe(false);
  });
});

describe('sentencePlayer — fine', () => {
  it('deducts gold from player', () => {
    const { mp, store, bus } = setup();
    store.update(1, { septims: 1000 });
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'fine', fineAmount: 300 });
    expect(store.get(1)!.septims).toBe(700);
  });

  it('deducts only available gold when fine exceeds balance', () => {
    const { mp, store, bus } = setup();
    store.update(1, { septims: 100 });
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'fine', fineAmount: 500 });
    expect(store.get(1)!.septims).toBe(0);
  });

  it('removes player from queue after fine', () => {
    const { mp, store, bus } = setup();
    store.update(1, { septims: 1000 });
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'fine', fineAmount: 200 });
    expect(isQueued(mp, 1)).toBe(false);
  });
});

describe('sentencePlayer — banish', () => {
  it('removes player from queue', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'banish' });
    expect(isQueued(mp, 1)).toBe(false);
  });

  it('sends banishment packet to player', () => {
    const { mp, store, bus } = setup();
    queueForSentencing(mp, store, bus, 1, 'whiterun', 2, 10);
    sentencePlayer(mp, store, bus, 1, 10, { type: 'banish' });
    // player actorId = 0xff000001 = 1, packet should be sent
    expect(mp.sendCustomPacket).toHaveBeenCalledWith(1, expect.any(String));
  });
});
