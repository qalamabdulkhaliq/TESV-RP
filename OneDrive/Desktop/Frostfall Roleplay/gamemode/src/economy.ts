import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';
import { addGold, getGold } from './skymp';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Septims paid per stipend tick. Paid once per hour of playtime,
 * for the first 24 hours on a character. Total: 24 * STIPEND_PER_HOUR.
 * Tuned to feel like "you have standing" without flooding the economy.
 * Adjust during playtesting.
 */
export const STIPEND_PER_HOUR = 50;
export const STIPEND_MAX_HOURS = 24;
export const STIPEND_TOTAL = STIPEND_PER_HOUR * STIPEND_MAX_HOURS; // 1200 septims

/** IRL minutes per stipend payment */
export const STIPEND_INTERVAL_MINUTES = 60;

const TICK_INTERVAL_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function isStipendEligible(stipendPaidHours: number): boolean {
  return stipendPaidHours < STIPEND_MAX_HOURS;
}

export function shouldPayStipend(minutesOnline: number, stipendPaidHours: number): boolean {
  if (!isStipendEligible(stipendPaidHours)) return false;
  return minutesOnline > 0 && minutesOnline % STIPEND_INTERVAL_MINUTES === 0;
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initEconomy(mp: Mp, store: PlayerStore, bus: EventBus): () => void {
  // On join: sync septims from mp inventory to store
  bus.on('playerJoined', (event) => {
    const { playerId, actorId } = event.payload as { playerId: PlayerId; actorId: number };
    const septims = getGold(mp, actorId);
    const paidHours = (mp.get(actorId, 'ff_stipendHours') as number | undefined) ?? 0;
    store.update(playerId, { septims, stipendPaidHours: paidHours });
  });

  // Tick every minute — pay stipend when due
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      if (shouldPayStipend(player.minutesOnline, player.stipendPaidHours)) {
        const newTotal = addGold(mp, player.actorId, STIPEND_PER_HOUR);
        const newHours = player.stipendPaidHours + 1;

        store.update(player.id, {
          septims: newTotal,
          stipendPaidHours: newHours,
        });

        mp.set(player.actorId, 'ff_stipendHours', newHours);

        bus.dispatch({
          type: 'stipendTick',
          payload: { playerId: player.id, amount: STIPEND_PER_HOUR, totalPaid: newHours * STIPEND_PER_HOUR },
          timestamp: Date.now(),
        });

        console.log(`[Economy] Stipend paid to ${player.name}: ${STIPEND_PER_HOUR} septims (hour ${newHours}/${STIPEND_MAX_HOURS})`);
      }
    }
  }, TICK_INTERVAL_MS);

  return () => clearInterval(interval);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Transfer septims from one player to another. Returns false if insufficient funds. */
export function transferGold(
  mp: Mp,
  store: PlayerStore,
  fromId: PlayerId,
  toId: PlayerId,
  amount: number,
): boolean {
  if (amount <= 0) return false;

  const from = store.get(fromId);
  const to = store.get(toId);
  if (!from || !to) return false;

  const fromGold = getGold(mp, from.actorId);
  if (fromGold < amount) return false;

  const newFromGold = fromGold - amount;
  const newToGold = getGold(mp, to.actorId) + amount;

  // Update inventory
  const fromInv = { entries: (mp.get(from.actorId, 'inventory') as any)?.entries ?? [] };
  const toInv = { entries: (mp.get(to.actorId, 'inventory') as any)?.entries ?? [] };

  fromInv.entries = fromInv.entries.filter((e: any) => e.baseId !== 0xf);
  if (newFromGold > 0) fromInv.entries.push({ baseId: 0xf, count: newFromGold });

  toInv.entries = toInv.entries.filter((e: any) => e.baseId !== 0xf);
  if (newToGold > 0) toInv.entries.push({ baseId: 0xf, count: newToGold });

  mp.set(from.actorId, 'inventory', fromInv);
  mp.set(to.actorId, 'inventory', toInv);

  store.update(fromId, { septims: newFromGold });
  store.update(toId, { septims: newToGold });

  return true;
}
