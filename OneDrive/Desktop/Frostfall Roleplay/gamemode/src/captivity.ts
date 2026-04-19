import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Captivity / Cuffs
//
// A downed player may be taken captive by the victor.
// Captivity has a hard 24-hour IRL cap — after which restraints auto-despawn
// regardless of captor action.  Captors are expected to RP ransom, prison
// transfer, or escape before the timer expires.
// ---------------------------------------------------------------------------

/** Hard cap on captivity duration in IRL milliseconds. */
export const MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isCaptive(store: PlayerStore, playerId: PlayerId): boolean {
  return store.get(playerId)?.isCaptive ?? false;
}

/**
 * Remaining ms of captivity for a player, or 0 if not captive / timer expired.
 */
export function getCaptivityRemainingMs(
  store: PlayerStore,
  playerId: PlayerId,
  now = Date.now(),
): number {
  const player = store.get(playerId);
  if (!player || !player.isCaptive || player.captiveAt === null) return 0;
  return Math.max(0, MAX_CAPTIVITY_MS - (now - player.captiveAt));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Take a player captive.
 * - Sets `isCaptive = true` and `captiveAt = now`.
 * - Notifies both parties.
 * - Dispatches `playerCaptured` bus event.
 * Returns false if captive player is unknown or already captive.
 */
export function capturePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  captiveId: PlayerId,
  captorId: PlayerId,
): boolean {
  const captive = store.get(captiveId);
  if (!captive) return false;
  if (captive.isCaptive) return false;

  const now = Date.now();
  store.update(captiveId, { isCaptive: true, captiveAt: now });

  const payload = { captiveId, captorId, captiveAt: now, maxDurationMs: MAX_CAPTIVITY_MS };
  sendPacket(mp, captiveId, 'playerCaptured', payload);
  sendPacket(mp, captorId, 'playerCaptured', payload);

  bus.dispatch({
    type: 'playerCaptured',
    payload: { captiveId, captorId },
    timestamp: now,
  });

  console.log(`[Captivity] ${captive.name} captured by ${captorId}`);
  return true;
}

/**
 * Release a captive player.
 * - Clears `isCaptive` and `captiveAt`.
 * - Notifies the released player.
 * - Dispatches `playerReleased` bus event.
 * Returns false if player is unknown or not captive.
 */
export function releasePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  captiveId: PlayerId,
): boolean {
  const captive = store.get(captiveId);
  if (!captive) return false;
  if (!captive.isCaptive) return false;

  store.update(captiveId, { isCaptive: false, captiveAt: null });

  sendPacket(mp, captiveId, 'playerReleased', { captiveId });

  bus.dispatch({
    type: 'playerReleased',
    payload: { captiveId },
    timestamp: Date.now(),
  });

  console.log(`[Captivity] ${captive.name} released`);
  return true;
}

export function initCaptivity(mp: Mp, store: PlayerStore, bus: EventBus): void {
  setInterval(() => checkExpiredCaptivity(mp, store, bus), 5 * 60_000);
  console.log('[Captivity] Initialized — 24h expiry check every 5 min');
}

/**
 * Called on server tick (every 5 min via initCaptivity).  Releases any players whose
 * 24-hour captivity timer has expired.
 */
export function checkExpiredCaptivity(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  now = Date.now(),
): PlayerId[] {
  const released: PlayerId[] = [];

  for (const player of store.getAll()) {
    if (!player.isCaptive || player.captiveAt === null) continue;
    if (now - player.captiveAt >= MAX_CAPTIVITY_MS) {
      releasePlayer(mp, store, bus, player.id);
      released.push(player.id);
      console.log(`[Captivity] Auto-released ${player.name} — 24h timer expired`);
    }
  }

  return released;
}
