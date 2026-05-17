'use strict'

const DESCRIPTION_MAX = 400

// raceId → display name (Skyrim base-game playable races)
const RACE_NAMES = {
  0x00013740: 'Argonian',
  0x00013741: 'Breton',
  0x00013742: 'Dunmer',
  0x00013743: 'Altmer',
  0x00013744: 'Imperial',
  0x00013745: 'Khajiit',
  0x00013746: 'Nord',
  0x00013747: 'Orsimer',
  0x00013748: 'Redguard',
  0x00013749: 'Bosmer',
}

// ── Description ───────────────────────────────────────────────────────────────

function setDescription(mp, actorId, text) {
  const trimmed = text.trim().slice(0, DESCRIPTION_MAX)
  mp.set(actorId, 'ff_description', trimmed)
  if (!mp.get(actorId, 'ff_characterReady')) {
    mp.set(actorId, 'ff_characterReady', true)
  }
  return trimmed
}

function getDescription(mp, actorId) {
  return mp.get(actorId, 'ff_description') || null
}

// ── Race ──────────────────────────────────────────────────────────────────────

function getRaceName(mp, actorId) {
  const appearance = mp.get(actorId, 'appearance')
  if (!appearance || !appearance.raceId) return 'Unknown'
  return RACE_NAMES[appearance.raceId] || 'Unknown'
}

// ── Race menu ─────────────────────────────────────────────────────────────────

function openRaceMenu(mp, actorId) {
  if (mp.get(actorId, 'ff_characterReady')) return false
  mp.setRaceMenuOpen(actorId, true)
  return true
}

function resetRaceMenu(mp, actorId) {
  mp.set(actorId, 'ff_characterReady', false)
  mp.setRaceMenuOpen(actorId, true)
}

// ── Examine ───────────────────────────────────────────────────────────────────

function examinePlayer(mp, store, examiningId, targetId, { bounty, prison }) {
  const examiner = store.get(examiningId)
  const target   = store.get(targetId)
  if (!examiner || !target) return null

  const packet = {
    name:        target.name,
    race:        getRaceName(mp, target.actorId),
    description: getDescription(mp, target.actorId) || '(No description set.)',
  }

  const canSeeWarrant = examiner.isLeader || examiner.isStaff
  if (canSeeWarrant && examiner.holdId) {
    const holdId       = examiner.holdId
    const activeBounty = bounty.getBounty(mp, store, targetId, holdId)
    const priors       = prison.getPriors(mp, target.actorId, holdId)

    if (activeBounty > 0 || priors.length > 0) {
      packet.warrant = {
        holdId,
        activeBounty,
        priors,
      }
    }
  }

  return packet
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[roleplay] Initialized')
}

module.exports = {
  setDescription, getDescription,
  getRaceName,
  openRaceMenu, resetRaceMenu,
  examinePlayer,
  init,
  DESCRIPTION_MAX,
}
