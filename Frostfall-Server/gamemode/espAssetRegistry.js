'use strict'

const ASSET_PACK = require('./data/esp-asset-pack.json')

function _normalizeFormId(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return '0x' + value.toString(16).toUpperCase()
  const text = String(value).trim()
  if (!text) return null
  const clean = text.toLowerCase().startsWith('0x') ? text.slice(2) : text
  const parsed = parseInt(clean, 16)
  if (!Number.isFinite(parsed)) return null
  return '0x' + parsed.toString(16).toUpperCase()
}

function getRecordFamilies() {
  return Array.from(new Set(ASSET_PACK.records.map(record => record.family))).sort()
}

function findRecord(plugin, localFormId, editorId) {
  const normalized = _normalizeFormId(localFormId)
  return ASSET_PACK.records.find(record => {
    if (plugin && record.plugin && record.plugin.toLowerCase() !== String(plugin).toLowerCase()) return false
    const recordPlugin = record.plugin || ASSET_PACK.plugin
    if (plugin && recordPlugin.toLowerCase() !== String(plugin).toLowerCase()) return false
    if (editorId && record.editorId !== editorId) return false
    if (normalized && _normalizeFormId(record.localFormId) !== normalized) return false
    return true
  }) || null
}

function validateRecord(plugin, localFormId, editorId) {
  const record = findRecord(plugin, localFormId, editorId)
  if (!record) {
    return {
      ok: false,
      message: `Record ${editorId || localFormId || 'unknown'} is not registered in ${ASSET_PACK.plugin}.`,
    }
  }
  return { ok: true, record: Object.assign({ plugin: record.plugin || ASSET_PACK.plugin }, record) }
}

function init(mp, store, bus) {
  console.log('[espAssetRegistry] Loaded ' + ASSET_PACK.records.length + ' asset manifest records')
}

module.exports = { ASSET_PACK, getRecordFamilies, findRecord, validateRecord, init }
