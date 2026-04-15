import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, CollegeRank } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** XP required to reach each rank. Novice = 0 (default on joining College). */
export const XP_THRESHOLDS: Record<CollegeRank, number> = {
  novice:     0,
  apprentice: 100,
  adept:      300,
  expert:     600,
  master:     1000,
};

/** XP earned by each attendee when a lecture ends. */
export const LECTURE_ATTENDEE_XP = 50;
/** XP earned by the lecturer when they end their own session. */
export const LECTURE_TEACHER_XP  = 25;

/** XP awarded for solo tome study, indexed by the tome's tier. */
export const TOME_XP: Record<CollegeRank, number> = {
  novice:     15,
  apprentice: 30,
  adept:      50,
  expert:     75,
  master:     100,
};

/** How long the post-lecture magicka regen buff lasts (IRL ms). */
export const LECTURE_BOOST_MS = 24 * 60 * 60 * 1000;

/**
 * Registered spell tomes — Skyrim base form IDs mapped to their study tier.
 * Expand as additional tomes are identified in-server.
 * Only tomes present here grant XP when studied.
 */
export const TOME_REGISTRY: Record<number, CollegeRank> = {
  0x0a26e6: 'novice',       // Spell Tome: Flames
  0x0a26e7: 'novice',       // Spell Tome: Healing
  0x0a26e8: 'apprentice',   // Spell Tome: Firebolt
  0x0a26e9: 'apprentice',   // Spell Tome: Fast Healing
  0x0a26ea: 'adept',        // Spell Tome: Fireball
  0x0a26eb: 'adept',        // Spell Tome: Close Wounds
  0x0a26ec: 'expert',       // Spell Tome: Incinerate
  0x0a26ed: 'expert',       // Spell Tome: Guardian Circle
  0x0a26ee: 'master',       // Spell Tome: Fire Storm
  0x0a26ef: 'master',       // Spell Tome: Harmony
};

// ---------------------------------------------------------------------------
// Active lecture sessions (in-memory — intentionally not persisted)
// A lecture session does not survive a server restart; that is correct.
// ---------------------------------------------------------------------------

export interface LectureSession {
  lecturerId: PlayerId;
  startedAt: number;
  attendees: PlayerId[];
}

const activeLectures: Map<PlayerId, LectureSession> = new Map();

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

const XP_KEY    = 'ff_study_xp';
const BOOST_KEY = 'ff_lecture_boost';

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Returns the College rank for a given XP total.
 * Ranks are ordered; the highest threshold not exceeding xp wins.
 */
export function getCollegeRank(xp: number): CollegeRank {
  const tiers: CollegeRank[] = ['master', 'expert', 'adept', 'apprentice', 'novice'];
  for (const tier of tiers) {
    if (xp >= XP_THRESHOLDS[tier]) return tier;
  }
  return 'novice';
}

/**
 * Returns the study tier for a tome base ID, or null if the tome is not registered.
 */
export function getTomeRank(tomeBaseId: number): CollegeRank | null {
  return TOME_REGISTRY[tomeBaseId] ?? null;
}

// ---------------------------------------------------------------------------
// Study XP helpers
// ---------------------------------------------------------------------------

export function getStudyXp(mp: Mp, store: PlayerStore, playerId: PlayerId): number {
  const player = store.get(playerId);
  if (!player) return 0;
  return (mp.get(player.actorId, XP_KEY) as number) ?? 0;
}

export function getCollegeRankForPlayer(mp: Mp, store: PlayerStore, playerId: PlayerId): CollegeRank {
  return getCollegeRank(getStudyXp(mp, store, playerId));
}

function addStudyXp(mp: Mp, store: PlayerStore, playerId: PlayerId, amount: number): number {
  const player = store.get(playerId)!;
  const current = getStudyXp(mp, store, playerId);
  const next = current + amount;
  mp.set(player.actorId, XP_KEY, next);
  return next;
}

// ---------------------------------------------------------------------------
// Solo study
// ---------------------------------------------------------------------------

/**
 * Award study XP for reading a spell tome.
 * Returns false if the player is unknown or the tome is not in the registry.
 */
export function studyTome(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  tomeBaseId: number,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;

  const tomeRank = getTomeRank(tomeBaseId);
  if (tomeRank === null) return false;

  const xpGain = TOME_XP[tomeRank];
  const newXp  = addStudyXp(mp, store, playerId, xpGain);
  const newRank = getCollegeRank(newXp);

  sendPacket(mp, playerId, 'studyXpUpdate', { xp: newXp, rank: newRank, xpGain });

  console.log(`[College] ${player.name} studied ${tomeRank} tome +${xpGain} XP (total: ${newXp}, rank: ${newRank})`);
  return true;
}

// ---------------------------------------------------------------------------
// Lecture mechanic
// ---------------------------------------------------------------------------

/**
 * Start a lecture session. The lecturer must be a known player and must not
 * already have an active session.
 */
export function startLecture(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  lecturerId: PlayerId,
): boolean {
  const lecturer = store.get(lecturerId);
  if (!lecturer) return false;
  if (activeLectures.has(lecturerId)) return false;

  const session: LectureSession = {
    lecturerId,
    startedAt: Date.now(),
    attendees: [],
  };
  activeLectures.set(lecturerId, session);

  bus.dispatch({
    type: 'lectureStarted',
    payload: { lecturerId },
    timestamp: Date.now(),
  });

  sendPacket(mp, lecturerId, 'lectureStarted', { lecturerId });

  console.log(`[College] ${lecturer.name} started a lecture`);
  return true;
}

/**
 * Join an active lecture as an attendee.
 * Returns false if: no active lecture for lecturerId, player IS the lecturer,
 * or the player is already attending.
 */
export function joinLecture(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  lecturerId: PlayerId,
): boolean {
  const session = activeLectures.get(lecturerId);
  if (!session) return false;
  if (playerId === lecturerId) return false;
  if (session.attendees.includes(playerId)) return false;

  session.attendees.push(playerId);

  sendPacket(mp, playerId, 'lectureJoined', { lecturerId });

  console.log(`[College] Player ${playerId} joined lecture by ${lecturerId}`);
  return true;
}

/**
 * End a lecture session.
 * Awards LECTURE_ATTENDEE_XP + 24h magicka boost to each attendee.
 * Awards LECTURE_TEACHER_XP to the lecturer.
 * Returns false if no active lecture exists for this lecturer.
 */
export function endLecture(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  lecturerId: PlayerId,
  now = Date.now(),
): boolean {
  const session = activeLectures.get(lecturerId);
  if (!session) return false;

  const boostUntil = now + LECTURE_BOOST_MS;

  // Reward each attendee
  for (const attendeeId of session.attendees) {
    const attendee = store.get(attendeeId);
    if (!attendee) continue;

    addStudyXp(mp, store, attendeeId, LECTURE_ATTENDEE_XP);
    mp.set(attendee.actorId, BOOST_KEY, boostUntil);

    sendPacket(mp, attendeeId, 'lectureEnded', {
      lecturerId,
      xpGain: LECTURE_ATTENDEE_XP,
      boostUntil,
    });
  }

  // Reward the lecturer
  const lecturer = store.get(lecturerId);
  if (lecturer) {
    addStudyXp(mp, store, lecturerId, LECTURE_TEACHER_XP);
    sendPacket(mp, lecturerId, 'lectureEnded', {
      lecturerId,
      xpGain: LECTURE_TEACHER_XP,
      attendeeCount: session.attendees.length,
    });
  }

  activeLectures.delete(lecturerId);

  bus.dispatch({
    type: 'lectureEnded',
    payload: { lecturerId, attendeeCount: session.attendees.length },
    timestamp: now,
  });

  console.log(`[College] Lecture by ${lecturerId} ended — ${session.attendees.length} attendee(s) rewarded`);
  return true;
}

/**
 * Returns the active lecture session for a given lecturer, or null.
 */
export function getActiveLecture(lecturerId: PlayerId): LectureSession | null {
  return activeLectures.get(lecturerId) ?? null;
}

// ---------------------------------------------------------------------------
// Lecture boost queries
// ---------------------------------------------------------------------------

export function hasLectureBoost(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  now = Date.now(),
): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  const boostUntil = (mp.get(player.actorId, BOOST_KEY) as number) ?? 0;
  return boostUntil > now;
}

export function getLectureBoostRemainingMs(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  now = Date.now(),
): number {
  const player = store.get(playerId);
  if (!player) return 0;
  const boostUntil = (mp.get(player.actorId, BOOST_KEY) as number) ?? 0;
  return Math.max(0, boostUntil - now);
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initCollege(mp: Mp, store: PlayerStore, bus: EventBus): void {
  // Register properties — synced to owner's client
  mp.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  });

  mp.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    // Client reads boostUntil timestamp; if future, applies +15% magicka regen
    updateOwner: `
      var boostUntil = mp.get(mp.actor, 'ff_lecture_boost') || 0;
      var active = boostUntil > Date.now() ? 1 : 0;
      return { magickaRegenMult: active === 1 ? 1.15 : 1.0, boostActive: active };
    `,
    updateNeighbor: '',
  });

  // On join: restore XP and notify client of active boost (if any)
  bus.on('playerJoined', (event) => {
    const { playerId, actorId } = event.payload as { playerId: PlayerId; actorId: number };
    const player = store.get(playerId);
    if (!player) return;

    const xp = (mp.get(actorId, XP_KEY) as number) ?? 0;
    const rank = getCollegeRank(xp);

    sendPacket(mp, playerId, 'studyXpUpdate', { xp, rank });

    const boostUntil = (mp.get(actorId, BOOST_KEY) as number) ?? 0;
    if (boostUntil > Date.now()) {
      sendPacket(mp, playerId, 'lectureBoostActive', {
        boostUntil,
        remainingMs: boostUntil - Date.now(),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Test reset helper
// ---------------------------------------------------------------------------

/** Clear all active lecture sessions. Used in tests only. */
export function _resetLectures(): void {
  activeLectures.clear();
}
