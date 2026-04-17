import type { Mp } from './skymp';
import type { PlayerId } from './types';

export type PlayerRole = 'player' | 'leader' | 'staff';

const ROLE_LEVELS: Record<PlayerRole, number> = { player: 0, leader: 1, staff: 2 };
const ROLE_KEY = 'ff_role';

export function getPlayerRole(mp: Mp, playerId: PlayerId): PlayerRole {
  return (mp.get(playerId, ROLE_KEY) as PlayerRole) ?? 'player';
}

export function setPlayerRole(mp: Mp, playerId: PlayerId, role: PlayerRole): void {
  mp.set(playerId, ROLE_KEY, role);
}

export function hasPermission(mp: Mp, playerId: PlayerId, required: PlayerRole): boolean {
  return ROLE_LEVELS[getPlayerRole(mp, playerId)] >= ROLE_LEVELS[required];
}
