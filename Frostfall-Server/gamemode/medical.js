'use strict'

const inv = require('./inventory')
const crafting = require('./crafting')
const skills = require('./skills')

const TREATMENTS = {
  bandage: { itemBaseId: crafting.ITEMS.bandage, clears: ['bleeding'], xp: 20 },
}

function applyInjury(mp, store, bus, playerId, injury) {
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }
  const injuries = Array.isArray(player.injuries) ? player.injuries.slice() : []
  const next = Object.assign({ type: 'wound', severity: 1, appliedAt: Date.now() }, injury || {})
  injuries.push(next)
  store.update(playerId, { injuries })
  mp.sendCustomPacket(player.actorId, 'ff_medical_state', { playerId, injuries })
  if (bus) bus.dispatch({ type: 'playerInjured', playerId, injury: next })
  return { ok: true, injury: next, injuries }
}

function treatPlayer(mp, store, bus, healerId, patientId, treatmentId) {
  const healer = store.get(healerId)
  const patient = store.get(patientId)
  const treatment = TREATMENTS[treatmentId]
  if (!healer || !patient) return { ok: false, message: 'Player not found.' }
  if (!treatment) return { ok: false, message: 'Unknown treatment.' }

  const currentInjuries = Array.isArray(patient.injuries) ? patient.injuries : []
  const injuries = currentInjuries.filter(injury => treatment.clears.indexOf(injury.type) === -1)
  if (injuries.length === currentInjuries.length) {
    return { ok: false, message: 'That treatment does not match any current injury.' }
  }

  if (!inv.removeItem(mp, healer.actorId, treatment.itemBaseId, 1)) {
    return { ok: false, message: 'You do not have the required treatment item.' }
  }

  store.update(patientId, { injuries })
  const xpGranted = skills.addSkillXp(mp, store, healerId, 'medicine', treatment.xp)
  mp.sendCustomPacket(patient.actorId, 'ff_medical_state', { playerId: patientId, injuries })
  if (healer.actorId !== patient.actorId) mp.sendCustomPacket(healer.actorId, 'ff_medical_treated', { patientId, treatmentId, xpGranted })
  if (bus) {
    if (xpGranted > 0) bus.dispatch({ type: 'skillXpGranted', playerId: healerId, skillId: 'medicine', xp: xpGranted, source: 'medical', patientId })
    bus.dispatch({ type: 'playerTreated', healerId, patientId, treatmentId })
  }
  return { ok: true, message: 'Treatment applied.', injuries, xpGranted }
}

function init(mp, store, bus) {
  console.log('[medical] Initialized')
}

module.exports = { TREATMENTS, applyInjury, treatPlayer, init }
