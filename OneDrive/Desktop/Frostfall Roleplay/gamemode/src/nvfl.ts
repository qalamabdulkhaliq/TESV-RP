import type { PlayerStore } from './store';
import type { PlayerId } from './types';

// ---------------------------------------------------------------------------
// No Value For Life (NVFL)
//
// If a character is Downed or captured within the same in-game day they may
// not initiate or participate in hostilities for the rest of that day.
// They CAN still defend themselves if attacked.
//
// "Same in-game day" is tracked by a 24-IRL-hour window from when the player
// was downed.  This is simple and survives server restarts without needing
// an in-game clock.
// ---------------------------------------------------------------------------

/** How long the NVFL restriction lasts after being downed (IRL milliseconds). */
export const NVFL_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Returns true if a player is currently under NVFL restrictions.
 * A player is NVFL-restricted when they were downed less than NVFL_WINDOW_MS ago.
 */
export function isNvflRestricted(
  store: PlayerStore,
  playerId: PlayerId,
  now = Date.now(),
): boolean {
  const player = store.get(playerId);
  if (!player || player.downedAt === null) return false;
  return now - player.downedAt < NVFL_WINDOW_MS;
}

/**
 * Returns the remaining milliseconds of the NVFL restriction.
 * Returns 0 if the player is not currently restricted.
 */
export function getNvflRemainingMs(
  store: PlayerStore,
  playerId: PlayerId,
  now = Date.now(),
): number {
  const player = store.get(playerId);
  if (!player || player.downedAt === null) return 0;
  const remaining = NVFL_WINDOW_MS - (now - player.downedAt);
  return Math.max(0, remaining);
}

/**
 * Clears the NVFL tracking for a player (Jarl pardon, new in-game day, etc.)
 * Sets downedAt back to null.
 */
export function clearNvfl(store: PlayerStore, playerId: PlayerId): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  store.update(playerId, { downedAt: null });
  return true;
}
