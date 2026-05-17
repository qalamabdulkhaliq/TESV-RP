'use strict'

const fs = require('fs')
const path = require('path')

const BASE_PLUGIN_ORDER = ['Skyrim.esm', 'Update.esm', 'Dawnguard.esm', 'HearthFires.esm', 'Dragonborn.esm']
const BASE_PLUGINS = new Set(BASE_PLUGIN_ORDER)

function _hasFile(files, name) {
  return files && files.has(name)
}

function _status(condition, passed, blocked) {
  return condition ? passed : blocked
}

function _hasVanillaMasterPrefix(loadOrder) {
  if (loadOrder.length < BASE_PLUGIN_ORDER.length) return false
  for (let i = 0; i < BASE_PLUGIN_ORDER.length; i++) {
    if (String(loadOrder[i]).toLowerCase() !== BASE_PLUGIN_ORDER[i].toLowerCase()) return false
  }
  return true
}

function analyzeLoadOrderGate(settings, options) {
  options = options || {}
  const loadOrder = Array.isArray(settings && settings.loadOrder) ? settings.loadOrder : []
  const archives = Array.isArray(settings && settings.archives) ? settings.archives : []
  const files = options.availableFiles || new Set()
  const manifestPlugin = options.manifestPlugin || 'FrostfallProduction.esp'
  const requiredArchive = options.requiredArchive || null
  const requiredLooseAsset = options.requiredLooseAsset || null
  const customPlugins = loadOrder.filter(name => !BASE_PLUGINS.has(name))
  const hasManifestPlugin = loadOrder.some(name => name.toLowerCase() === manifestPlugin.toLowerCase())
  const manifestFilePresent = _hasFile(files, manifestPlugin)
  const configuredEsl = loadOrder.some(name => /\.esl$/i.test(name))

  const checks = {
    vanillaMasters: {
      status: _hasVanillaMasterPrefix(loadOrder) ? 'passed' : 'blocked',
      message: 'Vanilla masters must be the canonical first five entries before custom plugin probes run.',
    },
    customEsp: {
      status: _status(hasManifestPlugin && manifestFilePresent, 'passed', 'blocked'),
      message: hasManifestPlugin
        ? `${manifestPlugin} is configured${manifestFilePresent ? ' and present.' : ' but missing from available files.'}`
        : `${manifestPlugin} is not in server-settings loadOrder.`,
    },
    esl: {
      status: configuredEsl ? 'needs-live-evidence' : 'separate-test-required',
      message: configuredEsl ? 'An ESL is configured; capture live FormID evidence.' : 'No ESL configured; test light plugin behavior separately.',
    },
    archive: {
      status: requiredArchive ? _status(archives.includes(requiredArchive) && _hasFile(files, requiredArchive), 'passed', 'blocked') : 'not-required',
      message: requiredArchive ? `${requiredArchive} must be listed in archives and present.` : 'No custom archive required for this gate run.',
    },
    looseAsset: {
      status: requiredLooseAsset ? _status(_hasFile(files, requiredLooseAsset), 'passed', 'blocked') : 'not-required',
      message: requiredLooseAsset ? `${requiredLooseAsset} must exist as a loose asset for override/path testing.` : 'No loose asset required for this gate run.',
    },
    formResolution: {
      status: options.formResolution && options.formResolution.ok ? 'passed' : 'blocked',
      message: options.formResolution && options.formResolution.ok ? 'Manifest FormID resolution passed.' : 'No successful FormID resolution evidence recorded.',
    },
  }

  const blocking = Object.keys(checks).filter(key => checks[key].status === 'blocked')
  return {
    ok: blocking.length === 0,
    manifestPlugin,
    customPlugins,
    blocking,
    checks,
  }
}

function readSettings(settingsPath) {
  const file = settingsPath || path.join(__dirname, '..', 'server-settings.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function _parseFormId(value) {
  if (typeof value === 'number') return value
  const text = String(value || '').trim()
  if (!text) return NaN
  const clean = text.toLowerCase().startsWith('0x') ? text.slice(2) : text
  return parseInt(clean, 16)
}

function validateLightPluginLocalFormId(localFormId) {
  const parsed = _parseFormId(localFormId)
  const ok = Number.isFinite(parsed) && parsed >= 0x800 && parsed <= 0xFFF
  return {
    ok,
    localFormId,
    message: ok
      ? 'Light plugin local FormID is within the valid 0x800-0xFFF range.'
      : 'Light plugin local FormID must be in the 0x800-0xFFF range.',
  }
}

function init(mp, store, bus) {
  console.log('[loadOrderGate] Initialized')
}

module.exports = { BASE_PLUGINS, BASE_PLUGIN_ORDER, analyzeLoadOrderGate, readSettings, validateLightPluginLocalFormId, init }
