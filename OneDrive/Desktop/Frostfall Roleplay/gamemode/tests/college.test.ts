import {
  getCollegeRank,
  getTomeRank,
  getStudyXp,
  getCollegeRankForPlayer,
  studyTome,
  startLecture,
  joinLecture,
  endLecture,
  getActiveLecture,
  hasLectureBoost,
  getLectureBoostRemainingMs,
  LECTURE_BOOST_MS,
  LECTURE_ATTENDEE_XP,
  LECTURE_TEACHER_XP,
  TOME_XP,
  XP_THRESHOLDS,
  TOME_REGISTRY,
  _resetLectures,
} from '../src/college';
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
  store.registerPlayer(1, 0xff000001, 'Brelyna');   // lecturer
  store.registerPlayer(2, 0xff000002, 'Onmund');    // attendee 1
  store.registerPlayer(3, 0xff000003, 'J\'zargo');  // attendee 2
  return { mp, store, bus };
}

beforeEach(() => _resetLectures());

// ---------------------------------------------------------------------------
// getCollegeRank — pure function
// ---------------------------------------------------------------------------

describe('getCollegeRank', () => {
  it('returns novice at 0 XP', () => {
    expect(getCollegeRank(0)).toBe('novice');
  });

  it('returns novice below apprentice threshold', () => {
    expect(getCollegeRank(XP_THRESHOLDS.apprentice - 1)).toBe('novice');
  });

  it('returns apprentice at threshold', () => {
    expect(getCollegeRank(XP_THRESHOLDS.apprentice)).toBe('apprentice');
  });

  it('returns adept at threshold', () => {
    expect(getCollegeRank(XP_THRESHOLDS.adept)).toBe('adept');
  });

  it('returns expert at threshold', () => {
    expect(getCollegeRank(XP_THRESHOLDS.expert)).toBe('expert');
  });

  it('returns master at threshold', () => {
    expect(getCollegeRank(XP_THRESHOLDS.master)).toBe('master');
  });

  it('returns master above master threshold', () => {
    expect(getCollegeRank(9999)).toBe('master');
  });
});

// ---------------------------------------------------------------------------
// getTomeRank
// ---------------------------------------------------------------------------

describe('getTomeRank', () => {
  it('returns correct rank for a known novice tome', () => {
    const id = Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0];
    expect(getTomeRank(Number(id))).toBe('novice');
  });

  it('returns correct rank for a known master tome', () => {
    const id = Object.entries(TOME_REGISTRY).find(([, v]) => v === 'master')![0];
    expect(getTomeRank(Number(id))).toBe('master');
  });

  it('returns null for unknown base ID', () => {
    expect(getTomeRank(0xdeadbeef)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStudyXp
// ---------------------------------------------------------------------------

describe('getStudyXp', () => {
  it('returns 0 for a new player', () => {
    const { mp, store } = setup();
    expect(getStudyXp(mp, store, 1)).toBe(0);
  });

  it('returns 0 for unknown player', () => {
    const { mp, store } = setup();
    expect(getStudyXp(mp, store, 99)).toBe(0);
  });

  it('returns accumulated XP after studyTome calls', () => {
    const { mp, store, bus } = setup();
    const noviceId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0]);
    studyTome(mp, store, bus, 1, noviceId);
    studyTome(mp, store, bus, 1, noviceId);
    expect(getStudyXp(mp, store, 1)).toBe(TOME_XP.novice * 2);
  });
});

// ---------------------------------------------------------------------------
// studyTome
// ---------------------------------------------------------------------------

describe('studyTome', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    const noviceId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0]);
    expect(studyTome(mp, store, bus, 99, noviceId)).toBe(false);
  });

  it('returns false for unregistered base ID', () => {
    const { mp, store, bus } = setup();
    expect(studyTome(mp, store, bus, 1, 0xdeadbeef)).toBe(false);
  });

  it('adds correct XP for a novice tome', () => {
    const { mp, store, bus } = setup();
    const noviceId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0]);
    studyTome(mp, store, bus, 1, noviceId);
    expect(getStudyXp(mp, store, 1)).toBe(TOME_XP.novice);
  });

  it('adds correct XP for an adept tome', () => {
    const { mp, store, bus } = setup();
    const adeptId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'adept')![0]);
    studyTome(mp, store, bus, 1, adeptId);
    expect(getStudyXp(mp, store, 1)).toBe(TOME_XP.adept);
  });

  it('accumulates XP across multiple calls', () => {
    const { mp, store, bus } = setup();
    const noviceId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0]);
    const masterId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'master')![0]);
    studyTome(mp, store, bus, 1, noviceId);
    studyTome(mp, store, bus, 1, masterId);
    expect(getStudyXp(mp, store, 1)).toBe(TOME_XP.novice + TOME_XP.master);
  });

  it('rank reflects accumulated XP', () => {
    const { mp, store, bus } = setup();
    // Study enough novice tomes to reach apprentice (100 XP / 15 per tome = 7 tomes)
    const noviceId = Number(Object.entries(TOME_REGISTRY).find(([, v]) => v === 'novice')![0]);
    for (let i = 0; i < 7; i++) studyTome(mp, store, bus, 1, noviceId);
    expect(getCollegeRankForPlayer(mp, store, 1)).toBe('apprentice');
  });
});

// ---------------------------------------------------------------------------
// startLecture
// ---------------------------------------------------------------------------

describe('startLecture', () => {
  it('returns false for unknown player', () => {
    const { mp, store, bus } = setup();
    expect(startLecture(mp, store, bus, 99)).toBe(false);
  });

  it('creates an active lecture session', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    expect(getActiveLecture(1)).not.toBeNull();
    expect(getActiveLecture(1)!.lecturerId).toBe(1);
  });

  it('dispatches lectureStarted event', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('lectureStarted', handler);
    startLecture(mp, store, bus, 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false if lecturer already has an active session', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    expect(startLecture(mp, store, bus, 1)).toBe(false);
  });

  it('initialises with empty attendee list', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    expect(getActiveLecture(1)!.attendees).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// joinLecture
// ---------------------------------------------------------------------------

describe('joinLecture', () => {
  it('adds player to attendees', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    expect(getActiveLecture(1)!.attendees).toContain(2);
  });

  it('returns false when no active lecture for lecturer', () => {
    const { mp, store, bus } = setup();
    expect(joinLecture(mp, store, bus, 2, 1)).toBe(false);
  });

  it('returns false if player is the lecturer', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    expect(joinLecture(mp, store, bus, 1, 1)).toBe(false);
  });

  it('returns false if player already attending', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    expect(joinLecture(mp, store, bus, 2, 1)).toBe(false);
  });

  it('allows multiple distinct attendees', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    joinLecture(mp, store, bus, 3, 1);
    expect(getActiveLecture(1)!.attendees).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// endLecture
// ---------------------------------------------------------------------------

describe('endLecture', () => {
  it('returns false when no active lecture', () => {
    const { mp, store, bus } = setup();
    expect(endLecture(mp, store, bus, 1)).toBe(false);
  });

  it('removes the active session', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    endLecture(mp, store, bus, 1);
    expect(getActiveLecture(1)).toBeNull();
  });

  it('awards LECTURE_ATTENDEE_XP to each attendee', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    joinLecture(mp, store, bus, 3, 1);
    endLecture(mp, store, bus, 1);
    expect(getStudyXp(mp, store, 2)).toBe(LECTURE_ATTENDEE_XP);
    expect(getStudyXp(mp, store, 3)).toBe(LECTURE_ATTENDEE_XP);
  });

  it('awards LECTURE_TEACHER_XP to lecturer', () => {
    const { mp, store, bus } = setup();
    startLecture(mp, store, bus, 1);
    endLecture(mp, store, bus, 1);
    expect(getStudyXp(mp, store, 1)).toBe(LECTURE_TEACHER_XP);
  });

  it('sets lecture boost for attendees', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    endLecture(mp, store, bus, 1, now);
    expect(hasLectureBoost(mp, store, 2, now + 1000)).toBe(true);
  });

  it('does not set lecture boost for lecturer', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    endLecture(mp, store, bus, 1, now);
    // Lecturer earns XP but not the attendee boost
    expect(hasLectureBoost(mp, store, 1, now + 1000)).toBe(false);
  });

  it('dispatches lectureEnded event with correct attendeeCount', () => {
    const { mp, store, bus } = setup();
    const handler = jest.fn();
    bus.on('lectureEnded', handler);
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    joinLecture(mp, store, bus, 3, 1);
    endLecture(mp, store, bus, 1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as any).payload.attendeeCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// hasLectureBoost / getLectureBoostRemainingMs
// ---------------------------------------------------------------------------

describe('hasLectureBoost', () => {
  it('returns false for player with no boost', () => {
    const { mp, store } = setup();
    expect(hasLectureBoost(mp, store, 2)).toBe(false);
  });

  it('returns true immediately after receiving boost', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    endLecture(mp, store, bus, 1, now);
    expect(hasLectureBoost(mp, store, 2, now + 1000)).toBe(true);
  });

  it('returns false after LECTURE_BOOST_MS has elapsed', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    endLecture(mp, store, bus, 1, now);
    expect(hasLectureBoost(mp, store, 2, now + LECTURE_BOOST_MS + 1)).toBe(false);
  });
});

describe('getLectureBoostRemainingMs', () => {
  it('returns 0 when no boost active', () => {
    const { mp, store } = setup();
    expect(getLectureBoostRemainingMs(mp, store, 2)).toBe(0);
  });

  it('returns correct remaining ms', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    endLecture(mp, store, bus, 1, now);
    const elapsed = 3600 * 1000; // 1 hour later
    expect(getLectureBoostRemainingMs(mp, store, 2, now + elapsed)).toBe(LECTURE_BOOST_MS - elapsed);
  });

  it('returns 0 when boost has expired', () => {
    const { mp, store, bus } = setup();
    const now = Date.now();
    startLecture(mp, store, bus, 1);
    joinLecture(mp, store, bus, 2, 1);
    endLecture(mp, store, bus, 1, now);
    expect(getLectureBoostRemainingMs(mp, store, 2, now + LECTURE_BOOST_MS + 1)).toBe(0);
  });
});
