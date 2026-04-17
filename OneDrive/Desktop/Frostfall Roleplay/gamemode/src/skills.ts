import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, FactionId, SkillId } from './types';
import { getPlayerMemberships } from './factions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SKILL_LEVEL_XP = 10;

export const DEFAULT_SKILL_CAP: Record<SkillId, number> = {
  destruction:  250,
  restoration:  250,
  alteration:   250,
  conjuration:  250,
  illusion:     250,
  smithing:     250,
  enchanting:   250,
  alchemy:      250,
};

export const FACTION_SKILL_CAP_BONUSES: Partial<Record<FactionId, Array<{
  minRank: number;
  caps: Partial<Record<SkillId, number>>;
}>>> = {
  collegeOfWinterhold: [
    { minRank: 1, caps: { destruction: 500, restoration: 500, alteration: 500, conjuration: 500, illusion: 500 } },
    { minRank: 2, caps: { destruction: 750, restoration: 750, alteration: 750, conjuration: 750, illusion: 750 } },
    { minRank: 3, caps: { destruction: 1000, restoration: 1000, alteration: 1000, conjuration: 1000, illusion: 1000 } },
  ],
  companions: [
    { minRank: 1, caps: { smithing: 500 } },
    { minRank: 2, caps: { smithing: 750 } },
    { minRank: 3, caps: { smithing: 1000 } },
  ],
  eastEmpireCompany: [
    { minRank: 1, caps: { smithing: 500, enchanting: 500, alchemy: 500 } },
    { minRank: 2, caps: { smithing: 750, enchanting: 750, alchemy: 750 } },
  ],
  thievesGuild: [
    { minRank: 1, caps: { alchemy: 500 } },
    { minRank: 2, caps: { alchemy: 750 } },
  ],
  bardsCollege: [
    { minRank: 1, caps: { enchanting: 500 } },
    { minRank: 2, caps: { enchanting: 750 } },
  ],
};

export interface StudyBoost {
  skillId: SkillId;
  multiplier: number;
  remainingOnlineMs: number;
}

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

const XP_KEY    = 'ff_skill_xp';
const BOOST_KEY = 'ff_study_boosts';

// ---------------------------------------------------------------------------
// In-memory session start tracking
// ---------------------------------------------------------------------------

const sessionStartMs = new Map<PlayerId, number>();

export function _recordSessionStart(playerId: PlayerId, now = Date.now()): void {
  sessionStartMs.set(playerId, now);
}

export function _getSessionOnlineMs(playerId: PlayerId, now = Date.now()): number {
  const start = sessionStartMs.get(playerId);
  return start !== undefined ? now - start : 0;
}

export function _consumeBoostTime(mp: Mp, playerId: PlayerId, now = Date.now()): void {
  const elapsed = _getSessionOnlineMs(playerId, now);
  if (elapsed <= 0) return;
  const boosts = _loadBoosts(mp, playerId);
  const updated = boosts
    .map(b => ({ ...b, remainingOnlineMs: b.remainingOnlineMs - elapsed }))
    .filter(b => b.remainingOnlineMs > 0);
  mp.set(playerId, BOOST_KEY, updated);
  sessionStartMs.set(playerId, now);
}

export function onSkillPlayerDisconnect(mp: Mp, playerId: PlayerId, now = Date.now()): void {
  _consumeBoostTime(mp, playerId, now);
  sessionStartMs.delete(playerId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _loadXp(mp: Mp, playerId: PlayerId): Partial<Record<SkillId, number>> {
  return (mp.get(playerId, XP_KEY) as Partial<Record<SkillId, number>>) ?? {};
}

function _loadBoosts(mp: Mp, playerId: PlayerId): StudyBoost[] {
  return (mp.get(playerId, BOOST_KEY) as StudyBoost[]) ?? [];
}

// ---------------------------------------------------------------------------
// Public API — pure
// ---------------------------------------------------------------------------

export function getSkillLevel(xp: number): number {
  return Math.floor(xp / SKILL_LEVEL_XP);
}

// ---------------------------------------------------------------------------
// Public API — requires mp
// ---------------------------------------------------------------------------

export function getSkillXp(mp: Mp, playerId: PlayerId, skillId: SkillId): number {
  return _loadXp(mp, playerId)[skillId] ?? 0;
}

export function getSkillCap(mp: Mp, store: PlayerStore, playerId: PlayerId, skillId: SkillId): number {
  const memberships = getPlayerMemberships(mp, store, playerId);
  let cap = DEFAULT_SKILL_CAP[skillId];
  for (const m of memberships) {
    const tiers = FACTION_SKILL_CAP_BONUSES[m.factionId];
    if (!tiers) continue;
    for (const tier of [...tiers].reverse()) {
      if (m.rank >= tier.minRank) {
        const bonus = tier.caps[skillId];
        if (bonus !== undefined && bonus > cap) cap = bonus;
        break;
      }
    }
  }
  return cap;
}

export function addSkillXp(
  mp: Mp,
  store: PlayerStore,
  playerId: PlayerId,
  skillId: SkillId,
  baseXp: number,
  now = Date.now(),
): number {
  if (!store.get(playerId)) return 0;
  const boost = getActiveStudyBoost(mp, playerId, skillId, now);
  const xpToAdd = Math.floor(baseXp * (boost ? boost.multiplier : 1.0));
  const cap = getSkillCap(mp, store, playerId, skillId);
  const current = getSkillXp(mp, playerId, skillId);
  const actual = Math.min(xpToAdd, cap - current);
  if (actual <= 0) return 0;
  const xpMap = _loadXp(mp, playerId);
  xpMap[skillId] = current + actual;
  mp.set(playerId, XP_KEY, xpMap);
  return actual;
}

export function getStudyBoosts(mp: Mp, playerId: PlayerId): StudyBoost[] {
  return _loadBoosts(mp, playerId);
}

export function getActiveStudyBoost(
  mp: Mp,
  playerId: PlayerId,
  skillId: SkillId,
  now = Date.now(),
): StudyBoost | null {
  _consumeBoostTime(mp, playerId, now);
  return _loadBoosts(mp, playerId).find(b => b.skillId === skillId) ?? null;
}

export function grantStudyBoost(
  mp: Mp,
  playerId: PlayerId,
  skillId: SkillId,
  multiplier: number,
  onlineMs: number,
): void {
  const boosts = _loadBoosts(mp, playerId).filter(b => b.skillId !== skillId);
  boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs });
  mp.set(playerId, BOOST_KEY, boosts);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initSkills(mp: Mp, store: PlayerStore, bus: EventBus): void {
  mp.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  });
  mp.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  });

  bus.on('playerJoined', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    _recordSessionStart(playerId);
  });

  bus.on('playerLeft', (event) => {
    const { playerId } = event.payload as { playerId: PlayerId };
    onSkillPlayerDisconnect(mp, playerId);
  });
}
