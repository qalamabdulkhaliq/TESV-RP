'use strict'

const inv = require('./inventory')
const production = require('./production')

const FLOOR_PRICES = Object.keys(production.RESOURCES).reduce((acc, resourceId) => {
  const resource = production.RESOURCES[resourceId]
  acc[resourceId] = {
    id: resource.id,
    name: resource.name,
    baseId: resource.baseId,
    floorPrice: resource.floorPrice,
  }
  return acc
}, {})

function sellAtFloor({ mp, store, bus, playerId, resourceId, count }) {
  const player = store.get(playerId)
  const resource = FLOOR_PRICES[resourceId]
  const amount = parseInt(count)
  if (!player) return { ok: false, reason: 'player_not_found', message: 'Player not found.' }
  if (!resource) return { ok: false, reason: 'unknown_resource', message: 'Unknown resource.' }
  if (!amount || amount <= 0) return { ok: false, reason: 'invalid_amount', message: 'Amount must be positive.' }

  if (!inv.removeItem(mp, player.actorId, resource.baseId, amount)) {
    return { ok: false, reason: 'missing_items', message: `You do not have ${amount} ${resource.name}.` }
  }

  const goldPaid = resource.floorPrice * amount
  inv.addItem(mp, player.actorId, inv.GOLD_BASE_ID, goldPaid)
  store.update(playerId, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })
  if (bus) bus.dispatch({ type: 'commoditySold', playerId, resourceId, count: amount, goldPaid })
  return { ok: true, message: `Sold ${amount} ${resource.name} for ${goldPaid} Septims.`, goldPaid, resource }
}

module.exports = { FLOOR_PRICES, sellAtFloor }
