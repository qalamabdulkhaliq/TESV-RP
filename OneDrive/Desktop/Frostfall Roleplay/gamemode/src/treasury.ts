import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { HoldId } from './types';
import { ALL_HOLDS } from './types';

// ---------------------------------------------------------------------------
// Hold Treasury
//
// Each hold maintains a shared gold reserve. Plans 10–15 will credit it via
// taxes, property sales, and other income streams.
// ---------------------------------------------------------------------------

const TREASURY_KEY = 'ff_treasury';

function loadTreasury(mp: Mp): Record<HoldId, number> {
  const saved = mp.get(0, TREASURY_KEY) as Partial<Record<HoldId, number>> | undefined;
  const base = Object.fromEntries(ALL_HOLDS.map((h) => [h, 0])) as Record<HoldId, number>;
  if (saved) {
    for (const hold of ALL_HOLDS) {
      if (typeof saved[hold] === 'number') base[hold] = saved[hold]!;
    }
  }
  return base;
}

function saveTreasury(mp: Mp, treasury: Record<HoldId, number>): void {
  mp.set(0, TREASURY_KEY, treasury);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getTreasuryBalance(mp: Mp, holdId: HoldId): number {
  return loadTreasury(mp)[holdId];
}

export function getAllTreasuryBalances(mp: Mp): Record<HoldId, number> {
  return loadTreasury(mp);
}

export function depositToTreasury(mp: Mp, bus: EventBus, holdId: HoldId, amount: number): void {
  const treasury = loadTreasury(mp);
  treasury[holdId] += amount;
  saveTreasury(mp, treasury);

  bus.dispatch({
    type: 'treasuryChanged',
    payload: { holdId, delta: amount, newBalance: treasury[holdId] },
    timestamp: Date.now(),
  });

  console.log(`[Treasury] ${holdId} +${amount} → ${treasury[holdId]}`);
}

/**
 * Withdraw gold from a hold treasury.
 * Returns false if the balance is insufficient.
 */
export function withdrawFromTreasury(
  mp: Mp,
  bus: EventBus,
  holdId: HoldId,
  amount: number,
): boolean {
  const treasury = loadTreasury(mp);
  if (treasury[holdId] < amount) return false;

  treasury[holdId] -= amount;
  saveTreasury(mp, treasury);

  bus.dispatch({
    type: 'treasuryChanged',
    payload: { holdId, delta: -amount, newBalance: treasury[holdId] },
    timestamp: Date.now(),
  });

  console.log(`[Treasury] ${holdId} -${amount} → ${treasury[holdId]}`);
  return true;
}

/** Hook point for future top-up logic (Plans 10–15). */
export function initTreasury(_mp: Mp): void {
  // intentionally empty — no runtime hooks needed at this stage
}
