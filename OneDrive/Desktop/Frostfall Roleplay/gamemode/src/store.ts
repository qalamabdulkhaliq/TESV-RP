import type { PlayerId, ActorId, PlayerState } from './types';

function createDefaultState(id: PlayerId, actorId: ActorId, name: string): PlayerState {
  return {
    id,
    actorId,
    name,
    holdId: null,
    factions: [],
    bounty: {},
    isDown: false,
    isCaptive: false,
    downedAt: null,
    captiveAt: null,
    properties: [],
    hungerLevel: 10,
    drunkLevel: 0,
    septims: 0,
    stipendPaidHours: 0,
    minutesOnline: 0,
  };
}

/**
 * In-memory store for all connected player states.
 * Source of truth for game systems during a session.
 * Persistent data (bounty, properties, etc.) is also written to mp.set()
 * in the individual systems so it survives server restarts.
 */
export class PlayerStore {
  private players: Map<PlayerId, PlayerState> = new Map();

  registerPlayer(id: PlayerId, actorId: ActorId, name: string): PlayerState {
    const state = createDefaultState(id, actorId, name);
    this.players.set(id, state);
    return state;
  }

  deregisterPlayer(id: PlayerId): void {
    this.players.delete(id);
  }

  get(id: PlayerId): PlayerState | null {
    return this.players.get(id) ?? null;
  }

  getAll(): PlayerState[] {
    return Array.from(this.players.values());
  }

  /** Shallow-merge patch into the player's state. Throws if player not found. */
  update(id: PlayerId, patch: Partial<PlayerState>): PlayerState {
    const current = this.players.get(id);
    if (!current) throw new Error(`Player ${id} not in store`);
    const next = { ...current, ...patch };
    this.players.set(id, next);
    return next;
  }
}
