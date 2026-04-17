import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, SkillId } from './types';
import { grantStudyBoost } from './skills';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRAINING_BOOST_MULTIPLIER = 2.0;
export const TRAINING_BOOST_ONLINE_MS  = 24 * 60 * 60 * 1000;
export const TRAINING_LOCATION_RADIUS  = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingSession {
  trainerId: PlayerId;
  skillId: SkillId;
  startedAt: number;
  attendees: PlayerId[];
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const activeSessions = new Map<PlayerId, TrainingSession>();

export function _resetTrainingSessions(): void {
  activeSessions.clear();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function distance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startTraining(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  trainerId: PlayerId,
  skillId: SkillId,
): boolean {
  if (!store.get(trainerId)) return false;
  if (activeSessions.has(trainerId)) return false;
  activeSessions.set(trainerId, { trainerId, skillId, startedAt: Date.now(), attendees: [] });
  bus.dispatch({ type: 'trainingStarted', payload: { trainerId, skillId }, timestamp: Date.now() });
  return true;
}

export function joinTraining(
  mp: Mp,
  store: PlayerStore,
  _bus: EventBus,
  playerId: PlayerId,
  trainerId: PlayerId,
): boolean {
  if (!store.get(playerId)) return false;
  const session = activeSessions.get(trainerId);
  if (!session) return false;
  if (playerId === trainerId) return false;
  if (session.attendees.includes(playerId)) return false;

  const trainerPos  = mp.get(store.get(trainerId)!.actorId, 'pos') as { x: number; y: number; z: number } | null;
  const attendeePos = mp.get(store.get(playerId)!.actorId,  'pos') as { x: number; y: number; z: number } | null;
  if (!trainerPos || !attendeePos) return false;
  if (distance(trainerPos, attendeePos) > TRAINING_LOCATION_RADIUS) return false;

  session.attendees.push(playerId);
  return true;
}

export function endTraining(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  trainerId: PlayerId,
): boolean {
  const session = activeSessions.get(trainerId);
  if (!session) return false;

  for (const attendeeId of session.attendees) {
    grantStudyBoost(mp, attendeeId, session.skillId, TRAINING_BOOST_MULTIPLIER, TRAINING_BOOST_ONLINE_MS);
  }

  bus.dispatch({
    type: 'trainingEnded',
    payload: { trainerId, skillId: session.skillId, attendeeCount: session.attendees.length },
    timestamp: Date.now(),
  });

  activeSessions.delete(trainerId);
  return true;
}

export function getActiveTraining(trainerId: PlayerId): TrainingSession | null {
  return activeSessions.get(trainerId) ?? null;
}

export function initTraining(_mp: Mp, _store: PlayerStore, _bus: EventBus): void {
  // Sessions are in-memory only — wire /train start|join|end commands here once the command layer is built.
}
