'use strict'

var HUNGER_MAX = 10
var HUNGER_MIN = 0
var HUNGER_DRAIN_INTERVAL_MINUTES = 30
var TICK_INTERVAL_MS = 60 * 1000

function calcNewHunger(current, delta) {
  return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta))
}

function shouldDrainHunger(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % HUNGER_DRAIN_INTERVAL_MINUTES === 0
}

function feedPlayer(mp, store, bus, playerId, levels) {
  if (levels === undefined) levels = 3
  var player = store.get(playerId)
  if (!player) return -1

  var newHunger = calcNewHunger(player.hungerLevel, levels)
  store.update(playerId, { hungerLevel: newHunger })
  mp.set(player.actorId, 'ff_hunger', newHunger)

  bus.dispatch({ type: 'hungerTick', playerId: playerId, hungerLevel: newHunger })

  return newHunger
}

function init(mp, store, bus) {
  console.log('[hunger] Initializing')

  mp.makeProperty('ff_hunger', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var persisted = mp.get(actorId, 'ff_hunger')
    var hunger = persisted !== null && persisted !== undefined ? persisted : HUNGER_MAX
    store.update(playerId, { hungerLevel: hunger })
    mp.set(actorId, 'ff_hunger', hunger)
  })

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var player = players[i]
      var next = player.minutesOnline + 1
      store.update(player.id, { minutesOnline: next })

      if (shouldDrainHunger(next)) {
        var newHunger = calcNewHunger(player.hungerLevel, -1)
        store.update(player.id, { hungerLevel: newHunger })
        mp.set(player.actorId, 'ff_hunger', newHunger)
        bus.dispatch({ type: 'hungerTick', playerId: player.id, hungerLevel: newHunger })
      }
    }
  }, TICK_INTERVAL_MS)

  console.log('[hunger] Started')
}

function onConnect(mp, store, bus, userId) {
  // hunger restored from persistence in playerJoined handler
}

module.exports = { calcNewHunger, shouldDrainHunger, feedPlayer, init, onConnect }
