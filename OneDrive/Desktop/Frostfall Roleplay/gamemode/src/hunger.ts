import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HUNGER_MAX = 10;
export const HUNGER_MIN = 0;
/** IRL minutes between hunger level drops */
export const HUNGER_DRAIN_INTERVAL_MINUTES = 30;
/** Server tick interval in ms — used to increment minutesOnline */
const TICK_INTERVAL_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Pure logic — fully testable without SkyMP
// ---------------------------------------------------------------------------

export function calcNewHunger(current: number, delta: number): number {
  return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta));
}

export function shouldDrainHunger(minutesOnline: number): boolean {
  return minutesOnline > 0 && minutesOnline % HUNGER_DRAIN_INTERVAL_MINUTES === 0;
}

/**
 * Returns a Papyrus expression string for the client-side property update.
 * Applied to the player actor via makeProperty's updateOwner field.
 * At full hunger (10): +25 stamina regen. Starving (0-2): -15 health regen.
 */
export function getHungerUpdateOwner(): string {
  return `
    const v = ctx.value;
    const sp = ctx.sp;
    const pl = sp.Game.getPlayer();
    if (!pl) return;
    if (v <= 2) {
      pl.setActorValue("HealRate", Math.max(0, pl.getActorValue("HealRate") - 15));
    } else if (v >= 9) {
      pl.setActorValue("StaminaRate", pl.getActorValue("StaminaRate") + 25);
    }
  `.trim();
}

// ---------------------------------------------------------------------------
// System init — call once from index.ts
// ---------------------------------------------------------------------------

export function initHunger(mp: Mp, store: PlayerStore, bus: EventBus): () => void {
  // Register persistent property — synced to owner's client each update
  mp.makeProperty('ff_hunger', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: getHungerUpdateOwner(),
    updateNeighbor: '',
  });

  // On join: load persisted hunger or default to full
  bus.on('playerJoined', (event) => {
    const { playerId, actorId } = event.payload as { playerId: PlayerId; actorId: number };
    const persisted = mp.get(actorId, 'ff_hunger') as number | undefined;
    const hunger = persisted ?? HUNGER_MAX;
    store.update(playerId, { hungerLevel: hunger });
    mp.set(actorId, 'ff_hunger', hunger);
  });

  // Tick every minute — increment online time, drain hunger when due
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      const next = player.minutesOnline + 1;
      store.update(player.id, { minutesOnline: next });

      if (shouldDrainHunger(next)) {
        const newHunger = calcNewHunger(player.hungerLevel, -1);
        store.update(player.id, { hungerLevel: newHunger });
        mp.set(player.actorId, 'ff_hunger', newHunger);

        bus.dispatch({
          type: 'hungerTick',
          payload: { playerId: player.id, hungerLevel: newHunger },
          timestamp: Date.now(),
        });
      }
    }
  }, TICK_INTERVAL_MS);

  // Cleanup function — called if gamemode hot-reloads
  return () => clearInterval(interval);
}

// ---------------------------------------------------------------------------
// Public API — call from commands, food consumption handlers, etc.
// ---------------------------------------------------------------------------

/**
 * Feed a player, restoring `levels` hunger levels (default 3).
 * Called when a player eats food — hooked via client event source in a
 * future iteration. For now, callable from chat commands or test harness.
 */
export function feedPlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  levels = 3,
): number {
  const player = store.get(playerId);
  if (!player) return -1;

  const newHunger = calcNewHunger(player.hungerLevel, levels);
  store.update(playerId, { hungerLevel: newHunger });
  mp.set(player.actorId, 'ff_hunger', newHunger);

  bus.dispatch({
    type: 'hungerTick',
    payload: { playerId, hungerLevel: newHunger },
    timestamp: Date.now(),
  });

  return newHunger;
}
