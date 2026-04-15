import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, HoldId } from './types';
import { createNotification, sendNotification } from './courier';
import { clearBounty } from './bounty';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Prison routing — Arrest → Jarl judicial queue
//
// Arrested players are held until the Hold's Jarl (or presiding authority)
// sentences them IC.  Sentences: fine, release, or banishment.
// Prisons are gameplay spaces, not timers.
// ---------------------------------------------------------------------------

export type SentenceType = 'fine' | 'release' | 'banish';

export interface PrisonQueueEntry {
  playerId: PlayerId;
  holdId: HoldId;
  arrestedBy: PlayerId;
  queuedAt: number;
}

export interface SentenceDetails {
  type: SentenceType;
  /** Fine amount in Septims (required when type === 'fine') */
  fineAmount?: number;
  /** IC note recorded against the player's permanent Hold record */
  note?: string;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const QUEUE_KEY = 'ff_prison_queue';

function loadQueue(mp: Mp): PrisonQueueEntry[] {
  const raw = mp.get(0, QUEUE_KEY) as PrisonQueueEntry[] | undefined;
  return raw ?? [];
}

function saveQueue(mp: Mp, queue: PrisonQueueEntry[]): void {
  mp.set(0, QUEUE_KEY, queue);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function getQueue(mp: Mp, holdId?: HoldId): PrisonQueueEntry[] {
  const queue = loadQueue(mp);
  return holdId ? queue.filter((e) => e.holdId === holdId) : queue;
}

export function isQueued(mp: Mp, playerId: PlayerId): boolean {
  return loadQueue(mp).some((e) => e.playerId === playerId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Arrest a player and add them to the Hold's judicial queue.
 * Sends a courier notification to the presiding Jarl (notifyId).
 * Returns false if player is unknown or already queued.
 */
export function queueForSentencing(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  holdId: HoldId,
  arrestingOfficerId: PlayerId,
  notifyId: PlayerId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  if (isQueued(mp, playerId)) return false;

  const now = Date.now();
  const entry: PrisonQueueEntry = { playerId, holdId, arrestedBy: arrestingOfficerId, queuedAt: now };

  const queue = loadQueue(mp);
  queue.push(entry);
  saveQueue(mp, queue);

  // Courier notification to Jarl / presiding authority
  const notification = createNotification(
    'prisonRequest',
    playerId,
    notifyId,
    holdId,
    {
      prisonerName: player.name,
      arrestedBy: arrestingOfficerId,
    },
    now,
  );
  sendNotification(mp, store, notification);

  bus.dispatch({
    type: 'playerArrested',
    payload: { playerId, holdId, arrestedBy: arrestingOfficerId },
    timestamp: now,
  });

  sendPacket(mp, playerId, 'playerArrested', { holdId });

  console.log(`[Prison] ${player.name} arrested in ${holdId} by ${arrestingOfficerId} — queued for Jarl`);
  return true;
}

/**
 * Sentence a player. Applies mechanical effects and removes from queue.
 * - 'fine':    Deducts fineAmount from player's gold; clears Hold bounty
 * - 'release': Clears Hold bounty with no fine
 * - 'banish':  Clears Hold bounty; sends banishment packet (teleport logic client-side)
 * Returns false if player is not queued.
 */
export function sentencePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  jarlId: PlayerId,
  sentence: SentenceDetails,
): boolean {
  if (!isQueued(mp, playerId)) return false;

  const player = store.get(playerId);
  if (!player) return false;

  const entry = loadQueue(mp).find((e) => e.playerId === playerId);
  const holdId = entry!.holdId;

  // Apply sentence effects
  if (sentence.type === 'fine' && sentence.fineAmount && sentence.fineAmount > 0) {
    const deducted = Math.min(sentence.fineAmount, player.septims);
    store.update(playerId, { septims: player.septims - deducted });
    clearBounty(mp, store, bus, playerId, holdId);
    sendPacket(mp, playerId, 'sentenced', { type: 'fine', holdId, fineAmount: sentence.fineAmount, deducted });
  } else if (sentence.type === 'release') {
    clearBounty(mp, store, bus, playerId, holdId);
    sendPacket(mp, playerId, 'sentenced', { type: 'release', holdId });
  } else if (sentence.type === 'banish') {
    clearBounty(mp, store, bus, playerId, holdId);
    sendPacket(mp, playerId, 'sentenced', { type: 'banish', holdId });
  }

  // Remove from queue
  const queue = loadQueue(mp).filter((e) => e.playerId !== playerId);
  saveQueue(mp, queue);

  bus.dispatch({
    type: 'playerSentenced',
    payload: { playerId, jarlId, holdId, sentence },
    timestamp: Date.now(),
  });

  console.log(`[Prison] ${player.name} sentenced in ${holdId} by Jarl ${jarlId}: ${sentence.type}`);
  return true;
}
