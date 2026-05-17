'use strict'

function _pos(mp, actorId) {
  try { return mp.get(actorId, 'pos') || null } catch (err) { return null }
}

function _dist(a, b) {
  if (!a || !b) return Infinity
  const ax = Array.isArray(a) ? a[0] : a.x
  const ay = Array.isArray(a) ? a[1] : a.y
  const az = Array.isArray(a) ? a[2] : a.z
  const bx = Array.isArray(b) ? b[0] : b.x
  const by = Array.isArray(b) ? b[1] : b.y
  const bz = Array.isArray(b) ? b[2] : b.z
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function buildIdentityOverlay(mp, store, playerId, range) {
  const viewer = store.get(playerId)
  const maxRange = range || 2500
  if (!viewer || !viewer.actorId) return { customPacketType: 'ff_identity_overlay', identities: [] }

  const viewerPos = _pos(mp, viewer.actorId)
  const identities = store.getAll()
    .filter(player => player.actorId)
    .map(player => {
      const pos = _pos(mp, player.actorId)
      const distance = player.id === viewer.id ? 0 : _dist(viewerPos, pos)
      return { player, pos, distance }
    })
    .filter(entry => entry.distance <= maxRange)
    .sort((a, b) => a.distance - b.distance)
    .map(entry => {
      let description = null
      try { description = mp.get(entry.player.actorId, 'ff_description') || null } catch (err) { description = null }
      return {
        playerId: entry.player.id,
        actorId: entry.player.actorId,
        name: entry.player.name,
        distance: Math.round(entry.distance),
        description,
        factions: Array.isArray(entry.player.factions) ? entry.player.factions : [],
      }
    })

  return { customPacketType: 'ff_identity_overlay', range: maxRange, identities }
}

function sendIdentityOverlay(mp, store, playerId, range) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return { ok: false, message: 'Player not found.' }
  const payload = buildIdentityOverlay(mp, store, playerId, range)
  mp.sendCustomPacket(player.actorId, 'ff_identity_overlay', payload)
  return { ok: true, message: 'Nearby identities refreshed.', payload }
}

function init(mp, store, bus) {
  console.log('[identityOverlay] Initialized')
}

module.exports = { buildIdentityOverlay, sendIdentityOverlay, init }
