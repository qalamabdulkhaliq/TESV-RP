'use strict'

var NVFL_WINDOW_MS = 24 * 60 * 60 * 1000

function isNvflRestricted(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || player.downedAt === null) return false
  return now - player.downedAt < NVFL_WINDOW_MS
}

function getNvflRemainingMs(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || player.downedAt === null) return 0
  var remaining = NVFL_WINDOW_MS - (now - player.downedAt)
  return Math.max(0, remaining)
}

function clearNvfl(store, playerId) {
  var player = store.get(playerId)
  if (!player) return false
  store.update(playerId, { downedAt: null })
  return true
}

module.exports = {
  isNvflRestricted, getNvflRemainingMs, clearNvfl,
}
