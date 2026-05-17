'use strict'

const WILDLIFE_BY_HOLD = {
  whiterun: [
    { name: 'Wolf', baseId: 0x00023ABE, pos: [0, 0, 0], count: 1 },
    { name: 'Elk', baseId: 0x00023A91, pos: [120, 60, 0], count: 1 },
  ],
  eastmarch: [
    { name: 'Ice Wolf', baseId: 0x00023ABF, pos: [0, 0, 0], count: 1 },
    { name: 'Snow Bear', baseId: 0x00023A8B, pos: [150, 40, 0], count: 1 },
  ],
  rift: [
    { name: 'Bear', baseId: 0x00023A8A, pos: [0, 0, 0], count: 1 },
    { name: 'Wolf', baseId: 0x00023ABE, pos: [90, -60, 0], count: 1 },
  ],
  reach: [
    { name: 'Sabre Cat', baseId: 0x00023AB5, pos: [0, 0, 0], count: 1 },
    { name: 'Cave Bear', baseId: 0x00023A8C, pos: [-80, 80, 0], count: 1 },
  ],
  haafingar: [
    { name: 'Wolf', baseId: 0x00023ABE, pos: [0, 0, 0], count: 1 },
    { name: 'Mudcrab', baseId: 0x000E4010, pos: [70, 100, 0], count: 2 },
  ],
  pale: [
    { name: 'Snow Wolf', baseId: 0x00023ABF, pos: [0, 0, 0], count: 1 },
    { name: 'Horker', baseId: 0x00023AB1, pos: [100, 80, 0], count: 1 },
  ],
  falkreath: [
    { name: 'Wolf', baseId: 0x00023ABE, pos: [0, 0, 0], count: 2 },
    { name: 'Bear', baseId: 0x00023A8A, pos: [140, -70, 0], count: 1 },
  ],
  hjaalmarch: [
    { name: 'Frostbite Spider', baseId: 0x00023AA8, pos: [0, 0, 0], count: 1 },
    { name: 'Mudcrab', baseId: 0x000E4010, pos: [80, 60, 0], count: 2 },
  ],
  winterhold: [
    { name: 'Ice Wolf', baseId: 0x00023ABF, pos: [0, 0, 0], count: 1 },
    { name: 'Snowy Sabre Cat', baseId: 0x00023AB6, pos: [-100, 60, 0], count: 1 },
  ],
}

const DUNGEON_GROUPS = {
  bleak_falls_basic: {
    name: 'Bleak Falls Barrow Basic',
    cellOrWorldDesc: '0002D74F:Skyrim.esm',
    spawns: [
      { name: 'Draugr', baseId: 0x0003B547, pos: [0, 0, 0], count: 1 },
      { name: 'Skeever', baseId: 0x00023A93, pos: [180, 0, 0], count: 2 },
    ],
  },
  embershard_basic: {
    name: 'Embershard Mine Wildlife',
    cellOrWorldDesc: '00015C5E:Skyrim.esm',
    spawns: [
      { name: 'Skeever', baseId: 0x00023A93, pos: [0, 0, 0], count: 2 },
      { name: 'Frostbite Spider', baseId: 0x00023AA8, pos: [130, 30, 0], count: 1 },
    ],
  },
}

function _placeSpawn(mp, spawn, cellOrWorldDesc) {
  const actorIds = []
  let spawnApi = null
  const count = spawn.count || 1
  for (let i = 0; i < count; i++) {
    const pos = [spawn.pos[0] + i * 48, spawn.pos[1], spawn.pos[2]]
    let actorId = null
    if (typeof mp.createActor === 'function') {
      actorId = mp.createActor(spawn.baseId, pos, 0, cellOrWorldDesc || null)
      spawnApi = 'createActor'
    } else if (typeof mp.place === 'function') {
      actorId = mp.place(spawn.baseId)
      spawnApi = 'place'
    }
    if (!actorId) continue
    actorIds.push(actorId)
    if (spawnApi === 'place' && cellOrWorldDesc && typeof mp.set === 'function') {
      mp.set(actorId, 'locationalData', {
        pos,
        cellOrWorldDesc,
        rot: [0, 0, 0],
      })
    }
  }
  return { actorIds, spawnApi }
}

function spawnWildlife(mp, bus, holdId) {
  const spawns = WILDLIFE_BY_HOLD[holdId]
  if (!spawns) return { ok: false, message: 'Unknown hold.' }

  const actorIds = []
  let spawnApi = null
  for (const spawn of spawns) {
    const placed = _placeSpawn(mp, spawn, null)
    actorIds.push(...placed.actorIds)
    spawnApi = spawnApi || placed.spawnApi
  }
  if (bus) bus.dispatch({ type: 'pveWildlifeSpawned', holdId, actorIds })
  return { ok: true, message: `Spawned ${actorIds.length} wildlife actors for ${holdId}.`, actorIds, spawns, spawnApi }
}

function spawnDungeon(mp, bus, groupId) {
  const group = DUNGEON_GROUPS[groupId]
  if (!group) return { ok: false, message: 'Unknown dungeon group.' }

  const actorIds = []
  let spawnApi = null
  for (const spawn of group.spawns) {
    const placed = _placeSpawn(mp, spawn, group.cellOrWorldDesc)
    actorIds.push(...placed.actorIds)
    spawnApi = spawnApi || placed.spawnApi
  }
  if (bus) bus.dispatch({ type: 'pveDungeonSpawned', groupId, actorIds })
  return { ok: true, message: `Spawned ${actorIds.length} dungeon mobs for ${group.name}.`, actorIds, group, spawnApi }
}

function init(mp, store, bus) {
  console.log('[pve] Initialized')
}

module.exports = { WILDLIFE_BY_HOLD, DUNGEON_GROUPS, spawnWildlife, spawnDungeon, init }
