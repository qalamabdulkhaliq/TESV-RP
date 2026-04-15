import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Downed state
//
// When a fight ends the loser is Downed — not dead.
// The victor may loot a limited amount (enforced client-side by packet),
// hold them captive, or walk away.  Downed characters are incapacitated but
// remain in the world.
// ---------------------------------------------------------------------------

/** Maximum gold a victor may loot from a downed player (tuning value). */
export const LOOT_CAP_GOLD = 500;
/** Maximum number of inventory items a victor may loot from a downed player. */
export const LOOT_CAP_ITEMS = 3;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isDowned(store: PlayerStore, playerId: PlayerId): boolean {
  return store.get(playerId)?.isDown ?? false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mark a player as Downed.
 * - Sets `isDown = true` and `downedAt = now` in the store.
 * - Sends `playerDowned` packet to both victim and attacker with loot caps.
 * - Dispatches `playerDowned` bus event.
 * Returns false if victim is unknown or already downed.
 */
export function downPlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  victimId: PlayerId,
  attackerId: PlayerId,
): boolean {
  const victim = store.get(victimId);
  if (!victim) return false;
  if (victim.isDown) return false;

  const now = Date.now();
  store.update(victimId, { isDown: true, downedAt: now });

  // Notify both parties — client uses loot caps to enforce limits
  const payload = {
    victimId,
    attackerId,
    lootCapGold: LOOT_CAP_GOLD,
    lootCapItems: LOOT_CAP_ITEMS,
  };
  sendPacket(mp, victimId, 'playerDowned', payload);
  sendPacket(mp, attackerId, 'playerDowned', payload);

  bus.dispatch({
    type: 'playerDowned',
    payload: { victimId, attackerId, holdId: victim.holdId },
    timestamp: now,
  });

  console.log(`[Combat] ${victim.name} downed by ${attackerId}`);
  return true;
}

/**
 * Allow a Downed player to rise (attacker walks away, ransom paid, etc.)
 * Clears `isDown`. Does NOT clear `downedAt` — NVFL window persists.
 * Dispatches `playerRisen` bus event.
 * Returns false if player is unknown or not downed.
 */
export function risePlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;
  if (!player.isDown) return false;

  store.update(playerId, { isDown: false });

  sendPacket(mp, playerId, 'playerRisen', { playerId });

  bus.dispatch({
    type: 'playerRisen',
    payload: { playerId },
    timestamp: Date.now(),
  });

  console.log(`[Combat] ${player.name} has risen`);
  return true;
}
