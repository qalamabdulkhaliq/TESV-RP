'use strict'

const store    = require('./store')
const bus      = require('./bus')
const hunger   = require('./hunger')
const drunkBar = require('./drunkBar')
const economy  = require('./economy')
const courier  = require('./courier')
const housing  = require('./housing')
const bounty   = require('./bounty')
const combat   = require('./combat')
const captivity = require('./captivity')
const medical   = require('./medical')
const interactionState = require('./interactionState')
const prison   = require('./prison')
const factions = require('./factions')
const college  = require('./college')
const skills   = require('./skills')
const training  = require('./training')
const treasury  = require('./treasury')
const production = require('./production')
const shop       = require('./shop')
const productionActivation = require('./productionActivation')
const skillUi    = require('./skillUi')
const identityOverlay = require('./identityOverlay')
const pve       = require('./pve')
const transport = require('./transport')
const roleplay  = require('./roleplay')
const nvfl      = require('./nvfl')
const inventory = require('./inventory')
const magic     = require('./magic')
const papyrusBridge = require('./papyrusBridge')
const alphaSpikes = require('./alphaSpikes')
const espAssetRegistry = require('./espAssetRegistry')
const engineProbes = require('./engineProbes')
const modSourceRegistry = require('./modSourceRegistry')
const commands  = require('./commands')
const hudSync   = require('./hudSync')
const chat        = require('./chat')
const cp          = require('./chatProperty')
const ep          = require('./evalProperty')
const bp          = require('./browserProperty')
const dp          = require('./dialogProperty')
const hudMenu       = require('./hudMenu')
const permissions   = require('./permissions')
const packetUtils   = require('./packetUtils')

// ─── mp is a global set by server's requireUncached ──────────────────────
// Wrap in Proxy so sendCustomPacket handles both 2-arg native (userId, jsonStr)
// and our 3-arg (actorId, typeName, payloadObj) — native property is read-only.
// sendCustomPacket expects a userId (connection ID, e.g. 1), NOT a formId/actorId.
// All callers pass p.actorId (0xFF000000+), so we resolve to userId via store lookup.
var _server = globalThis.mp
var mp = new Proxy(_server, {
  get: function (target, prop) {
    if (prop === 'sendCustomPacket') {
      return function () {
        var firstArg = arguments[0]
        var resolved = packetUtils.resolveCustomPacketTarget(store, firstArg)
        if (!resolved.ok) {
          console.warn('[gamemode] skipped sendCustomPacket to ' + firstArg + ': ' + resolved.reason)
          return false
        }
        var sendId = resolved.userId
        if (arguments.length === 3) {
          var payload = arguments[2] || {}
          return target.sendCustomPacket(sendId, JSON.stringify(Object.assign({ customPacketType: arguments[1] }, payload)))
        }
        return target.sendCustomPacket(sendId, arguments[1])
      }
    }
    var val = target[prop]
    return typeof val === 'function' ? val.bind(target) : val
  }
})

console.log('[gamemode] Frostfall Roleplay — initializing')

// ── ChatProperty + EvalProperty + DialogProperty (React widget bridge) ─
ep.EvalProperty.init()
bp.BrowserProperty.init(mp)
dp.DialogProperty.init(mp)
cp.ChatProperty.init()

// ── Helpers ──────────────────────────────────────────────────────────────

function makeSimpleActorProperty(mp, name) {
  mp.makeProperty(name, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })
}

function registerActorStateProperties(mp) {
  makeSimpleActorProperty(mp, 'ff_role')
  makeSimpleActorProperty(mp, 'ff_bounty')
  makeSimpleActorProperty(mp, 'ff_courier')
  makeSimpleActorProperty(mp, 'ff_memberships')
  makeSimpleActorProperty(mp, 'ff_description')
  makeSimpleActorProperty(mp, 'ff_characterReady')
  makeSimpleActorProperty(mp, 'ff_priors')
}

function findPlayerByActor(store, actorId) {
  var list = store.getAll()
  for (var i = 0; i < list.length; i++) {
    if (list[i].actorId === actorId) return list[i]
  }
  return null
}

function getNearbyActorIds(mp, store, actorId, range) {
  var pos = mp.get(actorId, 'pos')
  if (!pos) return [actorId]
  var list = store.getAll()
  var out = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!p.actorId) continue
    if (p.actorId === actorId) { out.push(actorId); continue }
    var ppos = mp.get(p.actorId, 'pos')
    if (!ppos) continue
    if (dist3d(pos, ppos) <= range) out.push(p.actorId)
  }
  return out
}

function dist3d(a, b) {
  var ax = Array.isArray(a) ? a[0] : a.x
  var ay = Array.isArray(a) ? a[1] : a.y
  var az = Array.isArray(a) ? a[2] : a.z
  var bx = Array.isArray(b) ? b[0] : b.x
  var by = Array.isArray(b) ? b[1] : b.y
  var bz = Array.isArray(b) ? b[2] : b.z
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

// ── Controller for ChatMessage (distance, name, settings) ────────────
var chatController = {
  getName: function (actorId) {
    var p = findPlayerByActor(store, actorId)
    return p ? p.name : 'Stranger'
  },
  getActorDistanceSquared: function (actorId1, actorId2) {
    var pos1 = mp.get(actorId1, 'pos')
    var pos2 = mp.get(actorId2, 'pos')
    if (!pos1 || !pos2) return Infinity
    return Math.pow(dist3d(pos1, pos2), 2)
  },
  getServerSetting: function (name) {
    try { return mp.getServerSettings()[name] } catch (e) { return undefined }
  },
}

cp.ChatProperty.setChatInputHandler(function (input) {
  var player = findPlayerByActor(store, input.actorId)
  if (!player) return

  // Normalize non-slash input to /say
  var raw = input.inputText.trimStart()
  if (!raw.startsWith('/')) { raw = '/say ' + raw }

  // Parse /command and display text
  var parts = raw.match(/^\/(\w+)\s*(.*)$/)
  var cmd = parts ? parts[1].toLowerCase() : 'say'
  var text = parts ? (parts[2] || '') : raw

  // Apply markup markers for formatting via parseChatMessage
  var isRp = false
  switch (cmd) {
    case 'say':
      isRp = true
      break
    case 'me':
    case 'em':
      text = '*' + text + '*'
      isRp = true
      break
    case 'do':
      text = '((' + text + '))'
      isRp = true
      break
    case 'yell':
    case 'y':
      text = '\u2116' + text + '\u2116'
      isRp = true
      break
    case 'whisper':
    case 'w':
      text = '%' + text + '%'
      isRp = true
      break
    case 'clear':
      var v = mp.get(input.actorId, 'chat') || {};
      v.pendingClear = true;
      mp.set(input.actorId, 'chat', v);
      return
  }

  if (!isRp) {
    commands.dispatch(player.id, raw)
    return
  }

  var msg = new cp.ChatMessage(input.actorId, 0, text, 'plain', chatController)
  // Build recipient list from actorNeighbors (intersected with online) per spec
  var onlinePlayers = mp.get(0, 'onlinePlayers') || []
  var actorNeighbors = mp.get(input.actorId, 'actorNeighbors') || []
  var targets = []
  if (Array.isArray(onlinePlayers) && Array.isArray(actorNeighbors)) {
    for (var ni = 0; ni < actorNeighbors.length; ni++) {
      var nid = actorNeighbors[ni]
      if (onlinePlayers.indexOf(nid) !== -1) targets.push(nid)
    }
  }
  // Fallback: use distance-based nearby if neighbors list is empty
  if (targets.length === 0) {
    targets = getNearbyActorIds(mp, store, input.actorId, 3000)
  }
  for (var ti = 0; ti < targets.length; ti++) {
    cp.ChatProperty.sendChatMessage(targets[ti], msg)
  }
})

// ── Player lifecycle — single listeners, systems called in order ─────────
// NOTE: connect fires BEFORE the actor is assigned.  We register the user
// immediately but defer actor-dependent init until getUserActor returns valid.
function seedActorProperty(mp, actorId, key, defaultValue) {
  try {
    mp.get(actorId, key)
    return
  } catch (err) {
    try {
      mp.set(actorId, key, defaultValue)
      console.log('[gamemode] seeded missing actor property ' + key + ' for ' + actorId.toString(16))
    } catch (setErr) {
      console.warn('[gamemode] could not seed actor property ' + key + ': ' + setErr.message)
    }
  }
}

function seedActorProperties(mp, actorId) {
  seedActorProperty(mp, actorId, 'ff_hunger', 10)
  seedActorProperty(mp, actorId, 'ff_drunk', 0)
  seedActorProperty(mp, actorId, 'ff_bounty', [])
  seedActorProperty(mp, actorId, 'ff_courier', [])
  seedActorProperty(mp, actorId, 'ff_memberships', [])
  seedActorProperty(mp, actorId, 'ff_study_xp', 0)
  seedActorProperty(mp, actorId, 'ff_lecture_boost', 0)
  seedActorProperty(mp, actorId, 'ff_skill_xp', {})
  seedActorProperty(mp, actorId, 'ff_study_boosts', [])
  seedActorProperty(mp, actorId, 'ff_description', '')
  seedActorProperty(mp, actorId, 'ff_characterReady', false)
  seedActorProperty(mp, actorId, 'ff_priors', [])
}

function deferredActorInit(mp, store, bus, userId, attempt) {
  attempt = attempt || 0
  var actorId = mp.getUserActor(userId)
  if (!actorId) {
    if (attempt < 30) {
      console.log('[gamemode] poll: actor ' + userId + ' not ready (attempt ' + (attempt + 1) + '/30), retrying in 200ms')
      setTimeout(deferredActorInit, 200, mp, store, bus, userId, attempt + 1)
    } else {
      console.error('[gamemode] poll: actor ' + userId + ' never became ready after 30 attempts')
    }
    return
  }
  // Enable chat widget — must be outside the property-init try-catch so
  // it works even when subsequent onConnect calls throw (e.g. missing 'inv').
  cp.ChatProperty.showChat(actorId)

  try {
    var name = mp.getActorName(actorId) || 'User' + userId
    console.log('[gamemode] ' + name + ' (' + userId + ') actor ' + actorId.toString(16))
    seedActorProperties(mp, actorId)
    store.register(userId, actorId, name)
    bus.dispatch({ type: 'playerJoined', playerId: userId, actorId: actorId, name: name })
    // Restore per-system state (order: economy before stipend tick can fire)
    permissions.onConnect(mp, store, bus, userId)
    hunger.onConnect(mp, store, bus, userId)
    drunkBar.onConnect(mp, store, bus, userId)
    economy.onConnect(mp, store, bus, userId)
    bounty.onConnect(mp, store, bus, userId)
    factions.onConnect(mp, store, bus, userId)
    housing.onConnect(mp, store, bus, userId)
    college.onConnect(mp, store, bus, userId)
    skills.onConnect(mp, store, bus, userId)
    courier.onConnect(mp, store, bus, userId)
    hudSync.onConnect(mp, store, bus, userId)
    hudMenu.onConnect(mp, store, bus, userId)
  } catch (err) {
    console.error('[gamemode] actor init error for ' + userId + ': ' + err.message)
  }
}

mp.on('connect', (userId) => {
  store.register(userId, 0, 'User' + userId)
  console.log('[gamemode] User' + userId + ' (' + userId + ') connected (actor pending)')
  deferredActorInit(mp, store, bus, userId)
})

mp.on('disconnect', (userId) => {
  try {
    const player = store.get(userId)
    if (player) console.log(`[gamemode] ${player.name} (${userId}) disconnected`)
    skills.onSkillPlayerDisconnect(mp, userId)
    store.deregister(userId)
  } catch (err) {
    console.error(`[gamemode] disconnect error for ${userId}: ${err.message}`)
  }
})

// ── Incoming custom packets from clients ─────────────────────────────────
mp.on('customPacket', (userId, contentJson) => {
  try {
    const content = JSON.parse(contentJson)
    const type = content.customPacketType || ''
    switch (type) {
      // Chat is handled entirely through ChatProperty/makeEventSource.
      // The old ff_chat_message custom-packet path (frostfall-chat-plugin) is removed.
      case 'ff_production_activate':
        productionActivation.handleProductionActivate(mp, store, bus, userId, content, { production })
        break
      case 'ff_death_start':
      case 'ff_enter_bleedout':
        combat.handleClientDeathPacket(mp, store, bus, userId, type, content)
        break
      // Add future packet types here.
    }
  } catch (err) {
    console.error(`[gamemode] customPacket error from ${userId}: ${err.message}`)
  }
})

// ── System init (order matters: courier before housing/prison) ────────────
hunger.init(mp, store, bus)
drunkBar.init(mp, store, bus)
economy.init(mp, store, bus)
courier.init(mp, store, bus)
housing.init(mp, store, bus)
bounty.init(mp, store, bus)
combat.init(mp, store, bus)
captivity.init(mp, store, bus)
medical.init(mp, store, bus)
interactionState.init(mp, store, bus)
prison.init(mp, store, bus)
factions.init(mp, store, bus)
college.init(mp, store, bus)
skills.init(mp, store, bus)
training.init(mp, store, bus)
treasury.init(mp, store, bus)
production.init(mp, store, bus)
shop.init(mp, store, bus)
productionActivation.init(mp, store, bus)
skillUi.init(mp, store, bus)
identityOverlay.init(mp, store, bus)
pve.init(mp, store, bus)
transport.init(mp, store, bus)
roleplay.init(mp, store, bus)
papyrusBridge.init(mp, store, bus)
alphaSpikes.init(mp, store, bus)
espAssetRegistry.init(mp, store, bus)
engineProbes.init(mp, store, bus)
modSourceRegistry.init(mp, store, bus)
magic.init(mp, store, bus)
registerActorStateProperties(mp)
hudSync.init(mp, store, bus)
hudMenu.init(mp, store, bus, dp)
chat.init(mp, store, bus)
permissions.init(mp, store, bus)

// ── Command layer ─────────────────────────────────────────────────────────
commands.registerAll(mp, store, bus, {
  hunger, drunkBar, economy, housing, bounty,
  combat, nvfl, captivity, medical, interactionState, prison, factions,
  college, skills, training, treasury, production, pve, transport, roleplay, inventory, magic,
  papyrusBridge, alphaSpikes, espAssetRegistry, engineProbes, modSourceRegistry, skillUi, identityOverlay,
})

console.log('[gamemode] Frostfall Roleplay — ready')
