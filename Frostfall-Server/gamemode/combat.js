'use strict'

// ── Constants ─────────────────────────────────────────────────────────────────
const LOOT_CAP_GOLD   = 500
const LOOT_CAP_ITEMS  = 3
const BLEED_OUT_MS    = 3 * 60 * 1000   // 180 seconds
const LOOT_SESSION_MS = 60 * 1000       // 60 seconds to make loot selections

// ── Module-level state ────────────────────────────────────────────────────────
const _bleedTimers  = new Map()  // userId → timeoutId
const _lootSessions = new Map()  // sessionId → session object

// ── Communal temple spawn points per hold ─────────────────────────────────────
// Confirmed coords from the older TS gamemode Red House coc-marker pass.
// cellOrWorldDesc format: "formId:pluginFilename" (e.g. "60:Skyrim.esm" for Tamriel).
const HOLD_TEMPLE_SPAWNS = {
  whiterun:   { pos: [225.6, 1080.1, 63.0], cellOrWorldDesc: '0165A7:Skyrim.esm', label: 'Temple of Kynareth' },
  eastmarch:  { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Talos' },
  rift:       { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Temple of Mara' },
  haafingar:  { pos: [1569.1, -709.4, 0], cellOrWorldDesc: '016A02:Skyrim.esm', label: 'Temple of the Divines' },
  reach:      { pos: [-1863.8, -1378.3, 66.1], cellOrWorldDesc: '016DF3:Skyrim.esm', label: 'Temple of Dibella' },
  pale:       { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Hall of the Dead, Dawnstar' },
  falkreath:  { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Hall of the Dead, Falkreath' },
  hjaalmarch: { pos: [0, 0, 0], cellOrWorldDesc: null, label: 'Morthal Shrine' },
  winterhold: { pos: [-22.7, -2985.5, 0.0], cellOrWorldDesc: '01380E:Skyrim.esm', label: 'College of Winterhold Courtyard' },
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isDowned(store, playerId) {
  const player = store.get(playerId)
  return player ? player.isDown : false
}

function _findUserIdByActorId(store, actorId) {
  return (store.getAll().find(p => p.actorId === actorId) || {}).id || null
}

// ── Spawn resolution ──────────────────────────────────────────────────────────

function _getExecutionSpawnPoint(store, housing, playerId) {
  const player = store.get(playerId)
  if (!player) return HOLD_TEMPLE_SPAWNS.whiterun

  // 1. Temple pledge (templeHoldId — set via future /temple pledge command)
  if (player.templeHoldId && HOLD_TEMPLE_SPAWNS[player.templeHoldId]) {
    return HOLD_TEMPLE_SPAWNS[player.templeHoldId]
  }

  // 2. Any owned home property
  const homes = housing.getOwnedProperties(playerId).filter(p => p.type === 'home')
  if (homes.length > 0) {
    return { propertyId: homes[0].id, label: homes[0].name }
  }

  // 3. Hold's communal temple
  if (player.holdId && HOLD_TEMPLE_SPAWNS[player.holdId]) {
    return HOLD_TEMPLE_SPAWNS[player.holdId]
  }

  return HOLD_TEMPLE_SPAWNS.whiterun
}

// Simpler spawn resolution for bleed-out (no housing access needed)
function _simpleRespawnSpawn(store, victimId) {
  const player = store.get(victimId)
  if (!player) return HOLD_TEMPLE_SPAWNS.whiterun
  if (player.templeHoldId && HOLD_TEMPLE_SPAWNS[player.templeHoldId])
    return HOLD_TEMPLE_SPAWNS[player.templeHoldId]
  if (player.holdId && HOLD_TEMPLE_SPAWNS[player.holdId])
    return HOLD_TEMPLE_SPAWNS[player.holdId]
  return HOLD_TEMPLE_SPAWNS.whiterun
}

function _teleportToSpawn(mp, actorId, spawn) {
  if (!spawn) return
  if (spawn.propertyId) {
    mp.sendCustomPacket(actorId, 'teleportToProperty', { propertyId: spawn.propertyId })
    return
  }
  // Skip until real coordinates are filled in
  if (!spawn.cellOrWorldDesc) return
  mp.set(actorId, 'locationalData', {
    pos:             spawn.pos,
    cellOrWorldDesc: spawn.cellOrWorldDesc,
    rot:             [0, 0, 0],
  })
}

// ── Bleed-out timer ───────────────────────────────────────────────────────────

function _clearBleedTimer(victimId) {
  if (_bleedTimers.has(victimId)) {
    clearTimeout(_bleedTimers.get(victimId))
    _bleedTimers.delete(victimId)
  }
}

function _startBleedTimer(mp, store, bus, victimId) {
  _clearBleedTimer(victimId)
  const timerId = setTimeout(() => {
    _bleedTimers.delete(victimId)
    const player = store.get(victimId)
    if (!player || !player.isDown) return
    store.update(victimId, { isDown: false })
    mp.sendCustomPacket(player.actorId, 'playerBledOut', {})
    bus.dispatch({ type: 'playerBledOut', victimId })
    console.log(`[combat] ${player.name} bled out`)
    // Revive in place, then teleport to temple
    mp.set(player.actorId, 'isDead', false)
    const spawn = _simpleRespawnSpawn(store, victimId)
    if (spawn.cellOrWorldDesc) {
      setTimeout(() => _teleportToSpawn(mp, player.actorId, spawn), 500)
    } else {
      console.warn('[combat] ' + player.name + ' bled out — hold "' + (player.holdId || 'none') + '" has no spawn coords, reviving in place. Fill in HOLD_TEMPLE_SPAWNS in combat.js.')
    }
  }, BLEED_OUT_MS)
  _bleedTimers.set(victimId, timerId)
}

// ── Actions ───────────────────────────────────────────────────────────────────

function downPlayer(mp, store, bus, victimId, attackerId) {
  const victim   = store.get(victimId)
  const attacker = store.get(attackerId)
  if (!victim || victim.isDown) return

  store.update(victimId, { isDown: true, downedAt: Date.now() })

  const lootInfo = { lootCapGold: LOOT_CAP_GOLD, lootCapItems: LOOT_CAP_ITEMS }
  mp.sendCustomPacket(victim.actorId, 'playerDowned', lootInfo)
  if (attacker) mp.sendCustomPacket(attacker.actorId, 'targetDowned', { targetName: victim.name })

  bus.dispatch({ type: 'playerDowned', victimId, attackerId, holdId: victim.holdId })
  _startBleedTimer(mp, store, bus, victimId)
}

function handleClientDeathPacket(mp, store, bus, victimId, packetType, packet) {
  const victim = store.get(victimId)
  if (!victim) return { ok: false, message: 'Player not found.' }
  if (victim.isDown) return { ok: true, alreadyDown: true }

  const attackerId = packet && packet.attackerId ? packet.attackerId : null
  downPlayer(mp, store, bus, victimId, attackerId)
  return { ok: true, packetType }
}

function risePlayer(mp, store, bus, playerId) {
  const player = store.get(playerId)
  if (!player) return

  _clearBleedTimer(playerId)
  // Preserve downedAt for NVFL — only clear isDown
  store.update(playerId, { isDown: false })
  mp.sendCustomPacket(player.actorId, 'playerRisen', {})
  bus.dispatch({ type: 'playerRisen', playerId })
}

function revivePlayer(mp, store, bus, reviverId, victimId) {
  const victim  = store.get(victimId)
  const reviver = store.get(reviverId)
  if (!victim || !victim.isDown) return false

  risePlayer(mp, store, bus, victimId)
  mp.set(victim.actorId, 'isDead', false)  // revive in place (no teleport)
  mp.sendCustomPacket(victim.actorId, 'playerRevived', {
    reviverName: reviver ? reviver.name : 'Unknown',
  })
  if (reviver) mp.sendCustomPacket(reviver.actorId, 'revivedTarget', { targetName: victim.name })
  bus.dispatch({ type: 'playerRevived', victimId, reviverId })
  return true
}

function executePlayer(mp, store, bus, prison, housing, executorId, victimId) {
  const victim   = store.get(victimId)
  const executor = store.get(executorId)
  if (!victim || !victim.isDown) return false

  _clearBleedTimer(victimId)
  store.update(victimId, { isDown: false })

  prison.appendPrior(mp, victim.actorId, {
    type:        'execution',
    holdId:      executor ? executor.holdId : null,
    executedBy:  executor ? executor.name : 'Unknown',
    sentencedAt: Date.now(),
  })

  const spawn = _getExecutionSpawnPoint(store, housing, victimId)

  // Player is already dead (downed) — revive, then teleport to execution spawn
  mp.set(victim.actorId, 'isDead', false)
  if (spawn.cellOrWorldDesc || spawn.propertyId) {
    setTimeout(() => _teleportToSpawn(mp, victim.actorId, spawn), 500)
  } else {
    console.warn('[combat] execute: ' + victim.name + ' has no spawn coords for hold "' + (victim.holdId || 'none') + '", reviving in place. Fill in HOLD_TEMPLE_SPAWNS in combat.js.')
  }

  mp.sendCustomPacket(victim.actorId, 'playerExecuted', {
    executorName: executor ? executor.name : 'Unknown',
    spawnLabel:   spawn.label || 'Unknown Location',
  })
  if (executor) mp.sendCustomPacket(executor.actorId, 'executedTarget', { targetName: victim.name })
  bus.dispatch({ type: 'playerExecuted', victimId, executorId })
  return true
}

// ── Loot sessions ─────────────────────────────────────────────────────────────

function openLootSession(mp, store, bus, inv, looterPlayerId, victimPlayerId) {
  const victim = store.get(victimPlayerId)
  const looter = store.get(looterPlayerId)
  if (!victim || !victim.isDown || !looter) return false

  // Gold is an item — one of the 3 slots; cap at LOOT_CAP_GOLD
  const goldCount = Math.min(inv.getItemCount(mp, victim.actorId, inv.GOLD_BASE_ID), LOOT_CAP_GOLD)
  const nonGold   = inv.getAll(mp, victim.actorId).filter(e => e.baseId !== inv.GOLD_BASE_ID)
  const lootable  = goldCount > 0
    ? [{ baseId: inv.GOLD_BASE_ID, count: goldCount }, ...nonGold]
    : nonGold

  const sessionId = `loot_${Date.now()}_${looterPlayerId}`
  _lootSessions.set(sessionId, {
    looterPlayerId,
    victimPlayerId,
    goldCount,
    items:     lootable,
    expiresAt: Date.now() + LOOT_SESSION_MS,
  })

  mp.sendCustomPacket(looter.actorId, 'openLootMenu', {
    sessionId,
    victimName: victim.name,
    items:      lootable,
    maxItems:   LOOT_CAP_ITEMS,
  })
  return true
}

// Called by the customPacket 'lootSelection' handler in commands.js
function completeLootSession(mp, store, bus, inv, looterPlayerId, packet) {
  const { sessionId, selectedItems } = packet
  const session = _lootSessions.get(sessionId)
  if (!session || session.looterPlayerId !== looterPlayerId) return
  if (Date.now() > session.expiresAt) {
    _lootSessions.delete(sessionId)
    return
  }

  _lootSessions.delete(sessionId)

  const victim = store.get(session.victimPlayerId)
  const looter = store.get(looterPlayerId)
  if (!victim || !victim.isDown || !looter) return

  const validIds = new Set(session.items.map(e => e.baseId))
  // Total cap is 3 items — gold counts as one slot
  const toTake = (Array.isArray(selectedItems) ? selectedItems : [])
    .filter(e => validIds.has(e.baseId))
    .slice(0, LOOT_CAP_ITEMS)

  let goldTaken = 0
  for (const entry of toTake) {
    if (entry.baseId === inv.GOLD_BASE_ID) {
      goldTaken = Math.min(entry.count || 0, session.goldCount)
      if (goldTaken > 0) inv.transferItem(mp, victim.actorId, looter.actorId, inv.GOLD_BASE_ID, goldTaken)
    } else {
      inv.transferItem(mp, victim.actorId, looter.actorId, entry.baseId, 1)
    }
  }

  bus.dispatch({
    type:      'playerLooted',
    victimId:  session.victimPlayerId,
    looterPlayerId,
    goldTaken,
    itemCount: toTake.length,
  })
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[combat] Initializing')

  // Property assignment — verified against ScampServerListener.cpp and test_isdead.js.
  // Return false to block the auto-respawn (RespawnWithDelay); player stays dead in downed state.
  mp.onDeath = (actorId, killerId) => {
    const victimId = _findUserIdByActorId(store, actorId)
    if (!victimId) return true  // NPC death — allow normal respawn

    const attackerId = killerId ? _findUserIdByActorId(store, killerId) : null
    downPlayer(mp, store, bus, victimId, attackerId)
    return false  // block auto-respawn; bleed-out timer manages revival
  }

  console.log('[combat] Started')
}

module.exports = {
  isDowned, downPlayer, risePlayer, revivePlayer, executePlayer,
  handleClientDeathPacket, openLootSession, completeLootSession,
  init,
  LOOT_CAP_GOLD, LOOT_CAP_ITEMS, BLEED_OUT_MS, HOLD_TEMPLE_SPAWNS,
}
