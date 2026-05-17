'use strict'

var MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000

function isCaptive(store, playerId) {
  var player = store.get(playerId)
  return player ? player.isCaptive : false
}

function getCaptivityRemainingMs(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || !player.isCaptive || player.captiveAt === null) return 0
  return Math.max(0, MAX_CAPTIVITY_MS - (now - player.captiveAt))
}

function capturePlayer(mp, store, bus, captiveId, captorId) {
  var captive = store.get(captiveId)
  if (!captive) return false
  if (captive.isCaptive) return false

  var now = Date.now()
  store.update(captiveId, { isCaptive: true, captiveAt: now })

  var payload = { captiveId: captiveId, captorId: captorId, captiveAt: now, maxDurationMs: MAX_CAPTIVITY_MS }
  mp.sendCustomPacket(captive.actorId, 'playerCaptured', payload)

  var captor = store.get(captorId)
  if (captor) mp.sendCustomPacket(captor.actorId, 'playerCaptured', payload)

  bus.dispatch({ type: 'playerCaptured', captiveId: captiveId, captorId: captorId })

  console.log('[Captivity] ' + captive.name + ' captured by ' + captorId)
  return true
}

function releasePlayer(mp, store, bus, captiveId) {
  var captive = store.get(captiveId)
  if (!captive) return false
  if (!captive.isCaptive) return false

  store.update(captiveId, { isCaptive: false, captiveAt: null })
  mp.sendCustomPacket(captive.actorId, 'playerReleased', { captiveId: captiveId })

  bus.dispatch({ type: 'playerReleased', captiveId: captiveId })

  console.log('[Captivity] ' + captive.name + ' released')
  return true
}

function checkExpiredCaptivity(mp, store, bus, now) {
  if (now === undefined) now = Date.now()
  var released = []

  var players = store.getAll()
  for (var i = 0; i < players.length; i++) {
    var player = players[i]
    if (!player.isCaptive || player.captiveAt === null) continue
    if (now - player.captiveAt >= MAX_CAPTIVITY_MS) {
      releasePlayer(mp, store, bus, player.id)
      released.push(player.id)
      console.log('[Captivity] Auto-released ' + player.name + ' - 24h timer expired')
    }
  }

  return released
}

function init(mp, store, bus) {
  setInterval(function () { checkExpiredCaptivity(mp, store, bus) }, 5 * 60 * 1000)
  console.log('[captivity] Initialized - 24h expiry check every 5 min')
}

function onConnect(mp, store, bus, userId) {
  // nothing to restore on connect
}

module.exports = {
  isCaptive, getCaptivityRemainingMs,
  capturePlayer, releasePlayer, checkExpiredCaptivity,
  init, onConnect,
}
