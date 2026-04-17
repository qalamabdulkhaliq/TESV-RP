import {
  startTraining,
  joinTraining,
  endTraining,
  getActiveTraining,
  TRAINING_BOOST_MULTIPLIER,
  TRAINING_BOOST_ONLINE_MS,
  TRAINING_LOCATION_RADIUS,
  _resetTrainingSessions,
} from '../src/training';
import { getStudyBoosts } from '../src/skills';
import { PlayerStore } from '../src/store';
import { EventBus } from '../src/events';

function makeMp(positions: Record<number, { x: number; y: number; z: number }> = {}): any {
  const storage: Record<string, unknown> = {};
  return {
    get: jest.fn((actorId: number, key: string) => {
      if (key === 'pos') return positions[actorId] ?? null;
      return storage[`${actorId}:${key}`];
    }),
    set: jest.fn((actorId: number, key: string, value: unknown) => { storage[`${actorId}:${key}`] = value; }),
    sendCustomPacket: jest.fn(),
    makeProperty: jest.fn(),
    on: jest.fn(),
  };
}

function setup(positions: Record<number, { x: number; y: number; z: number }> = {}) {
  const mp = makeMp(positions);
  const store = new PlayerStore();
  const bus = new EventBus();
  store.registerPlayer(1, 0xff000001, 'Colette');
  store.registerPlayer(2, 0xff000002, 'Onmund');
  store.registerPlayer(3, 0xff000003, 'Brelyna');
  return { mp, store, bus };
}

const NEAR  = { x: 0, y: 0, z: 0 };
const CLOSE = { x: 100, y: 0, z: 0 };
const FAR   = { x: TRAINING_LOCATION_RADIUS + 1, y: 0, z: 0 };

beforeEach(() => _resetTrainingSessions());

// ---------------------------------------------------------------------------
// startTraining
// ---------------------------------------------------------------------------

describe('startTraining', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(startTraining(mp, store, bus, 999, 'destruction')).toBe(false);
  });

  it('creates a session and returns true', () => {
    const { mp, store, bus } = setup();
    expect(startTraining(mp, store, bus, 1, 'destruction')).toBe(true);
    expect(getActiveTraining(1)).not.toBeNull();
  });

  it('dispatches trainingStarted', () => {
    const { mp, store, bus } = setup();
    const events: any[] = [];
    bus.on('trainingStarted', e => events.push(e));
    startTraining(mp, store, bus, 1, 'destruction');
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ trainerId: 1, skillId: 'destruction' });
  });

  it('returns false if trainer already has an active session', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'destruction');
    expect(startTraining(mp, store, bus, 1, 'restoration')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// joinTraining
// ---------------------------------------------------------------------------

describe('joinTraining', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 999, 1)).toBe(false);
  });

  it('returns false when no active session', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('returns false if player is the trainer', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 1, 1)).toBe(false);
  });

  it('returns false if already attending', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('returns false if player is out of range', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: FAR });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(false);
  });

  it('adds player to attendees when in range', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    expect(joinTraining(mp, store, bus, 2, 1)).toBe(true);
    expect(getActiveTraining(1)!.attendees).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// endTraining
// ---------------------------------------------------------------------------

describe('endTraining', () => {
  it('returns false when no active session', () => {
    const { mp, store, bus } = setup();
    expect(endTraining(mp, store, bus, 1)).toBe(false);
  });

  it('grants study boost to each attendee', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE, [0xff000003]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    joinTraining(mp, store, bus, 3, 1);
    endTraining(mp, store, bus, 1);
    expect(getStudyBoosts(mp, 2).find(b => b.skillId === 'destruction')).toMatchObject({
      multiplier: TRAINING_BOOST_MULTIPLIER,
      remainingOnlineMs: TRAINING_BOOST_ONLINE_MS,
    });
    expect(getStudyBoosts(mp, 3).find(b => b.skillId === 'destruction')).not.toBeUndefined();
  });

  it('does not grant boost to trainer', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    endTraining(mp, store, bus, 1);
    expect(getStudyBoosts(mp, 1)).toHaveLength(0);
  });

  it('dispatches trainingEnded with correct attendeeCount', () => {
    const { mp, store, bus } = setup({ [0xff000001]: NEAR, [0xff000002]: CLOSE });
    startTraining(mp, store, bus, 1, 'destruction');
    joinTraining(mp, store, bus, 2, 1);
    const events: any[] = [];
    bus.on('trainingEnded', e => events.push(e));
    endTraining(mp, store, bus, 1);
    expect(events[0].payload).toMatchObject({ trainerId: 1, skillId: 'destruction', attendeeCount: 1 });
  });

  it('removes the session', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'destruction');
    endTraining(mp, store, bus, 1);
    expect(getActiveTraining(1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getActiveTraining
// ---------------------------------------------------------------------------

describe('getActiveTraining', () => {
  it('returns null before session starts', () => {
    expect(getActiveTraining(1)).toBeNull();
  });
  it('returns session after start', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'alchemy');
    expect(getActiveTraining(1)).toMatchObject({ trainerId: 1, skillId: 'alchemy' });
  });
  it('returns null after session ends', () => {
    const { mp, store, bus } = setup();
    startTraining(mp, store, bus, 1, 'alchemy');
    endTraining(mp, store, bus, 1);
    expect(getActiveTraining(1)).toBeNull();
  });
});
