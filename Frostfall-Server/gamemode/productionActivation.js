'use strict'

const siteRecords = require('./data/production-sites.json')

function normalizeId(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  const text = String(value).trim()
  if (!text) return null
  const clean = text.toLowerCase().startsWith('0x') ? text.slice(2) : text
  const radix = /[a-f]/i.test(clean) ? 16 : 10
  const parsed = parseInt(clean, radix)
  return Number.isFinite(parsed) ? parsed : null
}

function resolve(packet) {
  if (!packet) return null
  if (packet.siteId) {
    return siteRecords.find(site => site.siteId === packet.siteId) || null
  }

  const targetFormId = normalizeId(packet.targetFormId)
  const baseFormId = normalizeId(packet.baseFormId)
  const activationKind = packet.activationKind || null

  return siteRecords.find(site => {
    if (activationKind && site.activationKind !== activationKind) return false
    if (targetFormId !== null && Array.isArray(site.targetFormIds) && site.targetFormIds.includes(targetFormId)) return true
    if (baseFormId !== null && Array.isArray(site.baseFormIds) && site.baseFormIds.includes(baseFormId)) return true
    return false
  }) || null
}

function handleProductionActivate(mp, store, bus, userId, packet, systems) {
  const player = store.get(userId)
  if (!player) return { ok: false, message: 'Player not found.' }
  const site = resolve(packet)
  if (!site) return { ok: false, message: 'This object is not a Frostfall production site.' }

  const result = systems.production.workSite(mp, store, bus, userId, site.siteId)
  if (bus) {
    bus.dispatch({
      type: 'productionActivated',
      playerId: userId,
      siteId: site.siteId,
      activationKind: site.activationKind,
      ok: result.ok,
    })
  }
  return result
}

function init(mp, store, bus) {
  console.log('[productionActivation] Initialized')
}

module.exports = { siteRecords, normalizeId, resolve, handleProductionActivate, init }
