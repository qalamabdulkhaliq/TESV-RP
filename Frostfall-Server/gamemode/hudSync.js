'use strict'

var TICK_INTERVAL_MS = 3000

function init(mp, store, bus) {
  console.log('[hudSync] Initializing — pushes HUD state every ' + (TICK_INTERVAL_MS / 1000) + 's')

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var p = players[i]
      if (!p.actorId) continue

      var hunger = p.hungerLevel || 0
      var drunk  = p.drunkLevel  || 0
      var hold   = p.holdId      || 'Unknown'
      var bounty = p.bounty      || {}

      mp.sendCustomPacket(p.actorId, 'ff_hud_update', {
        hunger: hunger,
        drunk: drunk,
        septims: p.septims || 0,
        hold: hold,
        bounty: bounty,
      })
    }
  }, TICK_INTERVAL_MS)
}

function onConnect(mp, store, bus, userId) {
  var p = store.get(userId)
  if (!p) return

  var hunger = p.hungerLevel || 0
  var drunk  = p.drunkLevel  || 0
  var hold   = p.holdId      || 'Unknown'
  var bounty = p.bounty      || {}

  mp.sendCustomPacket(p.actorId, 'ff_hud_update', {
    hunger: hunger,
    drunk: drunk,
    septims: p.septims || 0,
    hold: hold,
    bounty: bounty,
  })
}

module.exports = { init: init, onConnect: onConnect }
