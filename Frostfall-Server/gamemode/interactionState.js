'use strict'

function _packet(mp, player, type, payload) {
  if (player && player.actorId) mp.sendCustomPacket(player.actorId, type, payload)
}

function setSurrender(mp, store, bus, playerId, enabled) {
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }
  store.update(playerId, { isSurrendering: !!enabled })
  _packet(mp, player, 'ff_interaction_state', { playerId, isSurrendering: !!enabled })
  if (bus) bus.dispatch({ type: enabled ? 'playerSurrendered' : 'playerStoppedSurrendering', playerId })
  return { ok: true, message: enabled ? 'Hands raised.' : 'Hands lowered.' }
}

function cuffPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isSurrendering && !target.isDown && !target.isCaptive) {
    return { ok: false, message: 'Target must be surrendered, downed, or captive.' }
  }
  store.update(targetId, { isCuffed: true, cuffedBy: actorId, isSurrendering: false })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, isCuffed: true, cuffedBy: actorId })
  _packet(mp, actor, 'ff_interaction_state', { targetId, isCuffed: true })
  if (bus) bus.dispatch({ type: 'playerCuffed', actorId, targetId })
  return { ok: true, message: `${target.name} cuffed.` }
}

function uncuffPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed) return { ok: false, message: 'Target is not cuffed.' }
  store.update(targetId, { isCuffed: false, cuffedBy: null, escortedBy: null })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, isCuffed: false, escortedBy: null })
  _packet(mp, actor, 'ff_interaction_state', { targetId, isCuffed: false })
  if (bus) bus.dispatch({ type: 'playerUncuffed', actorId, targetId })
  return { ok: true, message: `${target.name} uncuffed.` }
}

function searchPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed && !target.isDown && !target.isSurrendering) {
    return { ok: false, message: 'Target must be cuffed, downed, or surrendered.' }
  }
  _packet(mp, actor, 'ff_search_result', { targetId, targetName: target.name })
  if (bus) bus.dispatch({ type: 'playerSearched', actorId, targetId })
  return { ok: true, message: `Searching ${target.name}.` }
}

function carryPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed && !target.isDown) return { ok: false, message: 'Target must be cuffed or downed.' }
  store.update(targetId, { escortedBy: actorId })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, escortedBy: actorId })
  _packet(mp, actor, 'ff_interaction_state', { targetId, escortedBy: actorId })
  if (bus) bus.dispatch({ type: 'playerEscorted', actorId, targetId })
  return { ok: true, message: `Escorting ${target.name}.` }
}

function init(mp, store, bus) {
  console.log('[interactionState] Initialized')
}

module.exports = { setSurrender, cuffPlayer, uncuffPlayer, searchPlayer, carryPlayer, init }
