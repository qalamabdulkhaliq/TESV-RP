'use strict'

var worldStore = require('./worldStore')

var DOCS_KEY = 'ff_faction_docs'
var MEMBERS_KEY = 'ff_memberships'

function loadDocs(mp) {
  return worldStore.get(DOCS_KEY) || {}
}

function saveDocs(mp, docs) {
  worldStore.set(DOCS_KEY, docs)
}

function loadMemberships(mp, actorId) {
  var raw = mp.get(actorId, MEMBERS_KEY)
  return Array.isArray(raw) ? raw : []
}

function saveMemberships(mp, actorId, memberships) {
  mp.set(actorId, MEMBERS_KEY, memberships)
}

function getFactionDocument(mp, factionId) {
  var docs = loadDocs(mp)
  return docs[factionId] || null
}

function setFactionDocument(mp, doc) {
  var docs = loadDocs(mp)
  docs[doc.factionId] = Object.assign({}, doc, { updatedAt: doc.updatedAt || Date.now() })
  saveDocs(mp, docs)
  console.log('[Factions] BBB document updated for ' + doc.factionId + ' by staff ' + doc.updatedBy)
}

function joinFaction(mp, store, bus, playerId, factionId, rank) {
  if (rank === undefined) rank = 0
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return false
  }

  var entry = { factionId: factionId, rank: rank, joinedAt: Date.now() }
  memberships.push(entry)
  saveMemberships(mp, player.actorId, memberships)

  store.update(playerId, { factions: memberships.map(function (m) { return m.factionId }) })

  bus.dispatch({ type: 'factionJoined', playerId: playerId, factionId: factionId, rank: rank })

  mp.sendCustomPacket(player.actorId, 'factionJoined', { factionId: factionId, rank: rank })
  console.log('[Factions] ' + player.name + ' joined ' + factionId + ' at rank ' + rank)
  return true
}

function leaveFaction(mp, store, bus, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  var before = memberships.length
  var updated = memberships.filter(function (m) { return m.factionId !== factionId })
  if (updated.length === before) return false

  saveMemberships(mp, player.actorId, updated)
  store.update(playerId, { factions: updated.map(function (m) { return m.factionId }) })

  bus.dispatch({ type: 'factionLeft', playerId: playerId, factionId: factionId })

  mp.sendCustomPacket(player.actorId, 'factionLeft', { factionId: factionId })
  console.log('[Factions] ' + player.name + ' left ' + factionId)
  return true
}

function isFactionMember(mp, store, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return false
  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return true
  }
  return false
}

function getPlayerFactionRank(mp, store, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return null
  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return memberships[i].rank
  }
  return null
}

function setFactionRank(mp, store, bus, playerId, factionId, rank) {
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  var entry = null
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) { entry = memberships[i]; break }
  }
  if (!entry) return false

  entry.rank = rank
  saveMemberships(mp, player.actorId, memberships)

  bus.dispatch({ type: 'factionJoined', playerId: playerId, factionId: factionId, rank: rank })
  mp.sendCustomPacket(player.actorId, 'factionSync', { memberships: memberships })

  console.log('[Factions] ' + player.name + ' rank in ' + factionId + ' set to ' + rank)
  return true
}

function getPlayerMemberships(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return []
  return loadMemberships(mp, player.actorId)
}

function init(mp, store, bus) {
  console.log('[factions] Initializing')

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var player = store.get(playerId)
    if (!player) return

    var memberships = loadMemberships(mp, player.actorId)
    var factionIds = memberships.map(function (m) { return m.factionId })
    store.update(playerId, { factions: factionIds })

    if (memberships.length > 0) {
      mp.sendCustomPacket(player.actorId, 'factionSync', { memberships: memberships })
    }
  })

  console.log('[factions] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var memberships = loadMemberships(mp, player.actorId)
  var factionIds = memberships.map(function (m) { return m.factionId })
  store.update(userId, { factions: factionIds })
}

module.exports = {
  getFactionDocument, setFactionDocument,
  joinFaction, leaveFaction, isFactionMember,
  getPlayerFactionRank, setFactionRank, getPlayerMemberships,
  init, onConnect,
}
