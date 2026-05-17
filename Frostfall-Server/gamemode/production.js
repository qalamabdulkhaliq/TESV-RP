'use strict'

const inv = require('./inventory')
const skills = require('./skills')
const worldStore = require('./worldStore')

const NODE_STATE_KEY = 'ff_production_nodes'
const DEFAULT_RESPAWN_MS = 6 * 60 * 60 * 1000
let nodeState = null
let persistEnabled = true

const RESOURCES = {
  ironOre:   { id: 'ironOre',   name: 'Iron Ore',   baseId: 0x00071CF3, floorPrice: 5 },
  wheat:     { id: 'wheat',     name: 'Wheat',      baseId: 0x0004B0BA, floorPrice: 3 },
  fish:      { id: 'fish',      name: 'Fish',       baseId: 0x00065C9F, floorPrice: 2 },
  lumber:    { id: 'lumber',    name: 'Firewood',   baseId: 0x0006F993, floorPrice: 2 },
  silverOre: { id: 'silverOre', name: 'Silver Ore', baseId: 0x0005ACDF, floorPrice: 12 },
  goldOre:   { id: 'goldOre',   name: 'Gold Ore',   baseId: 0x0005ACDE, floorPrice: 20 },
  quicksilverOre: { id: 'quicksilverOre', name: 'Quicksilver Ore', baseId: 0x0005ACE2, floorPrice: 15 },
  honey:     { id: 'honey',     name: 'Honeycomb',  baseId: 0x000B08C5, floorPrice: 4 },
}

const SITES = [
  { id: 'whiterun_halted_stream_iron', holdId: 'whiterun', name: 'Halted Stream Mine', resourceId: 'ironOre', outputCount: 1, stockMax: 8, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 25 },
  { id: 'whiterun_pelagia_wheat', holdId: 'whiterun', name: 'Pelagia Farm', resourceId: 'wheat', outputCount: 3, stockMax: 12, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'survival', xp: 10 },
  { id: 'whiterun_riverwood_lumber', holdId: 'whiterun', name: 'Riverwood Mill', resourceId: 'lumber', outputCount: 3, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 10 },
  { id: 'rift_goldenglow_honey', holdId: 'rift', name: 'Goldenglow Apiary', resourceId: 'honey', outputCount: 2, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'alchemy', xp: 15 },
  { id: 'rift_riften_fishery', holdId: 'rift', name: 'Riften Fishery', resourceId: 'fish', outputCount: 3, stockMax: 12, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'survival', xp: 10 },
  { id: 'pale_ironbreaker_iron', holdId: 'pale', name: 'Iron-Breaker Mine', resourceId: 'ironOre', outputCount: 1, stockMax: 8, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 25 },
  { id: 'pale_quicksilver_mine', holdId: 'pale', name: 'Quicksilver Mine', resourceId: 'quicksilverOre', outputCount: 1, stockMax: 6, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 30 },
  { id: 'reach_kolskeggr_gold', holdId: 'reach', name: 'Kolskeggr Mine', resourceId: 'goldOre', outputCount: 1, stockMax: 4, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 40 },
  { id: 'reach_cidhna_silver', holdId: 'reach', name: 'Cidhna Mine', resourceId: 'silverOre', outputCount: 1, stockMax: 6, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 30 },
  { id: 'haafingar_katla_wheat', holdId: 'haafingar', name: "Katla's Farm", resourceId: 'wheat', outputCount: 3, stockMax: 12, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'survival', xp: 10 },
  { id: 'haafingar_dragon_bridge_lumber', holdId: 'haafingar', name: 'Dragon Bridge Lumber Camp', resourceId: 'lumber', outputCount: 3, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 10 },
  { id: 'hjaalmarch_morthal_lumber', holdId: 'hjaalmarch', name: 'Morthal Sawmill', resourceId: 'lumber', outputCount: 3, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 10 },
  { id: 'falkreath_forest_lumber', holdId: 'falkreath', name: 'Falkreath Lumber Camp', resourceId: 'lumber', outputCount: 3, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'smithing', xp: 10 },
  { id: 'winterhold_ice_fishing', holdId: 'winterhold', name: 'Winterhold Ice Fishing', resourceId: 'fish', outputCount: 2, stockMax: 10, respawnMs: DEFAULT_RESPAWN_MS, skillId: 'survival', xp: 10 },
]

function getSitesByHold(holdId) {
  return SITES.filter(site => site.holdId === holdId)
}

function getSite(siteId) {
  return SITES.find(site => site.id === siteId) || null
}

function _loadNodeState() {
  if (nodeState) return nodeState
  const saved = worldStore.get(NODE_STATE_KEY)
  nodeState = saved && typeof saved === 'object' ? saved : {}
  for (const site of SITES) {
    if (!nodeState[site.id]) {
      nodeState[site.id] = { stock: site.stockMax || 1, nextRespawnAt: 0 }
    }
  }
  return nodeState
}

function _saveNodeState() {
  if (!persistEnabled) return
  worldStore.set(NODE_STATE_KEY, _loadNodeState())
}

function _refreshNode(site, now) {
  const state = _loadNodeState()[site.id]
  if (state.stock <= 0 && state.nextRespawnAt && now >= state.nextRespawnAt) {
    state.stock = site.stockMax || 1
    state.nextRespawnAt = 0
  }
  return state
}

function getNodeState(siteId) {
  const site = getSite(siteId)
  if (!site) return null
  const state = _loadNodeState()[siteId]
  return Object.assign({}, state)
}

function setNodeStateForTests(siteId, state) {
  _loadNodeState()[siteId] = Object.assign({}, state)
}

function _grantProfessionXp(mp, store, bus, playerId, site) {
  if (!site.skillId || !site.xp) return 0
  const actual = skills.addSkillXp(mp, store, playerId, site.skillId, site.xp)
  if (bus && actual > 0) bus.dispatch({ type: 'skillXpGranted', playerId, skillId: site.skillId, xp: actual, source: 'production', siteId: site.id })
  return actual
}

function workSite(mp, store, bus, playerId, siteId, now) {
  now = now || Date.now()
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }

  const site = getSite(siteId)
  if (!site) return { ok: false, message: 'Unknown production site.' }
  if (player.holdId !== site.holdId) {
    return { ok: false, message: `You must be in ${site.holdId} to work ${site.name}.` }
  }

  const state = _refreshNode(site, now)
  if (state.stock <= 0) {
    return { ok: false, message: `${site.name} is depleted. It will recover later.`, site, nodeState: getNodeState(siteId) }
  }

  const resource = RESOURCES[site.resourceId]
  inv.addItem(mp, player.actorId, resource.baseId, site.outputCount)
  state.stock -= 1
  if (state.stock <= 0) state.nextRespawnAt = now + (site.respawnMs || DEFAULT_RESPAWN_MS)
  _saveNodeState()
  const xpGranted = _grantProfessionXp(mp, store, bus, playerId, site)
  if (bus) bus.dispatch({ type: 'productionWorked', playerId, siteId, resourceId: resource.id, count: site.outputCount, remainingStock: state.stock, nextRespawnAt: state.nextRespawnAt })
  return { ok: true, message: `Worked ${site.name}: +${site.outputCount} ${resource.name}.`, site, resource, count: site.outputCount, remainingStock: state.stock, xpGranted }
}

function sellResource(mp, store, bus, playerId, resourceId, amount) {
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }
  const resource = RESOURCES[resourceId]
  if (!resource) return { ok: false, message: 'Unknown resource.' }
  if (!amount || amount <= 0) return { ok: false, message: 'Amount must be positive.' }

  if (!inv.removeItem(mp, player.actorId, resource.baseId, amount)) {
    return { ok: false, message: `You do not have ${amount} ${resource.name}.` }
  }

  const goldPaid = resource.floorPrice * amount
  inv.addItem(mp, player.actorId, inv.GOLD_BASE_ID, goldPaid)
  const septims = inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID)
  store.update(playerId, { septims })
  if (bus) bus.dispatch({ type: 'resourceSold', playerId, resourceId, amount, goldPaid })
  return { ok: true, message: `Sold ${amount} ${resource.name} for ${goldPaid} Septims.`, goldPaid, resource }
}

function init(mp, store, bus) {
  _loadNodeState()
  console.log('[production] Initialized')
}

function resetForTests() {
  persistEnabled = false
  nodeState = {}
  for (const site of SITES) nodeState[site.id] = { stock: site.stockMax || 1, nextRespawnAt: 0 }
}

module.exports = {
  RESOURCES, SITES, getSitesByHold, getSite,
  getNodeState, setNodeStateForTests,
  workSite, sellResource, resetForTests, init,
}
