import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DRUNK_MAX = 10;
export const DRUNK_MIN = 0;
/** Minutes of sobriety to drain 1 drunk level */
export const SOBER_DRAIN_INTERVAL_MINUTES = 5;
const TICK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Alcohol strengths — how many drunk levels a drink adds.
 * Keyed by Skyrim item base ID (hex).
 */
export const ALCOHOL_STRENGTHS: Record<number, number> = {
  0x000340: 1,  // Alto Wine
  0x034c5e: 1,  // Wine
  0x034c5f: 2,  // Mead
  0x034c60: 3,  // Black-Briar Reserve
  0x034c62: 2,  // Nord Mead
  0x0003404b: 3, // Honningbrew Mead (approximated)
};

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

export function calcNewDrunkLevel(current: number, delta: number): number {
  return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta));
}

export function shouldSober(minutesOnline: number): boolean {
  return minutesOnline > 0 && minutesOnline % SOBER_DRAIN_INTERVAL_MINUTES === 0;
}

export function getAlcoholStrength(baseId: number): number {
  return ALCOHOL_STRENGTHS[baseId] ?? 0;
}

/**
 * Client-side property update for the drunk bar.
 * Applies screen sway and reduces fine motor control (weapon accuracy) at high levels.
 */
export function getDrunkUpdateOwner(): string {
  return `
    const v = ctx.value;
    const sp = ctx.sp;
    const pl = sp.Game.getPlayer();
    if (!pl) return;
    if (v >= 8) {
      pl.setActorValue("WeaponSpeedMult", Math.max(0.5, pl.getActorValue("WeaponSpeedMult") - 0.3));
    } else if (v >= 5) {
      pl.setActorValue("WeaponSpeedMult", Math.max(0.7, pl.getActorValue("WeaponSpeedMult") - 0.15));
    }
  `.trim();
}

// ---------------------------------------------------------------------------
// System init
// ---------------------------------------------------------------------------

export function initDrunkBar(mp: Mp, store: PlayerStore, bus: EventBus): () => void {
  mp.makeProperty('ff_drunk', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: getDrunkUpdateOwner(),
    updateNeighbor: '',
  });

  // On join: restore persisted drunk level (usually 0 — sobers up offline)
  bus.on('playerJoined', (event) => {
    const { playerId, actorId } = event.payload as { playerId: PlayerId; actorId: number };
    const persisted = mp.get(actorId, 'ff_drunk') as number | undefined;
    const drunk = persisted ?? DRUNK_MIN;
    store.update(playerId, { drunkLevel: drunk });
    mp.set(actorId, 'ff_drunk', drunk);
  });

  // Tick every minute — sober up when due
  const interval = setInterval(() => {
    for (const player of store.getAll()) {
      if (player.drunkLevel <= DRUNK_MIN) continue;

      if (shouldSober(player.minutesOnline)) {
        const newDrunk = calcNewDrunkLevel(player.drunkLevel, -1);
        store.update(player.id, { drunkLevel: newDrunk });
        mp.set(player.actorId, 'ff_drunk', newDrunk);

        bus.dispatch({
          type: 'drunkChanged',
          payload: { playerId: player.id, drunkLevel: newDrunk },
          timestamp: Date.now(),
        });
      }
    }
  }, TICK_INTERVAL_MS);

  return () => clearInterval(interval);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called when a player drinks an alcoholic item.
 * `baseId` is the Skyrim form ID of the consumed item.
 * Returns the new drunk level, or -1 if player not found.
 */
export function drinkAlcohol(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  baseId: number,
): number {
  const player = store.get(playerId);
  if (!player) return -1;

  const strength = getAlcoholStrength(baseId);
  if (strength === 0) return player.drunkLevel; // not an alcohol item

  const newDrunk = calcNewDrunkLevel(player.drunkLevel, strength);
  store.update(playerId, { drunkLevel: newDrunk });
  mp.set(player.actorId, 'ff_drunk', newDrunk);

  bus.dispatch({
    type: 'drunkChanged',
    payload: { playerId, drunkLevel: newDrunk },
    timestamp: Date.now(),
  });

  return newDrunk;
}

/**
 * Instantly sobers a player (staff command, prison intake, etc.)
 */
export function soberPlayer(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
): void {
  const player = store.get(playerId);
  if (!player) return;

  store.update(playerId, { drunkLevel: DRUNK_MIN });
  mp.set(player.actorId, 'ff_drunk', DRUNK_MIN);

  bus.dispatch({
    type: 'drunkChanged',
    payload: { playerId, drunkLevel: DRUNK_MIN },
    timestamp: Date.now(),
  });
}
