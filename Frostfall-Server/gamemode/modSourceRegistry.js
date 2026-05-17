'use strict'

const MODS = [
  {
    id: 'campfire',
    name: 'Campfire - Complete Camping System',
    nexus: 'https://www.nexusmods.com/skyrimspecialedition/mods/667',
    source: 'https://github.com/chesko256/Campfire',
    permissionStatus: 'MIT source for Chesko-owned code; Nexus page may require login for full permissions.',
    authority: 'server',
    useFor: ['camping patterns', 'fire/shelter concepts', 'Papyrus source study'],
    restrictions: [
      'Do not assume meshes, Flash, PapyrusUtil, or third-party components are MIT-covered.',
      'Use client scripts as observation/presentation only; server owns camping state.',
    ],
    redistributeAssets: false,
  },
  {
    id: 'frostfall',
    name: 'Frostfall - Hypothermia Camping Survival',
    nexus: 'https://www.nexusmods.com/skyrimspecialedition/mods/671',
    source: 'https://github.com/chesko256/Campfire',
    permissionStatus: 'MIT source reference for Chesko-owned code with explicit asset/component exceptions.',
    authority: 'server',
    useFor: ['survival patterns', 'exposure/warmth concepts', 'weather response', 'survival UI reference'],
    restrictions: [
      'Most assets are not automatically reusable; verify assets separately.',
      'SkyUI Flash, PapyrusUtil, and Brawl Bug Fix components are excluded or separately constrained.',
      'Client may report exposure observations, but server owns final survival state.',
    ],
    redistributeAssets: false,
  },
  {
    id: 'realmOfLorkhan',
    name: 'Realm of Lorkhan - Freeform Alternate Start',
    nexus: 'https://www.nexusmods.com/skyrimspecialedition/mods/18223',
    source: null,
    permissionStatus: 'User-reported twoCrows permission needs artifact before redistribution.',
    authority: 'server',
    useFor: ['OOC starter realm', 'spawn choice presentation', 'character setup flow'],
    restrictions: [
      'Do not redistribute assets until the permission artifact is stored in project records.',
      'Starter choices and spawn permissions remain server-authoritative.',
    ],
    redistributeAssets: false,
  },
]

function listMods() {
  return MODS.slice()
}

function getMod(id) {
  return MODS.find(mod => mod.id === id) || null
}

function canRedistributeAssets(id) {
  const mod = getMod(id)
  return !!(mod && mod.redistributeAssets === true)
}

function getIntegrationSummary() {
  return MODS.map(mod => ({
    id: mod.id,
    authority: mod.authority,
    permissionStatus: mod.permissionStatus,
    canRedistributeAssets: canRedistributeAssets(mod.id),
  }))
}

function init(mp, store, bus) {
  console.log('[modSourceRegistry] Loaded ' + MODS.length + ' source candidates')
}

module.exports = { listMods, getMod, canRedistributeAssets, getIntegrationSummary, init }
