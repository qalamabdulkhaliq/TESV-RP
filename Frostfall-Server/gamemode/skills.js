'use strict'

// ── Skill tiers ───────────────────────────────────────────────────────────────
// Cumulative XP required to reach each tier.
// Designed so an actively playing magic character (~100 XP/h) hits tier 1 in
// ~24 hours; each subsequent tier doubles the required time from the previous.
//   Tier 0 → 1: 24h   (2,400 XP)
//   Tier 1 → 2: +48h  (total 72h  / 7,200 XP)
//   Tier 2 → 3: +96h  (total 168h / 16,800 XP)
//   Tier 3 → 4: +192h (total 360h / 36,000 XP)
//   Tier 4 → 5: +384h (total 744h / 72,000 XP)
//
// Study boosts (multipliers) halve time-to-next-tier at any tier, so a 2×
// boost from a master teacher scales correctly across the entire progression.
const TIER_XP = [0, 2400, 7200, 16800, 36000, 72000]
const TIER_NAMES = ['novice', 'apprentice', 'journeyman', 'adept', 'expert', 'master']

// Default cap: tier 1 (Apprentice) — independent practitioners reach this
// without faction membership. Faction rank unlocks tiers 2–4; tier 5 requires
// a master teacher event or equivalent IC attainment.
const DEFAULT_CAP_XP = TIER_XP[1]  // 2,400

const SKILL_IDS = [
  'destruction', 'restoration', 'alteration', 'conjuration', 'illusion',
  'smithing', 'enchanting', 'alchemy', 'tailoring', 'brewing', 'baking',
  'medicine', 'lockpicking', 'stealth', 'bardic', 'survival',
]

// Faction cap bonuses: { factionId, minRank, skills, cap }
const FACTION_CAPS = [
  { factionId: 'collegeOfWinterhold', minRank: 1, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[2] },
  { factionId: 'collegeOfWinterhold', minRank: 2, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[3] },
  { factionId: 'collegeOfWinterhold', minRank: 3, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[4] },
  { factionId: 'companions',          minRank: 1, skills: ['smithing'],                        cap: TIER_XP[2] },
  { factionId: 'companions',          minRank: 2, skills: ['smithing'],                        cap: TIER_XP[3] },
  { factionId: 'companions',          minRank: 3, skills: ['smithing'],                        cap: TIER_XP[4] },
  { factionId: 'eastEmpireCompany',   minRank: 1, skills: ['smithing','enchanting','alchemy'], cap: TIER_XP[2] },
  { factionId: 'eastEmpireCompany',   minRank: 2, skills: ['smithing','enchanting','alchemy'], cap: TIER_XP[3] },
  { factionId: 'thievesGuild',        minRank: 1, skills: ['alchemy'],                        cap: TIER_XP[2] },
  { factionId: 'thievesGuild',        minRank: 2, skills: ['alchemy'],                        cap: TIER_XP[3] },
  { factionId: 'bardsCollege',        minRank: 1, skills: ['enchanting'],                     cap: TIER_XP[2] },
  { factionId: 'bardsCollege',        minRank: 2, skills: ['enchanting'],                     cap: TIER_XP[3] },
]

// ── In-memory session tracking ─────────────────────────────────────────────────
// userId → session start timestamp (wall clock)
const sessionStart = new Map()

// ── Pure helpers ──────────────────────────────────────────────────────────────

// Returns 0–5 (tier index, i.e. TIER_NAMES index). Used by dice system as a
// direct bonus: magicMastery = getSkillLevel(xp) + 1.
function getSkillLevel(xp) {
  for (let i = TIER_XP.length - 1; i >= 0; i--) {
    if (xp >= TIER_XP[i]) return i
  }
  return 0
}

// Progress within the current tier, 0.0–1.0. Useful for client progress bars.
function getSkillProgress(xp) {
  const tier = getSkillLevel(xp)
  if (tier >= TIER_XP.length - 1) return 1.0
  return (xp - TIER_XP[tier]) / (TIER_XP[tier + 1] - TIER_XP[tier])
}

function getSkillXp(mp, playerId, skillId) {
  const xpMap = mp.get(_actorForPlayer(mp, playerId), 'ff_skill_xp') || {}
  return xpMap[skillId] || 0
}

function getSkillCap(mp, store, playerId, skillId) {
  const factions = require('./factions')
  let cap = DEFAULT_CAP_XP
  for (const rule of FACTION_CAPS) {
    if (!rule.skills.includes(skillId)) continue
    const rank = factions.getPlayerFactionRank(mp, store, playerId, rule.factionId)
    if (rank !== null && rank >= rule.minRank && rule.cap > cap) {
      cap = rule.cap
    }
  }
  return cap
}

// ── Actions ───────────────────────────────────────────────────────────────────

function addSkillXp(mp, store, playerId, skillId, baseXp, now) {
  const player  = store.get(playerId)
  if (!player) return 0
  const cap     = getSkillCap(mp, store, playerId, skillId)
  const current = getSkillXp(mp, playerId, skillId)
  if (current >= cap) return 0

  // Apply any active study boost
  let multiplier = 1
  const boost = getActiveStudyBoost(mp, playerId, skillId, now)
  if (boost) multiplier = boost.multiplier

  const gain     = Math.round(baseXp * multiplier)
  const newXp    = Math.min(current + gain, cap)
  const actual   = newXp - current

  const xpMap = mp.get(player.actorId, 'ff_skill_xp') || {}
  xpMap[skillId] = newXp
  mp.set(player.actorId, 'ff_skill_xp', xpMap)
  return actual
}

function grantStudyBoost(mp, playerId, skillId, multiplier, onlineMs) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs, sessionStart: Date.now() })
  mp.set(actorId, 'ff_study_boosts', boosts)
}

function getActiveStudyBoost(mp, playerId, skillId, now) {
  _consumeBoostTime(mp, playerId, now)
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  return boosts.find(b => b.skillId === skillId && b.remainingOnlineMs > 0) || null
}

function getStudyBoosts(mp, playerId) {
  const actorId = _actorForPlayer(mp, playerId)
  return mp.get(actorId, 'ff_study_boosts') || []
}

// ── Internal ──────────────────────────────────────────────────────────────────

// Drain elapsed online time from all boosts for this player
function _consumeBoostTime(mp, playerId, now) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  const start   = sessionStart.get(playerId)
  if (!start) return
  const elapsed = (now || Date.now()) - start
  const updated = boosts
    .map(b => Object.assign({}, b, { remainingOnlineMs: Math.max(0, b.remainingOnlineMs - elapsed) }))
    .filter(b => b.remainingOnlineMs > 0)
  sessionStart.set(playerId, now || Date.now())
  mp.set(actorId, 'ff_study_boosts', updated)
}

function onSkillPlayerDisconnect(mp, playerId, now) {
  _consumeBoostTime(mp, playerId, now)
  sessionStart.delete(playerId)
}

function _actorForPlayer(mp, playerId) {
  try { return mp.getUserActor(playerId) } catch { return null }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[skills] Initializing')

  mp.makeProperty('ff_skill_xp', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty('ff_study_boosts', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  console.log('[skills] Started')
}

function onConnect(mp, store, bus, userId) {
  sessionStart.set(userId, Date.now())
  const player = store.get(userId)
  if (!player) return
  const xpMap = mp.get(player.actorId, 'ff_skill_xp') || {}
  mp.sendCustomPacket(player.actorId, 'skillsSync', { xpMap })
}

module.exports = {
  SKILL_IDS, TIER_NAMES, getSkillLevel, getSkillProgress, getSkillXp, getSkillCap,
  addSkillXp, grantStudyBoost, getActiveStudyBoost, getStudyBoosts,
  onSkillPlayerDisconnect, onConnect,
  init,
}
