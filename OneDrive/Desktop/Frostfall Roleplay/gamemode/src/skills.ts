import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, FactionId, SkillId } from './types';
import { getPlayerMemberships } from './factions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * XP thresholds for each skill tier (index = tier level 0–5).
 * Tier 0→1 requires 2,400 XP (~24h active play at 100 XP/h).
 * Each subsequent tier doubles the required session time.
 */
export const TIER_XP = [0, 2400, 7200, 16800, 36000, 72000] as const;
export const TIER_NAMES = ['novice', 'apprentice', 'journeyman', 'adept', 'expert', 'master'] as const;

export const DEFAULT_SKILL_CAP: Record<SkillId, number> = {
  destruction:  TIER_XP[1],
  restoration:  TIER_XP[1],
  alteration:   TIER_XP[1],
  conjuration:  TIER_XP[1],
  illusion:     TIER_XP[1],
  smithing:     TIER_XP[1],
  enchanting:   TIER_XP[1],
  alchemy:      TIER_XP[1],
};

export const FACTION_SKILL_CAP_BONUSES: Partial<Record<FactionId, Array<{
  minRank: number;
  caps: Partial<Record<SkillId, number>>;
}>>> = {
  collegeOfWinterhold: [
    { minRank: 1, caps: { destruction: TIER_XP[2], restoration: TIER_XP[2], alteration: TIER_XP[2], conjuration: TIER_XP[2], illusion: TIER_XP[2] } },
    { minRank: 2, caps: { destruction: TIER_XP[3], restoration: TIER_XP[3], alteration: TIER_XP[3], conjuration: TIER_XP[3], illusion: TIER_XP[3] } },
    { minRank: 3, caps: { destruction: TIER_XP[4], restoration: TIER_XP[4], alteration: TIER_XP[4], conjuration: TIER_XP[4], illusion: TIER_XP[4] } },
  ],
  companions: [
    { minRank: 1, caps: { smithing: TIER_XP[2] } },
    { minRank: 2, caps: { smithing: TIER_XP[3] } },
    { minRank: 3, caps: { smithing: TIER_XP[4] } },
  ],
  eastEmpireCompany: [
    { minRank: 1, caps: { smithing: TIER_XP[2], enchanting: TIER_XP[2], alchemy: TIER_XP[2] } },
    { minRank: 2, caps: { smithing: TIER_XP[3], enchanting: TIER_XP[3], alchemy: TIER_XP[3] } },
  ],
  thievesGuild: [
    { minRank: 1, caps: { alchemy: TIER_XP[2] } },
    { minRank: 2, caps: { alchemy: TIER_XP[3] } },
  ],
  bardsCollege: [
    { minRank: 1, caps: { enchanting: TIER_XP[2] } },
    { minRank: 2, caps: { enchanting: TIER_XP[3] } },
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
  for (let i = TIER_XP.length - 1; i >= 0; i--) {
    if (xp >= TIER_XP[i]) return i;
  }
  return 0;
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
