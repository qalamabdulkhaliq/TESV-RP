'use strict'

const fs = require('fs')
const path = require('path')

const BASE_PLUGINS = new Set(['Skyrim.esm', 'Update.esm', 'Dawnguard.esm', 'HearthFires.esm', 'Dragonborn.esm'])

function analyzeLoadOrder(loadOrder) {
  const entries = Array.isArray(loadOrder) ? loadOrder : []
  const customPlugins = entries.filter(name => !BASE_PLUGINS.has(name))
  return {
    loadOrder: entries,
    customPlugins,
    hasCustomPlugin: customPlugins.length > 0,
    eslNeedsVerification: customPlugins.some(name => /\.esl$/i.test(name)),
  }
}

function readServerSettings() {
  const file = path.join(__dirname, '..', 'server-settings.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { loadOrder: [], error: err.message }
  }
}

function getPluginStatus() {
  const settings = readServerSettings()
  return Object.assign({ gamemodePath: settings.gamemodePath || null }, analyzeLoadOrder(settings.loadOrder), {
    error: settings.error || null,
  })
}

function sendUiStatus(mp, actorId) {
  const payload = {
    alphaUiPath: 'native-skyrim-platform',
    skyUiStatus: 'optional-beta-spike',
    chatPath: 'ChatProperty',
    hudPacket: 'ff_hud_update',
  }
  mp.sendCustomPacket(actorId, 'ff_alpha_ui_status', payload)
  return payload
}

function init(mp, store, bus) {
  console.log('[alphaSpikes] Initialized')
}

module.exports = { analyzeLoadOrder, readServerSettings, getPluginStatus, sendUiStatus, init }
