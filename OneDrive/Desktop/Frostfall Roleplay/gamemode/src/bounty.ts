import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, HoldId } from './types';
import { sendPacket } from './skymp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BountyRecord = {
  holdId: HoldId;
  amount: number;
  /** ISO timestamp of last update */
  updatedAt: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bounty that triggers KOID by Hold Guards */
export const GUARD_KOID_THRESHOLD = 1000;

const PROP_KEY = 'ff_bounty';

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadBounties(mp: Mp, actorId: number): BountyRecord[] {
  const raw = mp.get(actorId, PROP_KEY) as BountyRecord[] | undefined;
  return raw ?? [];
}

function saveBounties(mp: Mp, actorId: number, records: BountyRecord[]): void {
  mp.set(actorId, PROP_KEY, records);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildBountyMap(records: BountyRecord[]): Partial<Record<HoldId, number>> {
  const map: Partial<Record<HoldId, number>> = {};
  for (const r of records) {
    if (r.amount > 0) map[r.holdId] = r.amount;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Returns the bounty amount for a player in a specific hold. 0 if no bounty.
 */
export function getBounty(mp: Mp, store: PlayerStore, playerId: PlayerId, holdId: HoldId): number {
  const player = store.get(playerId);
  if (!player) return 0;
  const records = loadBounties(mp, player.actorId);
  return records.find((r) => r.holdId === holdId)?.amount ?? 0;
}

/**
 * Returns all bounty records for a player (all holds with non-zero bounty).
 */
export function getAllBounties(mp: Mp, store: PlayerStore, playerId: PlayerId): BountyRecord[] {
  const player = store.get(playerId);
  if (!player) return [];
  return loadBounties(mp, player.actorId).filter((r) => r.amount > 0);
}

/**
 * Returns true if a player is KOID-eligible by guards in a specific hold.
 */
export function isGuardKoid(mp: Mp, store: PlayerStore, playerId: PlayerId, holdId: HoldId): boolean {
  return getBounty(mp, store, playerId, holdId) >= GUARD_KOID_THRESHOLD;
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initBounty(mp: Mp, store: PlayerStore, bus: EventBus): void {
  // On join: sync bounty state to player store and notify client
  bus.on('playerJoined', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    const player = store.get(playerId);
    if (!player) return;

    const records = loadBounties(mp, player.actorId);
    const bountyMap = buildBountyMap(records);
    store.update(playerId, { bounty: bountyMap });

    if (records.length > 0) {
      sendPacket(mp, playerId, 'bountySync', { records });
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add to a player's bounty in a specific hold.
 * Dispatches bountyChanged event. Sends updated bounty packet to player.
 */
export function addBounty(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  holdId: HoldId,
  amount: number,
): boolean {
  if (amount <= 0) return false;
  const player = store.get(playerId);
  if (!player) return false;

  const records = loadBounties(mp, player.actorId);
  const existing = records.find((r) => r.holdId === holdId);

  let newAmount: number;
  if (existing) {
    existing.amount += amount;
    existing.updatedAt = Date.now();
    newAmount = existing.amount;
  } else {
    records.push({ holdId, amount, updatedAt: Date.now() });
    newAmount = amount;
  }

  saveBounties(mp, player.actorId, records);

  // Sync per-hold bounty map to store
  const bountyMap = buildBountyMap(records);
  store.update(playerId, { bounty: bountyMap });

  bus.dispatch({
    type: 'bountyChanged',
    payload: { playerId, holdId, newAmount, delta: amount },
    timestamp: Date.now(),
  });

  sendPacket(mp, playerId, 'bountyUpdate', { holdId, amount: newAmount });

  console.log(`[Bounty] +${amount} gold bounty on ${player.name} in ${holdId} (total in hold: ${newAmount})`);
  return true;
}

/**
 * Clear a player's bounty in a specific hold (paid fine, Jarl's pardon, etc.)
 */
export function clearBounty(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  holdId: HoldId,
): boolean {
  const player = store.get(playerId);
  if (!player) return false;

  const records = loadBounties(mp, player.actorId);
  const before = records.find((r) => r.holdId === holdId);
  if (!before || before.amount === 0) return false;

  const cleared = before.amount;
  before.amount = 0;
  before.updatedAt = Date.now();

  saveBounties(mp, player.actorId, records);

  const bountyMap = buildBountyMap(records);
  store.update(playerId, { bounty: bountyMap });

  bus.dispatch({
    type: 'bountyChanged',
    payload: { playerId, holdId, newAmount: 0, delta: -cleared },
    timestamp: Date.now(),
  });

  sendPacket(mp, playerId, 'bountyUpdate', { holdId, amount: 0 });

  console.log(`[Bounty] Cleared ${cleared} gold bounty on ${player.name} in ${holdId}`);
  return true;
}
