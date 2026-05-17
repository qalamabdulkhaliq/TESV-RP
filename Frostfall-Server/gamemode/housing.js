'use strict'

const worldStore = require('./worldStore')

// ── Property Registry ─────────────────────────────────────────────────────────
// 16 properties across 9 holds. propertyId is the stable key used everywhere.

const PROPERTY_REGISTRY = [
  // Whiterun
  { id: 'wrun_breezehome',   name: 'Breezehome',          holdId: 'whiterun',   type: 'home' },
  { id: 'wrun_breezeannex',  name: 'Breezehome Annex',    holdId: 'whiterun',   type: 'business' },
  // Eastmarch
  { id: 'east_hjerim',       name: 'Hjerim',              holdId: 'eastmarch',  type: 'home' },
  { id: 'east_windhelm_shop',name: 'Windhelm Market Stall',holdId: 'eastmarch', type: 'business' },
  // Rift
  { id: 'rift_honeyside',    name: 'Honeyside',           holdId: 'rift',       type: 'home' },
  { id: 'rift_riften_shop',  name: 'Riften Stall',        holdId: 'rift',       type: 'business' },
  // Reach
  { id: 'reach_vlindrel',    name: 'Vlindrel Hall',       holdId: 'reach',      type: 'home' },
  { id: 'reach_markarth_shop','name': 'Markarth Stall',   holdId: 'reach',      type: 'business' },
  // Haafingar
  { id: 'haaf_proudspire',   name: 'Proudspire Manor',    holdId: 'haafingar',  type: 'home' },
  { id: 'haaf_solitude_shop','name': 'Solitude Market',   holdId: 'haafingar',  type: 'business' },
  // Pale
  { id: 'pale_dawnstar_home','name': 'Dawnstar Cottage',  holdId: 'pale',       type: 'home' },
  { id: 'pale_dawnstar_shop','name': 'Dawnstar Stall',    holdId: 'pale',       type: 'business' },
  // Falkreath
  { id: 'falk_lakeview',     name: 'Lakeview Manor',      holdId: 'falkreath',  type: 'home' },
  { id: 'falk_falkreath_shop','name': 'Falkreath Stall',  holdId: 'falkreath',  type: 'business' },
  // Hjaalmarch
  { id: 'hjaal_windstad',    name: 'Windstad Manor',      holdId: 'hjaalmarch', type: 'home' },
  // Winterhold
  { id: 'wint_college_quarters','name': 'College Quarters',holdId: 'winterhold',type: 'home' },
]

// ── Runtime state ─────────────────────────────────────────────────────────────
// properties Map: propertyId → { ownerId, pendingOwnerId, price }

const properties = new Map()
let persistEnabled = true

function _loadRegistry() {
  for (const def of PROPERTY_REGISTRY) {
    if (!properties.has(def.id)) {
      properties.set(def.id, { ownerId: null, pendingOwnerId: null, price: null, escrowAmount: 0 })
    }
  }
}

// ── Pure lookups ──────────────────────────────────────────────────────────────

function getProperty(id) {
  const def   = PROPERTY_REGISTRY.find(p => p.id === id)
  const state = properties.get(id)
  if (!def || !state) return null
  return Object.assign({}, def, state)
}

function getPropertiesByHold(holdId) {
  return PROPERTY_REGISTRY
    .filter(p => p.holdId === holdId)
    .map(p => getProperty(p.id))
}

function getOwnedProperties(playerId) {
  return PROPERTY_REGISTRY
    .map(p => getProperty(p.id))
    .filter(p => p && p.ownerId === playerId)
}

function isAvailable(propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  return state.ownerId === null && state.pendingOwnerId === null
}

// ── Actions ───────────────────────────────────────────────────────────────────

function requestProperty(mp, store, bus, playerId, propertyId, stewardId) {
  if (!isAvailable(propertyId)) return false
  const courier = require('./courier')
  const state = properties.get(propertyId)
  const price = state.price || 0
  const player = store.get(playerId)
  if (!player) return false
  if (price > 0) {
    const inv = require('./inventory')
    if (!inv.removeItem(mp, player.actorId, inv.GOLD_BASE_ID, price)) return false
    store.update(playerId, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })
  }
  state.pendingOwnerId = playerId
  state.escrowAmount = price
  _persist()
  const note = courier.createNotification(
    'propertyRequest', playerId, stewardId, null,
    { propertyId, requesterName: store.get(playerId) ? store.get(playerId).name : String(playerId) }
  )
  courier.sendNotification(mp, store, note)
  bus.dispatch({ type: 'propertyRequested', playerId, propertyId })
  return true
}

function approveProperty(mp, store, bus, propertyId, approverId, treasury) {
  const state = properties.get(propertyId)
  if (!state || state.pendingOwnerId === null) return false
  const def = PROPERTY_REGISTRY.find(p => p.id === propertyId)
  const newOwnerId = state.pendingOwnerId
  const escrowAmount = state.escrowAmount || 0
  state.ownerId        = newOwnerId
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()

  const player = store.get(newOwnerId)
  if (player) {
    const owned = store.get(newOwnerId).properties.concat([propertyId])
    store.update(newOwnerId, { properties: owned })
    mp.sendCustomPacket(player.actorId, 'propertyApproved', { propertyId })
  }
  if (treasury && escrowAmount > 0 && def) treasury.deposit(bus, def.holdId, escrowAmount)
  bus.dispatch({ type: 'propertyApproved', propertyId, newOwnerId, approvedBy: approverId, escrowAmount })
  return true
}

function denyProperty(mp, propertyId, store) {
  const state = properties.get(propertyId)
  if (!state) return false
  if (store && state.pendingOwnerId !== null && state.escrowAmount > 0) {
    const player = store.get(state.pendingOwnerId)
    if (player) {
      const inv = require('./inventory')
      inv.addItem(mp, player.actorId, inv.GOLD_BASE_ID, state.escrowAmount)
      store.update(player.id, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })
    }
  }
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()
  return true
}

function revokeProperty(mp, store, propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  const prevOwner = state.ownerId
  state.ownerId        = null
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()
  if (prevOwner !== null) {
    const player = store.get(prevOwner)
    if (player) {
      const owned = player.properties.filter(id => id !== propertyId)
      store.update(prevOwner, { properties: owned })
    }
  }
  return true
}

// ── Internal ──────────────────────────────────────────────────────────────────

function setPropertyPrice(propertyId, price) {
  const state = properties.get(propertyId)
  if (!state) return false
  state.price = price
  _persist()
  return true
}

function summonProperty(mp, store, bus, propertyId, summonerId) {
  const state = properties.get(propertyId)
  if (!state || state.pendingOwnerId === null) return false
  const requesterId = state.pendingOwnerId
  const player = store.get(requesterId)
  if (player) mp.sendCustomPacket(player.actorId, 'propertySummon', { propertyId })
  bus.dispatch({ type: 'propertySummoned', propertyId, requesterId, summonedBy: summonerId })
  return true
}

function _persist() {
  if (!persistEnabled) return
  const data = []
  for (const [id, state] of properties) {
    data.push({ id, ownerId: state.ownerId, pendingOwnerId: state.pendingOwnerId, price: state.price, escrowAmount: state.escrowAmount || 0 })
  }
  worldStore.set('ff_properties', data)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[housing] Initializing')
  _loadRegistry()

  // Restore persisted state
  const saved = worldStore.get('ff_properties')
  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (properties.has(entry.id)) {
        const s = properties.get(entry.id)
        s.ownerId        = entry.ownerId
        s.pendingOwnerId = entry.pendingOwnerId
        s.price          = entry.price !== undefined ? entry.price : null
        s.escrowAmount   = entry.escrowAmount || 0
      }
    }
  }

  console.log('[housing] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const owned = getOwnedProperties(userId).map(p => p.id)
  store.update(userId, { properties: owned })
  if (player.holdId) {
    const list = getPropertiesByHold(player.holdId)
    mp.sendCustomPacket(player.actorId, 'propertyList', { properties: list })
  }
}

function resetForTests() {
  persistEnabled = false
  properties.clear()
  _loadRegistry()
}

module.exports = {
  getProperty, getPropertiesByHold, getOwnedProperties, isAvailable,
  requestProperty, approveProperty, denyProperty, revokeProperty,
  setPropertyPrice, summonProperty, resetForTests,
  onConnect, init,
}
