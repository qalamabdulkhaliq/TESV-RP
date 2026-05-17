'use strict'

// ── Role Persistence ──────────────────────────────────────────────────────────
// Persists isStaff / isLeader across reconnects via mp.set on the actor.
// On connect: reads stored role and restores the booleans into the store.
// On /role set: writes to mp.set so it survives restarts.

const ROLE_KEY = 'ff_role'

function readStoredRole(mp, actorId) {
  try {
    const role = mp.get(actorId, ROLE_KEY)
    return ['player', 'leader', 'staff'].includes(role) ? role : null
  } catch (err) {
    return null
  }
}

function shouldBootstrapStaff(mp, userId) {
  if (userId !== 1) return false
  try {
    const settings = mp.getServerSettings()
    return settings && settings.offlineMode === true
  } catch (err) {
    return false
  }
}

function getRole(mp, actorId) {
  return readStoredRole(mp, actorId) || 'player'
}

function setRole(mp, store, bus, userId, role) {
  const player = store.get(userId)
  if (!player) return false
  if (!['player', 'leader', 'staff'].includes(role)) return false
  mp.set(player.actorId, ROLE_KEY, role)
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
  bus.dispatch({ type: 'roleChanged', targetId: userId, role })
  console.log(`[permissions] ${player.name} role set to ${role}`)
  return true
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  let role = readStoredRole(mp, player.actorId)
  if (!role) {
    role = shouldBootstrapStaff(mp, userId) ? 'staff' : 'player'
    mp.set(player.actorId, ROLE_KEY, role)
  }
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
}

function init(mp, store, bus) {
  console.log('[permissions] Initialized')
}

module.exports = { getRole, setRole, onConnect, init }
