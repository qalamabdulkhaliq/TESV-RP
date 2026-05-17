'use strict'

var GUARD_KOID_THRESHOLD = 1000

function loadBounties(mp, actorId) {
  var raw = mp.get(actorId, 'ff_bounty')
  return Array.isArray(raw) ? raw : []
}

function saveBounties(mp, actorId, records) {
  mp.set(actorId, 'ff_bounty', records)
}

function buildBountyMap(records) {
  var map = {}
  for (var i = 0; i < records.length; i++) {
    var r = records[i]
    if (r.amount > 0) map[r.holdId] = r.amount
  }
  return map
}

function getBounty(mp, store, playerId, holdId) {
  var player = store.get(playerId)
  if (!player) return 0
  var records = loadBounties(mp, player.actorId)
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) return records[i].amount
  }
  return 0
}

function getAllBounties(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return []
  return loadBounties(mp, player.actorId).filter(function (r) { return r.amount > 0 })
}

function isGuardKoid(mp, store, playerId, holdId) {
  return getBounty(mp, store, playerId, holdId) >= GUARD_KOID_THRESHOLD
}

function addBounty(mp, store, bus, playerId, holdId, amount) {
  if (amount <= 0) return false
  var player = store.get(playerId)
  if (!player) return false

  var records = loadBounties(mp, player.actorId)
  var existing = null
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) { existing = records[i]; break }
  }

  var newAmount
  if (existing) {
    existing.amount += amount
    existing.updatedAt = Date.now()
    newAmount = existing.amount
  } else {
    records.push({ holdId: holdId, amount: amount, updatedAt: Date.now() })
    newAmount = amount
  }

  saveBounties(mp, player.actorId, records)

  var bountyMap = buildBountyMap(records)
  store.update(playerId, { bounty: bountyMap })

  bus.dispatch({ type: 'bountyChanged', playerId: playerId, holdId: holdId, newAmount: newAmount, delta: amount })

  mp.sendCustomPacket(player.actorId, 'bountyUpdate', { holdId: holdId, amount: newAmount })
  console.log('[Bounty] +' + amount + ' gold bounty on ' + player.name + ' in ' + holdId + ' (total in hold: ' + newAmount + ')')
  return true
}

function clearBounty(mp, store, bus, playerId, holdId) {
  var player = store.get(playerId)
  if (!player) return false

  var records = loadBounties(mp, player.actorId)
  var before = null
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) { before = records[i]; break }
  }
  if (!before || before.amount === 0) return false

  var cleared = before.amount
  before.amount = 0
  before.updatedAt = Date.now()

  saveBounties(mp, player.actorId, records)

  var bountyMap = buildBountyMap(records)
  store.update(playerId, { bounty: bountyMap })

  bus.dispatch({ type: 'bountyChanged', playerId: playerId, holdId: holdId, newAmount: 0, delta: -cleared })

  mp.sendCustomPacket(player.actorId, 'bountyUpdate', { holdId: holdId, amount: 0 })
  console.log('[Bounty] Cleared ' + cleared + ' gold bounty on ' + player.name + ' in ' + holdId)
  return true
}

function init(mp, store, bus) {
  console.log('[bounty] Initializing')

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var player = store.get(playerId)
    if (!player) return

    var records = loadBounties(mp, player.actorId)
    var bountyMap = buildBountyMap(records)
    store.update(playerId, { bounty: bountyMap })

    if (records.length > 0) {
      mp.sendCustomPacket(player.actorId, 'bountySync', { records: records })
    }
  })

  console.log('[bounty] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var records = loadBounties(mp, player.actorId)
  var bountyMap = buildBountyMap(records)
  store.update(userId, { bounty: bountyMap })
}

module.exports = {
  getBounty, getAllBounties, isGuardKoid,
  addBounty, clearBounty, init, onConnect,
}
