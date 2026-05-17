'use strict'

const worldStore = require('./worldStore')
const inv = require('./inventory')

const CARTS_KEY = 'ff_transport_carts'

const VEHICLE_FORMS = {
  horse:    { name: 'Horse', baseId: 0x00023AB2 },
  cart:     { name: 'Hand Cart', baseId: 0x0006EA46 },
  carriage: { name: 'Carriage', baseId: 0x00068D73 },
}

let carts = null
let persistEnabled = true

function _loadCarts() {
  if (carts) return carts
  const saved = worldStore.get(CARTS_KEY)
  carts = Array.isArray(saved) ? saved : []
  return carts
}

function _saveCarts() {
  if (!persistEnabled) return
  worldStore.set(CARTS_KEY, _loadCarts())
}

function _getCart(cartId) {
  return _loadCarts().find(cart => cart.id === cartId) || null
}

function _ownsCart(cart, playerId) {
  return cart.ownerId === playerId || cart.accessIds.includes(playerId)
}

function createCart(store, ownerId) {
  const owner = store.get(ownerId)
  if (!owner) return { ok: false, message: 'Player not found.' }

  const cart = {
    id: `cart_${Date.now()}_${ownerId}`,
    ownerId,
    accessIds: [],
    holdId: owner.holdId || null,
    inventory: [],
    createdAt: Date.now(),
  }
  _loadCarts().push(cart)
  _saveCarts()
  return { ok: true, message: `Created cart ${cart.id}. Alpha fallback: inventory transport only.`, cart }
}

function listCarts(playerId) {
  return _loadCarts().filter(cart => _ownsCart(cart, playerId))
}

function _getCartItem(cart, baseId) {
  return cart.inventory.find(entry => entry.baseId === baseId) || null
}

function loadCart(mp, store, playerId, cartId, baseId, count) {
  const player = store.get(playerId)
  const cart = _getCart(cartId)
  if (!player || !cart) return { ok: false, message: 'Cart not found.' }
  if (!_ownsCart(cart, playerId)) return { ok: false, message: 'You do not have access to that cart.' }
  if (!count || count <= 0) return { ok: false, message: 'Amount must be positive.' }
  if (!inv.removeItem(mp, player.actorId, baseId, count)) return { ok: false, message: 'You do not have enough of that item.' }

  const existing = _getCartItem(cart, baseId)
  if (existing) existing.count += count
  else cart.inventory.push({ baseId, count })
  _saveCarts()
  return { ok: true, message: `Loaded ${count} of ${baseId.toString(16)} into ${cart.id}.`, cart }
}

function unloadCart(mp, store, playerId, cartId, baseId, count) {
  const player = store.get(playerId)
  const cart = _getCart(cartId)
  if (!player || !cart) return { ok: false, message: 'Cart not found.' }
  if (!_ownsCart(cart, playerId)) return { ok: false, message: 'You do not have access to that cart.' }
  if (!count || count <= 0) return { ok: false, message: 'Amount must be positive.' }

  const existing = _getCartItem(cart, baseId)
  if (!existing || existing.count < count) return { ok: false, message: 'The cart does not have enough of that item.' }
  existing.count -= count
  if (existing.count === 0) cart.inventory = cart.inventory.filter(entry => entry.baseId !== baseId)
  inv.addItem(mp, player.actorId, baseId, count)
  _saveCarts()
  return { ok: true, message: `Unloaded ${count} of ${baseId.toString(16)} from ${cart.id}.`, cart }
}

function probeVehicle(mp, bus, type) {
  const vehicle = VEHICLE_FORMS[type]
  if (!vehicle) return { ok: false, message: 'Unknown vehicle type.' }
  let spawnApi = null
  let actorId = null
  if (typeof mp.createActor === 'function') {
    actorId = mp.createActor(vehicle.baseId, [0, 0, 0], 0, null)
    spawnApi = 'createActor'
  } else if (typeof mp.place === 'function') {
    actorId = mp.place(vehicle.baseId)
    spawnApi = 'place'
  }
  const result = {
    ok: !!actorId,
    message: actorId
      ? `Placed ${vehicle.name} probe ${actorId}. Rideable sync remains unverified; use cart inventory transport for alpha.`
      : `Could not place ${vehicle.name}; use cart inventory transport for alpha.`,
    type,
    actorId,
    spawnApi,
    rideableSync: 'unverified',
    alphaFallback: 'cartInventory',
  }
  if (bus) bus.dispatch({ type: 'transportProbe', vehicleType: type, actorId, spawnApi, rideableSync: result.rideableSync })
  return result
}

function resetForTests() {
  carts = []
  persistEnabled = false
}

function init(mp, store, bus) {
  _loadCarts()
  console.log('[transport] Initialized')
}

module.exports = {
  VEHICLE_FORMS,
  createCart,
  listCarts,
  loadCart,
  unloadCart,
  probeVehicle,
  resetForTests,
  init,
}
