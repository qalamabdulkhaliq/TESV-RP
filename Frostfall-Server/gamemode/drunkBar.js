'use strict'

var DRUNK_MAX = 10
var DRUNK_MIN = 0
var SOBER_DRAIN_INTERVAL_MINUTES = 5
var TICK_INTERVAL_MS = 60 * 1000

var ALCOHOL_STRENGTHS = {
  '0x000340': 1,
  '0x034c5e': 1,
  '0x034c5f': 2,
  '0x034c60': 3,
  '0x034c62': 2,
  '0x0003404b': 3,
}

function calcNewDrunkLevel(current, delta) {
  return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta))
}

function shouldSober(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % SOBER_DRAIN_INTERVAL_MINUTES === 0
}

function getAlcoholStrength(baseId) {
  return ALCOHOL_STRENGTHS[baseId] || 0
}

function drinkAlcohol(mp, store, bus, playerId, baseId) {
  var player = store.get(playerId)
  if (!player) return -1

  var strength = getAlcoholStrength(baseId)
  if (strength === 0) return player.drunkLevel

  var newDrunk = calcNewDrunkLevel(player.drunkLevel, strength)
  store.update(playerId, { drunkLevel: newDrunk })
  mp.set(player.actorId, 'ff_drunk', newDrunk)

  bus.dispatch({ type: 'drunkChanged', playerId: playerId, drunkLevel: newDrunk })

  return newDrunk
}

function soberPlayer(mp, store, bus, playerId) {
  var player = store.get(playerId)
  if (!player) return

  store.update(playerId, { drunkLevel: DRUNK_MIN })
  mp.set(player.actorId, 'ff_drunk', DRUNK_MIN)

  bus.dispatch({ type: 'drunkChanged', playerId: playerId, drunkLevel: DRUNK_MIN })
}

function init(mp, store, bus) {
  console.log('[drunkBar] Initializing')

  mp.makeProperty('ff_drunk', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var persisted = mp.get(actorId, 'ff_drunk')
    var drunk = persisted !== null && persisted !== undefined ? persisted : DRUNK_MIN
    store.update(playerId, { drunkLevel: drunk })
    mp.set(actorId, 'ff_drunk', drunk)
  })

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var player = players[i]
      if (player.drunkLevel <= DRUNK_MIN) continue

      if (shouldSober(player.minutesOnline)) {
        var newDrunk = calcNewDrunkLevel(player.drunkLevel, -1)
        store.update(player.id, { drunkLevel: newDrunk })
        mp.set(player.actorId, 'ff_drunk', newDrunk)
        bus.dispatch({ type: 'drunkChanged', playerId: player.id, drunkLevel: newDrunk })
      }
    }
  }, TICK_INTERVAL_MS)

  console.log('[drunkBar] Started')
}

function onConnect(mp, store, bus, userId) {
  // drunk level restored from persistence in playerJoined handler
}

module.exports = {
  calcNewDrunkLevel, shouldSober, getAlcoholStrength,
  drinkAlcohol, soberPlayer, init, onConnect,
}
