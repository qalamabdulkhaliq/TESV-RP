/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "fs"
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
(module) {

module.exports = require("fs");

/***/ },

/***/ "path"
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
(module) {

module.exports = require("path");

/***/ },

/***/ "./alphaSpikes.js"
/*!************************!*\
  !*** ./alphaSpikes.js ***!
  \************************/
(module, __unused_webpack_exports, __webpack_require__) {



const fs = __webpack_require__(/*! fs */ "fs")
const path = __webpack_require__(/*! path */ "path")

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


/***/ },

/***/ "./auditLog.js"
/*!*********************!*\
  !*** ./auditLog.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



const fs = __webpack_require__(/*! fs */ "fs")
const path = __webpack_require__(/*! path */ "path")

const LOG_DIR = path.join(__dirname, '..', 'logs')
const AUDIT_LOG_FILE = path.join(LOG_DIR, 'staff-audit.jsonl')

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
}

function audit(type, payload) {
  const entry = Object.assign({ at: Date.now(), type }, payload || {})
  try {
    ensureLogDir()
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n')
    return entry
  } catch (err) {
    console.error('[auditLog] Failed to append audit:', err && err.message ? err.message : err)
    return entry
  }
}

function commandAudit(player, rawCommand, result) {
  return audit('command', {
    playerId: player ? player.id : null,
    actorId: player ? player.actorId : null,
    name: player ? player.name : null,
    rawCommand,
    result,
  })
}

module.exports = { AUDIT_LOG_FILE, audit, commandAudit }


/***/ },

/***/ "./bounty.js"
/*!*******************!*\
  !*** ./bounty.js ***!
  \*******************/
(module) {



var GUARD_KOID_THRESHOLD = 1000

function loadBounties(mp, actorId) {
  var raw = mp.get(actorId, 'ff_bounty')
  return Array.isArray(raw) ? raw : []
}

function saveBounties(mp, actorId, records) {
  mp.set(actorId, 'ff_bounty', records)
}

function buildBountyMap(records) {
  var map = {}
  for (var i = 0; i < records.length; i++) {
    var r = records[i]
    if (r.amount > 0) map[r.holdId] = r.amount
  }
  return map
}

function getBounty(mp, store, playerId, holdId) {
  var player = store.get(playerId)
  if (!player) return 0
  var records = loadBounties(mp, player.actorId)
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) return records[i].amount
  }
  return 0
}

function getAllBounties(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return []
  return loadBounties(mp, player.actorId).filter(function (r) { return r.amount > 0 })
}

function isGuardKoid(mp, store, playerId, holdId) {
  return getBounty(mp, store, playerId, holdId) >= GUARD_KOID_THRESHOLD
}

function addBounty(mp, store, bus, playerId, holdId, amount) {
  if (amount <= 0) return false
  var player = store.get(playerId)
  if (!player) return false

  var records = loadBounties(mp, player.actorId)
  var existing = null
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) { existing = records[i]; break }
  }

  var newAmount
  if (existing) {
    existing.amount += amount
    existing.updatedAt = Date.now()
    newAmount = existing.amount
  } else {
    records.push({ holdId: holdId, amount: amount, updatedAt: Date.now() })
    newAmount = amount
  }

  saveBounties(mp, player.actorId, records)

  var bountyMap = buildBountyMap(records)
  store.update(playerId, { bounty: bountyMap })

  bus.dispatch({ type: 'bountyChanged', playerId: playerId, holdId: holdId, newAmount: newAmount, delta: amount })

  mp.sendCustomPacket(player.actorId, 'bountyUpdate', { holdId: holdId, amount: newAmount })
  console.log('[Bounty] +' + amount + ' gold bounty on ' + player.name + ' in ' + holdId + ' (total in hold: ' + newAmount + ')')
  return true
}

function clearBounty(mp, store, bus, playerId, holdId) {
  var player = store.get(playerId)
  if (!player) return false

  var records = loadBounties(mp, player.actorId)
  var before = null
  for (var i = 0; i < records.length; i++) {
    if (records[i].holdId === holdId) { before = records[i]; break }
  }
  if (!before || before.amount === 0) return false

  var cleared = before.amount
  before.amount = 0
  before.updatedAt = Date.now()

  saveBounties(mp, player.actorId, records)

  var bountyMap = buildBountyMap(records)
  store.update(playerId, { bounty: bountyMap })

  bus.dispatch({ type: 'bountyChanged', playerId: playerId, holdId: holdId, newAmount: 0, delta: -cleared })

  mp.sendCustomPacket(player.actorId, 'bountyUpdate', { holdId: holdId, amount: 0 })
  console.log('[Bounty] Cleared ' + cleared + ' gold bounty on ' + player.name + ' in ' + holdId)
  return true
}

function init(mp, store, bus) {
  console.log('[bounty] Initializing')

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var player = store.get(playerId)
    if (!player) return

    var records = loadBounties(mp, player.actorId)
    var bountyMap = buildBountyMap(records)
    store.update(playerId, { bounty: bountyMap })

    if (records.length > 0) {
      mp.sendCustomPacket(player.actorId, 'bountySync', { records: records })
    }
  })

  console.log('[bounty] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var records = loadBounties(mp, player.actorId)
  var bountyMap = buildBountyMap(records)
  store.update(userId, { bounty: bountyMap })
}

module.exports = {
  getBounty, getAllBounties, isGuardKoid,
  addBounty, clearBounty, init, onConnect,
}


/***/ },

/***/ "./browserProperty.js"
/*!****************************!*\
  !*** ./browserProperty.js ***!
  \****************************/
(module, __unused_webpack_exports, __webpack_require__) {



const fi = __webpack_require__(/*! ./functionInfo */ "./functionInfo.js")

let _mp

class BrowserProperty {
  static init(mp) {
    _mp = mp
    mp.makeProperty('browserFocused', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(function () {
        if (ctx.value === undefined) return
        if (ctx.state._bfLast === ctx.value) return
        ctx.state._bfLast = ctx.value
        ctx.sp.browser.setFocused(ctx.value)
      }).getText(),
      updateNeighbor: '',
    })
  }

  static setFocused(actorId, focused) {
    if (focused === undefined) focused = true
    _mp.set(actorId, 'browserFocused', focused)
  }
}

module.exports = { BrowserProperty }


/***/ },

/***/ "./bus.js"
/*!****************!*\
  !*** ./bus.js ***!
  \****************/
(module) {



const listeners = new Map()

function on(type, handler) {
  if (!listeners.has(type)) {
    listeners.set(type, new Set())
  }
  listeners.get(type).add(handler)
}

function off(type, handler) {
  const set = listeners.get(type)
  if (set) set.delete(handler)
}

function dispatch(event) {
  const handlers = listeners.get(event.type)
  if (!handlers) return
  for (const handler of handlers) {
    handler(event)
  }
}

module.exports = { on, off, dispatch }


/***/ },

/***/ "./captivity.js"
/*!**********************!*\
  !*** ./captivity.js ***!
  \**********************/
(module) {



var MAX_CAPTIVITY_MS = 24 * 60 * 60 * 1000

function isCaptive(store, playerId) {
  var player = store.get(playerId)
  return player ? player.isCaptive : false
}

function getCaptivityRemainingMs(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || !player.isCaptive || player.captiveAt === null) return 0
  return Math.max(0, MAX_CAPTIVITY_MS - (now - player.captiveAt))
}

function capturePlayer(mp, store, bus, captiveId, captorId) {
  var captive = store.get(captiveId)
  if (!captive) return false
  if (captive.isCaptive) return false

  var now = Date.now()
  store.update(captiveId, { isCaptive: true, captiveAt: now })

  var payload = { captiveId: captiveId, captorId: captorId, captiveAt: now, maxDurationMs: MAX_CAPTIVITY_MS }
  mp.sendCustomPacket(captive.actorId, 'playerCaptured', payload)

  var captor = store.get(captorId)
  if (captor) mp.sendCustomPacket(captor.actorId, 'playerCaptured', payload)

  bus.dispatch({ type: 'playerCaptured', captiveId: captiveId, captorId: captorId })

  console.log('[Captivity] ' + captive.name + ' captured by ' + captorId)
  return true
}

function releasePlayer(mp, store, bus, captiveId) {
  var captive = store.get(captiveId)
  if (!captive) return false
  if (!captive.isCaptive) return false

  store.update(captiveId, { isCaptive: false, captiveAt: null })
  mp.sendCustomPacket(captive.actorId, 'playerReleased', { captiveId: captiveId })

  bus.dispatch({ type: 'playerReleased', captiveId: captiveId })

  console.log('[Captivity] ' + captive.name + ' released')
  return true
}

function checkExpiredCaptivity(mp, store, bus, now) {
  if (now === undefined) now = Date.now()
  var released = []

  var players = store.getAll()
  for (var i = 0; i < players.length; i++) {
    var player = players[i]
    if (!player.isCaptive || player.captiveAt === null) continue
    if (now - player.captiveAt >= MAX_CAPTIVITY_MS) {
      releasePlayer(mp, store, bus, player.id)
      released.push(player.id)
      console.log('[Captivity] Auto-released ' + player.name + ' - 24h timer expired')
    }
  }

  return released
}

function init(mp, store, bus) {
  setInterval(function () { checkExpiredCaptivity(mp, store, bus) }, 5 * 60 * 1000)
  console.log('[captivity] Initialized - 24h expiry check every 5 min')
}

function onConnect(mp, store, bus, userId) {
  // nothing to restore on connect
}

module.exports = {
  isCaptive, getCaptivityRemainingMs,
  capturePlayer, releasePlayer, checkExpiredCaptivity,
  init, onConnect,
}


/***/ },

/***/ "./chat.js"
/*!*****************!*\
  !*** ./chat.js ***!
  \*****************/
(module) {



function sendChatMessage(mp, store, playerId, text) {
  var player = store.get(playerId)
  if (!player || !player.actorId) return
  
  // Send complete packet structure that client expects
  var packet = {
    customPacketType: 'ff_chat_message',
    sender: player.name || 'Unknown',
    text: text
  }
  
  mp.sendCustomPacket(player.actorId, 'ff_chat_message', packet)
}

function broadcastToHold(mp, store, senderId, text) {
  var sender = store.get(senderId)
  var holdId = sender ? sender.holdId : null
  var players = store.getAll()
  for (var i = 0; i < players.length; i++) {
    var p = players[i]
    if (!holdId || p.holdId === holdId) {
      sendChatMessage(mp, store, p.id, text)
    }
  }
}

// Broadcast raw text to nearby players (no wrapping — client handles formatting)
function broadcastChat(mp, store, senderId, text, range) {
  var sender = store.get(senderId)
  if (!sender || !sender.actorId) return
  var senderPos = mp.get(sender.actorId, 'pos')
  if (!senderPos) return

  var packet = {
    customPacketType: 'ff_chat_message',
    sender: sender.name || 'Unknown',
    text: text
  }

  var players = store.getAll()
  for (var i = 0; i < players.length; i++) {
    var p = players[i]
    if (!p.actorId) continue
    var pos = mp.get(p.actorId, 'pos')
    if (!pos) continue
    if (p.id === senderId || _dist3d(senderPos, pos) <= range) {
      mp.sendCustomPacket(p.actorId, 'ff_chat_message', packet)
    }
  }
}

function _dist3d(a, b) {
  const [ax, ay, az] = Array.isArray(a) ? a : [a.x, a.y, a.z]
  const [bx, by, bz] = Array.isArray(b) ? b : [b.x, b.y, b.z]
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function broadcastProximity(mp, store, senderId, text, range, mode) {
  const sender = store.get(senderId)
  if (!sender || !sender.actorId) return
  const senderPos = mp.get(sender.actorId, 'pos')
  if (!senderPos) return

  var namePart = sender.name
  if (mode === 'whisper') namePart += ' whispers'
  else if (mode === 'yell') namePart += ' yells'

  const msg = '[' + namePart + ']: ' + text
  const players = store.getAll()
  for (var i = 0; i < players.length; i++) {
    var p = players[i]
    if (!p.actorId) continue
    var pos = mp.get(p.actorId, 'pos')
    if (!pos) continue
    if (p.id === senderId || _dist3d(senderPos, pos) <= range) {
      sendChatMessage(mp, store, p.id, msg)
    }
  }
}

function init(mp, store, bus) {
  console.log('[chat] Ready')
}

module.exports = { sendChatMessage, broadcastToHold, broadcastProximity, broadcastChat, init }


/***/ },

/***/ "./chatLog.js"
/*!********************!*\
  !*** ./chatLog.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const fs = __webpack_require__(/*! fs */ "fs")
const path = __webpack_require__(/*! path */ "path")

const LOG_DIR = path.join(__dirname, '..', 'logs')
const CHAT_LOG_FILE = path.join(LOG_DIR, 'chat-audit.jsonl')

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
}

function buildChatEntry({ player, channel, text, pos, recipients }) {
  return {
    at: Date.now(),
    playerId: player ? player.id : null,
    actorId: player ? player.actorId : null,
    name: player ? player.name : null,
    channel,
    text,
    pos: pos || null,
    recipients: (recipients || []).map(p => p.id),
  }
}

function appendChatLog(entry) {
  try {
    ensureLogDir()
    fs.appendFileSync(CHAT_LOG_FILE, JSON.stringify(entry) + '\n')
    return true
  } catch (err) {
    console.error('[chatLog] Failed to append chat audit:', err && err.message ? err.message : err)
    return false
  }
}

module.exports = { CHAT_LOG_FILE, buildChatEntry, appendChatLog }


/***/ },

/***/ "./chatProperty.js"
/*!*************************!*\
  !*** ./chatProperty.js ***!
  \*************************/
(module, __unused_webpack_exports, __webpack_require__) {



const fi = __webpack_require__(/*! ./functionInfo */ "./functionInfo.js")
const pcm = __webpack_require__(/*! ./parseChatMessage */ "./parseChatMessage.js")
const rw = __webpack_require__(/*! ./refreshWidgets */ "./refreshWidgets.js")
const loc = __webpack_require__(/*! ./locationUtils */ "./locationUtils.js")
const commandSuggestions = __webpack_require__(/*! ./commandSuggestions */ "./commandSuggestions.js")

const colorsArray = [
  '#5DAD60',
  '#62C985',
  '#7175D6',
  '#71D0D6',
  '#93AD5D',
  '#A062C9',
  '#BDBD7D',
  '#D76464',
  '#F78C8C',
  '#F78CD9',
]

const filterMessages = {
  shout: [
    {
      type: 'action',
      status: 'disabled',
    },
    {
      type: 'nonrp',
      status: 'distanceOnly',
      color: '#91916D',
    },
    {
      type: 'whisper',
      status: 'disabled',
    },
  ],
  whisper: [
    {
      type: 'action',
      status: 'enabled',
    },
    {
      type: 'nonrp',
      status: 'distanceOnly',
      color: '#91916D',
    },
  ],
  nonrp: [
    {
      type: 'action',
      status: 'inherit',
      color: '#91916D',
    },
    {
      type: 'shout',
      status: 'inherit',
      color: '#91916D',
    },
    {
      type: 'whisper',
      status: 'inherit',
      color: '#91916D',
    },
  ],
}

const getColorByNickname = (name) => {
  let result = 0;
  for (let i = 0; i < name.length; i++) {
    result += name.charCodeAt(i);
  }
  return colorsArray[result % colorsArray.length];
}

const calculateOpacity = (distance, max, minDistance, coeff) => {
  if (distance <= minDistance * coeff) {
    return '1';
  }
  return Math.max(0, ((max * coeff - distance + minDistance * coeff) / (max * coeff))).toFixed(5);
}

class ChatMessage {
  constructor(actorId, masterApiId, text, category = 'plain', controller) {
    this.sender = {
      masterApiId,
      gameId: actorId,
    };
    this.category = category;
    if (controller) {
      this.controller = controller;
    }
    if (typeof text === 'string') {
      if (['plain', 'nonrp'].includes(category) && controller) {
        this.sender.name = controller.getName(actorId);
      }
      this.text = pcm.parseChatMessage(text);
    } else {
      this.text = text;
    }
  }

  static system(text, controller) {
    return new this(0, 0, text, 'system', controller ?? undefined);
  }

  toUser(actorId) {
    let texts = this.text;

    if (['plain', 'nonrp', 'dice'].includes(this.category) && this.controller) {
      const chatSettings = this.controller.getServerSetting('sweetpieChatSettings') ?? {};
      const hearingRadius =
        chatSettings['hearingRadiusNormal'] !== undefined ? loc.sqr(chatSettings['hearingRadiusNormal']) : loc.sqr(1900);
      const whisperDistanceCoeff =
        chatSettings['whisperDistance'] !== undefined ? chatSettings['whisperDistance'] : 0.1;
      const shoutDistanceCoeff =
        chatSettings['shoutDistance'] !== undefined ? chatSettings['shoutDistance'] : 2.45;
      const minDistanceToChange =
        chatSettings['minDistanceToChange'] !== undefined ? loc.sqr(chatSettings['minDistanceToChange']) : loc.sqr(500);

      const distance = this.controller.getActorDistanceSquared(actorId, this.sender.gameId);
      texts = texts.reduce((filtered, text) => {
        const current = { ...text };
        if (text.type.length > 0) {
          for (let i = 0; i < text.type.length; i++) {
            const category = text.type[i];
            if (category in filterMessages) {
              const filter = filterMessages[category];
              for (let j = i; j < text.type.length; j++) {
                if (!filter[j]) {
                  continue;
                }
                if (text.type.includes(filter[j].type)) {
                  if (filter[j].status === 'disabled') {
                    return filtered;
                  }
                  if (filter[j].color !== undefined) {
                    current.color = filter[j].color;
                  }
                  if (filter[j].status === 'enabled') {
                    current.type = current.type.filter((e) => e !== category);
                  }
                  if (filter[j].status === 'inherit') {
                    current.type = current.type.filter((e) => e !== filter[j].type);
                  }
                }
              }
            }
          }
        }

        if (
          (current.type.includes('shout') || current.type.includes('nonrp')) &&
          distance < hearingRadius * shoutDistanceCoeff
        ) {
          filtered.push({
            opacity: calculateOpacity(distance, hearingRadius, minDistanceToChange, shoutDistanceCoeff),
            ...current,
          });
          return filtered;
        } else if (current.type.includes('whisper')) {
          if (distance < hearingRadius * whisperDistanceCoeff) filtered.push({ opacity: '1', ...current });
          return filtered;
        } else if (distance < hearingRadius) {
          filtered.push({ opacity: calculateOpacity(distance, hearingRadius, minDistanceToChange, 1), ...current });
          return filtered;
        }
        return filtered;
      }, []);
    }

    if (texts.length === 0) {
      return false;
    }

    if (this.sender.name) {
      texts = [
        {
          type: ['plain'],
          text: `${this.sender.name}: `,
          color: getColorByNickname(this.sender.name),
        },
        ...texts,
      ];
    }

    return {
      opacity: 1,
      sender: {
        gameId: this.sender.gameId,
        masterApiId: this.sender.masterApiId,
      },
      text: texts,
      category: this.category,
    };
  }
}

const createSystemMessage = (text, controller) => {
  return ChatMessage.system(text, controller);
};

class ChatProperty {
  static init() {
    mp.makeProperty('chat', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(this.clientsideUpdateOwner()).getText({
        refreshWidgets: rw.refreshWidgetsJs,
        commandSuggestionsJson: JSON.stringify(commandSuggestions.COMMANDS),
      }),
      updateNeighbor: '',
    });
    mp.makeEventSource('_onChatInput', new fi.FunctionInfo(this.clientsideInitChatInput()).getText());
    mp['_onChatInput'] = this.onChatInput;
  }

  static onChatInput(actorId, ...args) {
    if (args[0] !== 'chatInput' || typeof args[1] !== 'string') {
      return;
    }
    const [, inputText] = args;
    ChatProperty.chatInputHandler({ actorId, inputText });
  }

  static showChat(actorId, show = true) {
    var value = mp.get(actorId, 'chat') || {};
    value.show = show;
    value.pendingMessages = [];
    value.pendingClear = false;
    mp.set(actorId, 'chat', value);
  }

  static sendChatMessage(actorId, message) {
    var messageToUser = message.toUser(actorId);
    if (!messageToUser) return;
    var value = mp.get(actorId, 'chat') || {};
    value.pendingMessages = value.pendingMessages || [];
    value.pendingMessages.push(messageToUser);
    mp.set(actorId, 'chat', value);
  }

  static setChatInputHandler(handler) {
    this.chatInputHandler = handler;
  }

  static clientsideUpdateOwner() {
    return () => {
      // Handle /clear command
      if (ctx.value && ctx.value.pendingClear) {
        ctx.value.pendingClear = false;
        var clearSrc = '';
        clearSrc += 'window.chatMessages = [];';
        clearSrc += refreshWidgets;
        ctx.sp.browser.executeJavaScript(clearSrc);
      }

      // One-time browser patches (fixes scrollToLastMessage, Widgets listener leak,
      // and adds messagesUpdated listener as fallback re-render trigger)
      if (!ctx.state._chatPatched) {
        ctx.state._chatPatched = true;
        var initSrc = '';
        initSrc += 'if (!window.__skympChatPatched) {';
        initSrc += 'window.__skympChatPatched = true;';
        initSrc += 'window.scrollToLastMessage = function(){';
        initSrc += 'var l=document.querySelector("#chat>.chat-main>.list>.chat-list");';
        initSrc += 'if(l!=null&&window.needToScroll)l.scrollTop=l.scrollHeight;';
        initSrc += '};';
        initSrc += 'var _rl=window.skyrimPlatform.widgets.removeListener;';
        initSrc += 'window.skyrimPlatform.widgets.removeListener=function(l){';
        initSrc += 'var s=l.toString();this.listeners=this.listeners.filter(function(e){return e.toString()!==s});';
        initSrc += '};';
        initSrc += 'window.addEventListener("skymp:ui:chat:messagesUpdated",function(){';
        initSrc += 'window.skyrimPlatform.widgets.set((window.chat||[]).concat(window.dialog||[]));';
        initSrc += '});';
        initSrc += '}';
        ctx.sp.browser.executeJavaScript(initSrc);
      }

      if (!ctx.state._commandSuggestionsPatched) {
        ctx.state._commandSuggestionsPatched = true;
        var suggestSrc = '';
        suggestSrc += '(function(){';
        suggestSrc += 'if(window.__ffCommandSuggestPatched)return;';
        suggestSrc += 'window.__ffCommandSuggestPatched=true;';
        suggestSrc += 'window.__ffCommandSuggestions=' + commandSuggestionsJson + ';';
        suggestSrc += 'var style=document.createElement("style");';
        suggestSrc += 'style.textContent="#ff-command-suggestions{position:fixed;left:22px;bottom:86px;max-width:520px;background:rgba(0,0,0,.72);border:1px solid rgba(200,166,70,.35);color:#d6c07a;font:12px sans-serif;z-index:9200;padding:6px 8px;display:none;pointer-events:none}.ff-cs-row{white-space:nowrap;margin:2px 0}.ff-cs-name{color:#f0d890;font-weight:bold;margin-right:8px}";';
        suggestSrc += 'document.head.appendChild(style);';
        suggestSrc += 'var box=document.createElement("div");box.id="ff-command-suggestions";document.body.appendChild(box);';
        suggestSrc += 'function findInput(){return document.querySelector("#chat input,#chat textarea,input[type=text],textarea");}';
        suggestSrc += 'function render(value){';
        suggestSrc += 'if(!value||value.charAt(0)!=="/"){box.style.display="none";return;}';
        suggestSrc += 'var q=value.toLowerCase();';
        suggestSrc += 'var rows=(window.__ffCommandSuggestions||[]).filter(function(c){return c.name.indexOf(q)===0;}).slice(0,8);';
        suggestSrc += 'if(rows.length===0){box.style.display="none";return;}';
        suggestSrc += 'box.innerHTML=rows.map(function(c){return "<div class=\\"ff-cs-row\\"><span class=\\"ff-cs-name\\">"+c.name+"</span>"+c.usage+"</div>";}).join("");';
        suggestSrc += 'box.style.display="block";';
        suggestSrc += '}';
        suggestSrc += 'function attach(){var input=findInput();if(!input||input.__ffSuggestAttached)return;input.__ffSuggestAttached=true;input.addEventListener("input",function(){render(input.value||"");});input.addEventListener("blur",function(){setTimeout(function(){box.style.display="none";},100);});}';
        suggestSrc += 'setInterval(attach,500);attach();';
        suggestSrc += '})();';
        ctx.sp.browser.executeJavaScript(suggestSrc);
      }

      // Flush pending messages into window.chatMessages (per spec: updateOwner
      // flushes pendingMessages into window.chatMessages and dispatches refresh)
      if (ctx.value && ctx.value.pendingMessages && ctx.value.pendingMessages.length > 0) {
        var msgs = ctx.value.pendingMessages;
        ctx.value.pendingMessages = [];
        var src = '';
        for (var i = 0; i < msgs.length; i++) {
          src += 'window.chatMessages = window.chatMessages || [];';
          src += 'window.chatMessages.push(' + JSON.stringify(msgs[i]) + ');';
        }
        src += 'window.chatMessages = window.chatMessages.slice(-50);';
        src += 'window.dispatchEvent(new CustomEvent("skymp:ui:chat:messagesUpdated"));';
        src += refreshWidgets;
        src += 'if (window.scrollToLastMessage) { window.scrollToLastMessage(); }';
        ctx.sp.browser.executeJavaScript(src);
      }

      var isInputHidden = !ctx.sp.browser.isFocused() || (ctx.get && ctx.get('dialog'));

      var isConnected = ctx.sp.mpClientPlugin.isConnected();
      var wasConnected = ctx.state.isConnected;
      if (isConnected !== wasConnected) {
        ctx.state.isConnected = isConnected;
        var messageToUser;
        if (isConnected === false) {
          messageToUser = {
            actorId: 0,
            masterApiId: 0,
            text: [{
              type: ['plain'],
              color: '#FFFFFF',
              text: 'Lost connection to the server'
            }],
            category: 'system'
          };
        }
        else if (wasConnected === false && isConnected === true) {
          messageToUser = {
            actorId: 0,
            masterApiId: 0,
            text: [{
              type: ['plain'],
              color: '#FFFFFF',
              text: 'Reconnected'
            }],
            category: 'system'
          };
        }
        if (messageToUser) {
          var msgString = JSON.stringify(messageToUser);
          var src2 = '';
          src2 += 'window.chatMessages = window.chatMessages || [];';
          src2 += 'window.chatMessages.push(' + msgString + ');';
          src2 += 'window.chatMessages = window.chatMessages.slice(-50);';
          src2 += refreshWidgets;
          src2 += 'if (window.scrollToLastMessage) { window.scrollToLastMessage(); }';
          ctx.sp.browser.executeJavaScript(src2);
        }
      }

      if (ctx.value === ctx.state.chatPrevValue && isInputHidden === ctx.state.chatIsInputHidden) {
        return;
      }
      ctx.state.chatPrevValue = ctx.value;
      ctx.state.chatIsInputHidden = isInputHidden;

      if (!ctx.value || !ctx.value.show) {
        var src3 = '';
        src3 += 'window.chat = [];';
        src3 += refreshWidgets;
        return ctx.sp.browser.executeJavaScript(src3);
      }

      var src4 = '';
      src4 += 'window.chatMessages = window.chatMessages || [];';
      src4 += 'window.chat = [{}];';
      src4 += 'window.chat[0].type = "chat";';
      src4 += 'window.chat[0].messages = window.chatMessages;';
      src4 += 'window.chat[0].send = (text) => window.skyrimPlatform.sendMessage("chatInput", text);';
      src4 += 'window.chat[0].isInputHidden = ' + isInputHidden + ';';
      src4 += refreshWidgets;
      ctx.sp.browser.executeJavaScript(src4);
    };
  }

  static clientsideInitChatInput() {
    return () => {
      ctx.sp.on('browserMessage', (event) => {
        if (event.arguments[0] === 'chatInput') {
          ctx.sendEvent(...event.arguments);
        }
      });
    };
  }
}

ChatProperty.chatInputHandler = () => {};

module.exports = {
  ChatMessage,
  createSystemMessage,
  ChatProperty,
  getColorByNickname,
};


/***/ },

/***/ "./college.js"
/*!********************!*\
  !*** ./college.js ***!
  \********************/
(module) {



var XP_THRESHOLDS = {
  novice: 0,
  apprentice: 100,
  adept: 300,
  expert: 600,
  master: 1000,
}

var LECTURE_ATTENDEE_XP = 50
var LECTURE_TEACHER_XP = 25
var TOME_XP = {
  novice: 15,
  apprentice: 30,
  adept: 50,
  expert: 75,
  master: 100,
}
var LECTURE_BOOST_MS = 24 * 60 * 60 * 1000

var TOME_REGISTRY = {
  '0x0a26e6': 'novice',
  '0x0a26e7': 'novice',
  '0x0a26e8': 'apprentice',
  '0x0a26e9': 'apprentice',
  '0x0a26ea': 'adept',
  '0x0a26eb': 'adept',
  '0x0a26ec': 'expert',
  '0x0a26ed': 'expert',
  '0x0a26ee': 'master',
  '0x0a26ef': 'master',
}

var activeLectures = new Map()
var XP_KEY = 'ff_study_xp'
var BOOST_KEY = 'ff_lecture_boost'

function getCollegeRank(xp) {
  var tiers = ['master', 'expert', 'adept', 'apprentice', 'novice']
  for (var i = 0; i < tiers.length; i++) {
    if (xp >= XP_THRESHOLDS[tiers[i]]) return tiers[i]
  }
  return 'novice'
}

function getTomeRank(tomeBaseId) {
  return TOME_REGISTRY[tomeBaseId] || null
}

function getStudyXp(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return 0
  var val = mp.get(player.actorId, XP_KEY)
  return (val !== null && val !== undefined) ? val : 0
}

function getCollegeRankForPlayer(mp, store, playerId) {
  return getCollegeRank(getStudyXp(mp, store, playerId))
}

function addStudyXp(mp, store, playerId, amount) {
  var player = store.get(playerId)
  var current = getStudyXp(mp, store, playerId)
  var next = current + amount
  mp.set(player.actorId, XP_KEY, next)
  return next
}

function studyTome(mp, store, bus, playerId, tomeBaseId) {
  var player = store.get(playerId)
  if (!player) return false

  var tomeRank = getTomeRank(tomeBaseId)
  if (tomeRank === null) return false

  var xpGain = TOME_XP[tomeRank]
  var newXp = addStudyXp(mp, store, playerId, xpGain)
  var newRank = getCollegeRank(newXp)

  mp.sendCustomPacket(player.actorId, 'studyXpUpdate', { xp: newXp, rank: newRank, xpGain: xpGain })
  console.log('[College] ' + player.name + ' studied ' + tomeRank + ' tome +' + xpGain + ' XP (total: ' + newXp + ', rank: ' + newRank + ')')
  return true
}

function startLecture(mp, store, bus, lecturerId) {
  var lecturer = store.get(lecturerId)
  if (!lecturer) return false
  if (activeLectures.has(lecturerId)) return false

  activeLectures.set(lecturerId, {
    lecturerId: lecturerId,
    startedAt: Date.now(),
    attendees: [],
  })

  bus.dispatch({ type: 'lectureStarted', lecturerId: lecturerId })
  mp.sendCustomPacket(lecturer.actorId, 'lectureStarted', { lecturerId: lecturerId })
  console.log('[College] ' + lecturer.name + ' started a lecture')
  return true
}

function joinLecture(mp, store, bus, playerId, lecturerId) {
  var session = activeLectures.get(lecturerId)
  if (!session) return false
  if (playerId === lecturerId) return false
  if (session.attendees.indexOf(playerId) !== -1) return false

  session.attendees.push(playerId)

  var player = store.get(playerId)
  if (player) mp.sendCustomPacket(player.actorId, 'lectureJoined', { lecturerId: lecturerId })
  console.log('[College] Player ' + playerId + ' joined lecture by ' + lecturerId)
  return true
}

function endLecture(mp, store, bus, lecturerId, now) {
  if (now === undefined) now = Date.now()
  var session = activeLectures.get(lecturerId)
  if (!session) return false

  var boostUntil = now + LECTURE_BOOST_MS

  for (var i = 0; i < session.attendees.length; i++) {
    var attendeeId = session.attendees[i]
    var attendee = store.get(attendeeId)
    if (!attendee) continue

    addStudyXp(mp, store, attendeeId, LECTURE_ATTENDEE_XP)
    mp.set(attendee.actorId, BOOST_KEY, boostUntil)

    mp.sendCustomPacket(attendee.actorId, 'lectureEnded', {
      lecturerId: lecturerId,
      xpGain: LECTURE_ATTENDEE_XP,
      boostUntil: boostUntil,
    })
  }

  var lecturer = store.get(lecturerId)
  if (lecturer) {
    addStudyXp(mp, store, lecturerId, LECTURE_TEACHER_XP)
    mp.sendCustomPacket(lecturer.actorId, 'lectureEnded', {
      lecturerId: lecturerId,
      xpGain: LECTURE_TEACHER_XP,
      attendeeCount: session.attendees.length,
    })
  }

  activeLectures.delete(lecturerId)
  bus.dispatch({ type: 'lectureEnded', lecturerId: lecturerId, attendeeCount: session.attendees.length })
  console.log('[College] Lecture by ' + lecturerId + ' ended - ' + session.attendees.length + ' attendee(s) rewarded')
  return true
}

function getActiveLecture(lecturerId) {
  return activeLectures.get(lecturerId) || null
}

function hasLectureBoost(mp, store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player) return false
  var boostUntil = mp.get(player.actorId, BOOST_KEY) || 0
  return boostUntil > now
}

function getLectureBoostRemainingMs(mp, store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player) return 0
  var boostUntil = mp.get(player.actorId, BOOST_KEY) || 0
  return Math.max(0, boostUntil - now)
}

function init(mp, store, bus) {
  console.log('[college] Initializing')

  mp.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var player = store.get(playerId)
    if (!player) return

    var xp = mp.get(actorId, XP_KEY) || 0
    var rank = getCollegeRank(xp)

    mp.sendCustomPacket(actorId, 'studyXpUpdate', { xp: xp, rank: rank })

    var boostUntil = mp.get(actorId, BOOST_KEY) || 0
    if (boostUntil > Date.now()) {
      mp.sendCustomPacket(actorId, 'lectureBoostActive', {
        boostUntil: boostUntil,
        remainingMs: boostUntil - Date.now(),
      })
    }
  })

  console.log('[college] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var xp = mp.get(player.actorId, XP_KEY) || 0
  var rank = getCollegeRank(xp)
  mp.sendCustomPacket(player.actorId, 'studyXpUpdate', { xp: xp, rank: rank })
}

module.exports = {
  getCollegeRank, getTomeRank, getStudyXp, getCollegeRankForPlayer,
  studyTome, startLecture, joinLecture, endLecture,
  getActiveLecture, hasLectureBoost, getLectureBoostRemainingMs,
  init, onConnect,
}


/***/ },

/***/ "./combat.js"
/*!*******************!*\
  !*** ./combat.js ***!
  \*******************/
(module) {



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


/***/ },

/***/ "./commandSuggestions.js"
/*!*******************************!*\
  !*** ./commandSuggestions.js ***!
  \*******************************/
(module) {



const COMMANDS = [
  { name: '/say', usage: '/say <message>', group: 'rp', role: 'player' },
  { name: '/me', usage: '/me <action>', group: 'rp', role: 'player' },
  { name: '/do', usage: '/do <scene detail>', group: 'rp', role: 'player' },
  { name: '/pm', usage: '/pm <name> <message>', group: 'rp', role: 'player' },
  { name: '/r', usage: '/r <message>', group: 'rp', role: 'player' },
  { name: '/b', usage: '/b <local OOC>', group: 'rp', role: 'player' },
  { name: '/looc', usage: '/looc <local OOC>', group: 'rp', role: 'player' },
  { name: '/f', usage: '/f <faction message>', group: 'rp', role: 'player' },
  { name: '/ame', usage: '/ame <short action>', group: 'rp', role: 'player' },
  { name: '/report', usage: '/report <message>', group: 'staff', role: 'player' },
  { name: '/skillsmenu', usage: '/skillsmenu', group: 'skills', role: 'player' },
  { name: '/names', usage: '/names [range]', group: 'rp', role: 'player' },
  { name: '/handsup', usage: '/handsup [off]', group: 'interaction', role: 'player' },
  { name: '/cuff', usage: '/cuff <player>', group: 'interaction', role: 'player' },
  { name: '/uncuff', usage: '/uncuff <player>', group: 'interaction', role: 'player' },
  { name: '/search', usage: '/search <player>', group: 'interaction', role: 'player' },
  { name: '/carry', usage: '/carry <player>', group: 'interaction', role: 'player' },
  { name: '/treat', usage: '/treat <player> [bandage]', group: 'medical', role: 'player' },
  { name: '/gold', usage: '/gold', group: 'economy', role: 'player' },
  { name: '/pay', usage: '/pay <amount> <name>', group: 'economy', role: 'player' },
  { name: '/production', usage: '/production list|work|sell ...', group: 'economy', role: 'player' },
  { name: '/property', usage: '/property list|request|approve|deny|revoke ...', group: 'economy', role: 'player' },
  { name: '/cart', usage: '/cart create|list|load|unload|probe ...', group: 'transport', role: 'player' },
  { name: '/reports', usage: '/reports', group: 'staff', role: 'staff' },
  { name: '/role', usage: '/role set <name> player|leader|staff', group: 'staff', role: 'staff' },
  { name: '/pve', usage: '/pve wildlife|dungeon ...', group: 'staff', role: 'staff' },
  { name: '/alpha', usage: '/alpha plugin|papyrus|ui', group: 'staff', role: 'staff' },
]

function canUse(command, role) {
  if (command.role !== 'staff') return true
  return role === 'staff' || role === 'leader'
}

function suggest(input, role) {
  if (!input || input[0] !== '/') return []
  const query = input.toLowerCase()
  return COMMANDS
    .filter(command => canUse(command, role || 'player'))
    .filter(command => command.name.indexOf(query) === 0)
    .slice(0, 8)
}

module.exports = { COMMANDS, suggest }


/***/ },

/***/ "./commands.js"
/*!*********************!*\
  !*** ./commands.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



// ── Helpers ───────────────────────────────────────────────────────────────────

const chatHelper = __webpack_require__(/*! ./chat */ "./chat.js")
const cp = __webpack_require__(/*! ./chatProperty */ "./chatProperty.js")
const chatLog = __webpack_require__(/*! ./chatLog */ "./chatLog.js")
const auditLog = __webpack_require__(/*! ./auditLog */ "./auditLog.js")
const reports = __webpack_require__(/*! ./reports */ "./reports.js")
const commodityExchange = __webpack_require__(/*! ./commodityExchange */ "./commodityExchange.js")
const crafting = __webpack_require__(/*! ./crafting */ "./crafting.js")

const PROXIMITY_RANGE_NORMAL = 2000
const PROXIMITY_RANGE_WHISPER = 500
const PROXIMITY_RANGE_YELL = 10000

const lastPmByUser = new Map()

function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null
  const parts = text.trim().slice(1).split(/\s+/)
  return { cmd: parts[0].toLowerCase(), args: parts.slice(1) }
}

function findPlayer(store, name) {
  return resolvePlayerTarget(store, null, name)
}

function resolvePlayerTarget(store, currentUserId, target) {
  const targetText = Array.isArray(target) ? target.join(' ') : String(target || '')
  const normalized = targetText.trim().toLowerCase()
  if (!normalized) return null
  if ((normalized === 'me' || normalized === 'self') && currentUserId !== null && currentUserId !== undefined) {
    return store.get(currentUserId)
  }
  return store.getAll().find(p => p.name.toLowerCase() === normalized) || null
}

function resolvePlayerTargetFromArgs(store, currentUserId, args, options) {
  const targetArgs = Array.isArray(args) ? args : []
  const opts = options || {}
  if (targetArgs.length === 0) {
    return {
      target: opts.defaultSelf ? store.get(currentUserId) : null,
      consumed: 0,
      text: '',
    }
  }
  const firstArg = String(targetArgs[0] || '').toLowerCase()
  if (firstArg === 'me' || firstArg === 'self') {
    return {
      target: store.get(currentUserId),
      consumed: 1,
      text: targetArgs[0],
    }
  }
  for (let count = targetArgs.length; count >= 1; count--) {
    const text = targetArgs.slice(0, count).join(' ')
    const target = resolvePlayerTarget(store, currentUserId, text)
    if (target) return { target, consumed: count, text }
  }
  return { target: null, consumed: 0, text: targetArgs.join(' ') }
}

function splitTargetAndTrailingArg(args) {
  const parts = Array.isArray(args) ? args : []
  return {
    targetArgs: parts.slice(0, -1),
    value: parts.length ? parts[parts.length - 1] : undefined,
  }
}

function checkPermission(store, playerId, level) {
  if (level === 'player') return true
  const player = store.get(playerId)
  if (!player) return false
  if (level === 'staff')  return player.isStaff
  if (level === 'leader') return player.isLeader || player.isStaff
  return false
}

function parseBaseId(value) {
  const text = String(value || '').trim()
  if (!text) return NaN
  const clean = text.toLowerCase().startsWith('0x') ? text.slice(2) : text
  const radix = /[a-f]/i.test(clean) ? 16 : 10
  return parseInt(clean, radix)
}

function reply(mp, store, playerId, message) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return
  const msg = cp.ChatMessage.system(message)
  cp.ChatProperty.sendChatMessage(player.actorId, msg)
}

let _handlers = null

function dispatch(userId, text) {
  if (!_handlers) return false
  const parsed = parseCommand(text)
  if (!parsed) return false
  const handler = _handlers[parsed.cmd]
  if (!handler) return false
  handler(userId, parsed.args)
  return true
}

// ── Command registration ──────────────────────────────────────────────────────

function registerAll(mp, store, bus, systems) {
  const { hunger, drunkBar, economy, housing, bounty,
          combat, nvfl, captivity, medical, interactionState, prison, factions,
          college, skills, training, treasury, production, pve, transport, roleplay,
          inventory: inv, magic, papyrusBridge, alphaSpikes, espAssetRegistry, engineProbes, modSourceRegistry, skillUi, identityOverlay } = systems
  const permissions = __webpack_require__(/*! ./permissions */ "./permissions.js")

  const handlers = {}

  function sendSystem(actorId, message) {
    if (!actorId) return
    cp.ChatProperty.sendChatMessage(actorId, cp.ChatMessage.system(message))
  }

  function playerPos(player) {
    if (!player || !player.actorId || !mp || typeof mp.get !== 'function') return null
    try { return mp.get(player.actorId, 'pos') || null } catch (err) { return null }
  }

  function distance(a, b) {
    if (!a || !b) return Infinity
    const ax = Array.isArray(a) ? a[0] : a.x
    const ay = Array.isArray(a) ? a[1] : a.y
    const az = Array.isArray(a) ? a[2] : a.z
    const bx = Array.isArray(b) ? b[0] : b.x
    const by = Array.isArray(b) ? b[1] : b.y
    const bz = Array.isArray(b) ? b[2] : b.z
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
  }

  function nearbyPlayers(player, range) {
    const senderPos = playerPos(player)
    if (!senderPos) return player ? [player] : []
    return store.getAll().filter(p => p.actorId && distance(senderPos, playerPos(p)) <= range)
  }

  function logChannel(player, channel, text, recipients) {
    chatLog.appendChatLog(chatLog.buildChatEntry({
      player,
      channel,
      text,
      pos: playerPos(player),
      recipients,
    }))
  }

  function targetFromArgs(userId, args, options) {
    return resolvePlayerTargetFromArgs(store, userId, args, options).target
  }

  // ── College ──────────────────────────────────────────────────────────────
  handlers['lecture'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (sub === 'start') {
      const ok = college.startLecture(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Lecture started.' : 'You already have an active lecture.')
    } else if (sub === 'join') {
      const lecturerId = _findUserIdByName(store, args[1])
      if (lecturerId === null) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      const ok = college.joinLecture(mp, store, bus, userId, lecturerId)
      reply(mp, store, userId, ok ? 'Joined lecture.' : 'Could not join that lecture.')
    } else if (sub === 'end') {
      const ok = college.endLecture(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Lecture ended. XP distributed.' : 'No active lecture.')
    } else {
      reply(mp, store, userId, 'Usage: /lecture start | join [name] | end')
    }
  }

  handlers['study'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const baseId = parseInt(args[0], 16)
    if (!baseId) return reply(mp, store, userId, 'Usage: /study [tomeBaseId]')
    college.studyTome(mp, store, bus, userId, baseId)
    reply(mp, store, userId, 'Studied tome.')
  }

  // ── Training ─────────────────────────────────────────────────────────────
  handlers['train'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const skillIds = skills.SKILL_IDS
    if (sub === 'start') {
      const skillId = (args[1] || '').toLowerCase()
      if (!skillIds.includes(skillId)) return reply(mp, store, userId, `Valid skills: ${skillIds.join(', ')}`)
      const ok = training.startTraining(mp, store, bus, userId, skillId)
      reply(mp, store, userId, ok ? `Training session started for ${skillId}.` : 'You already have an active session.')
    } else if (sub === 'join') {
      const trainerId = _findUserIdByName(store, args[1])
      if (trainerId === null) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      const ok = training.joinTraining(mp, store, bus, userId, trainerId)
      reply(mp, store, userId, ok ? 'Joined training session.' : 'Could not join (not nearby or no session).')
    } else if (sub === 'end') {
      const ok = training.endTraining(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Training ended. Boosts granted to attendees.' : 'No active session.')
    } else {
      reply(mp, store, userId, 'Usage: /train start [skillId] | join [name] | end')
    }
  }

  // ── Skills ───────────────────────────────────────────────────────────────
  handlers['skill'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const player = store.get(userId)
    if (!player) return
    const target = (args[0] || '').toLowerCase()
    const list   = target ? [target] : skills.SKILL_IDS
    const lines  = []
    for (const skillId of list) {
      const xp    = skills.getSkillXp(mp, userId, skillId)
      const level = skills.getSkillLevel(xp)
      const cap   = skills.getSkillCap(mp, store, userId, skillId)
      lines.push(`${skillId}: level ${level} (${xp}/${cap} XP)`)
    }
    reply(mp, store, userId, lines.join('\n'))
  }

  handlers['skillsmenu'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const result = skillUi.sendSkillMenu(mp, store, userId)
    reply(mp, store, userId, result.message)
  }

  handlers['names'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const range = parseInt(args[0]) || 2500
    const result = identityOverlay.sendIdentityOverlay(mp, store, userId, range)
    reply(mp, store, userId, result.message)
  }

  // ── Economy ──────────────────────────────────────────────────────────────
  handlers['pay'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const amount = parseInt(args[0])
    if (!amount || amount <= 0) return reply(mp, store, userId, 'Usage: /pay [amount] [playerName]')
    const target = findPlayer(store, args[1])
    if (!target) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
    const ok = economy.transferGold(mp, store, userId, target.id, amount)
    if (ok) {
      reply(mp, store, userId, `Paid ${amount} Septims to ${target.name}.`)
      reply(mp, store, target.id, `Received ${amount} Septims from ${store.get(userId).name}.`)
    } else {
      reply(mp, store, userId, 'Insufficient funds.')
    }
  }

  handlers['gold'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const player = store.get(userId)
    if (!player) return
    const septims = inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID)
    store.update(userId, { septims })
    reply(mp, store, userId, `You have ${septims} Septims.`)
  }

  // ── Serious Text RP channels ─────────────────────────────────────────────
  handlers['pm'] = (userId, args) => {
    const sender = store.get(userId)
    const target = findPlayer(store, args[0])
    const text = args.slice(1).join(' ').trim()
    if (!sender) return
    if (!target || !text) return reply(mp, store, userId, 'Usage: /pm [playerName] [message]')

    lastPmByUser.set(userId, target.id)
    lastPmByUser.set(target.id, userId)
    sendSystem(sender.actorId, `PM to ${target.name}: ${text}`)
    sendSystem(target.actorId, `PM from ${sender.name}: ${text}`)
    logChannel(sender, 'pm', text, [sender, target])
    auditLog.audit('chat.pm', { fromPlayerId: sender.id, toPlayerId: target.id, text })
  }

  handlers['r'] = (userId, args) => {
    const sender = store.get(userId)
    const targetId = lastPmByUser.get(userId)
    const target = targetId ? store.get(targetId) : null
    const text = args.join(' ').trim()
    if (!sender) return
    if (!target || !text) return reply(mp, store, userId, 'Usage: /r [message] (after receiving a PM)')

    lastPmByUser.set(userId, target.id)
    lastPmByUser.set(target.id, userId)
    sendSystem(sender.actorId, `PM to ${target.name}: ${text}`)
    sendSystem(target.actorId, `PM from ${sender.name}: ${text}`)
    logChannel(sender, 'pm-reply', text, [sender, target])
    auditLog.audit('chat.pm', { fromPlayerId: sender.id, toPlayerId: target.id, text, reply: true })
  }

  handlers['b'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /b [local OOC message]')

    const recipients = nearbyPlayers(sender, PROXIMITY_RANGE_NORMAL)
    for (const p of recipients) sendSystem(p.actorId, `(( ${sender.name}: ${text} ))`)
    logChannel(sender, 'looc', text, recipients)
  }

  handlers['looc'] = handlers['b']

  handlers['f'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /f [faction message]')
    const factionsForSender = Array.isArray(sender.factions) ? sender.factions : []
    if (factionsForSender.length === 0) return reply(mp, store, userId, 'You are not in a faction.')

    const recipients = store.getAll().filter(p => {
      const factionsForPlayer = Array.isArray(p.factions) ? p.factions : []
      return factionsForPlayer.some(factionId => factionsForSender.includes(factionId))
    })
    for (const p of recipients) sendSystem(p.actorId, `[Faction] ${sender.name}: ${text}`)
    logChannel(sender, 'faction', text, recipients)
  }

  handlers['ame'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /ame [short action]')

    const recipients = nearbyPlayers(sender, PROXIMITY_RANGE_NORMAL)
    for (const p of recipients) sendSystem(p.actorId, `* ${sender.name} ${text}`)
    logChannel(sender, 'ame', text, recipients)
  }

  handlers['report'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /report [message]')

    const staff = store.getAll().filter(p => p.isStaff && p.actorId)
    const recipients = staff.length ? staff : [sender]
    const report = reports.createReport(sender, text, staff.map(p => p.id))
    for (const p of recipients) sendSystem(p.actorId, `Report from ${sender.name}: ${text}`)
    if (!staff.some(p => p.id === sender.id)) sendSystem(sender.actorId, 'Report sent to online staff.')
    logChannel(sender, 'report', text, recipients)
    auditLog.audit('staff.report', { reportId: report.id, fromPlayerId: sender.id, text, staffRecipients: staff.map(p => p.id) })
  }

  handlers['reports'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const openReports = reports.listOpenReports(10)
    if (openReports.length === 0) return reply(mp, store, userId, 'No open reports.')
    const lines = openReports.map(report => `${report.id}: ${report.name} - ${report.text}`)
    reply(mp, store, userId, lines.join('\n'))
  }

  // ── Production / commodity floor ─────────────────────────────────────────
  handlers['production'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const player = store.get(userId)
    if (!player) return

    if (sub === 'list') {
      if (!player.holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
      const sites = production.getSitesByHold(player.holdId)
      if (sites.length === 0) return reply(mp, store, userId, 'No production sites are registered for this hold.')
      const lines = sites.map(site => {
        const resource = production.RESOURCES[site.resourceId]
        return `${site.id}: ${site.name} -> ${site.outputCount} ${resource.name}`
      })
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'work') {
      const siteId = args[1]
      if (!siteId) return reply(mp, store, userId, 'Usage: /production work [siteId]')
      const result = production.workSite(mp, store, bus, userId, siteId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'sell') {
      const resourceId = args[1]
      const amount = parseInt(args[2])
      if (!resourceId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /production sell [resourceId] [amount]')
      const result = commodityExchange.sellAtFloor({ mp, store, bus, playerId: userId, resourceId, count: amount })
      return reply(mp, store, userId, result.message)
    }

    const floors = Object.values(production.RESOURCES)
      .map(resource => `${resource.id}: ${resource.name} floor ${resource.floorPrice}g`)
      .join('\n')
    reply(mp, store, userId, 'Usage: /production list | work [siteId] | sell [resourceId] [amount]\n' + floors)
  }

  handlers['pve'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]

    if (sub === 'wildlife') {
      const holdId = (args[1] || '').toLowerCase()
      if (!holdId) return reply(mp, store, userId, 'Usage: /pve wildlife [holdId]')
      const result = pve.spawnWildlife(mp, bus, holdId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'dungeon') {
      const groupId = (args[1] || '').toLowerCase()
      if (!groupId) return reply(mp, store, userId, 'Usage: /pve dungeon [groupId]')
      const result = pve.spawnDungeon(mp, bus, groupId)
      return reply(mp, store, userId, result.message)
    }

    const holds = Object.keys(pve.WILDLIFE_BY_HOLD).join(', ')
    const groups = Object.keys(pve.DUNGEON_GROUPS).join(', ')
    reply(mp, store, userId, `Usage: /pve wildlife [holdId] | dungeon [groupId]\nHolds: ${holds}\nDungeons: ${groups}`)
  }

  handlers['cart'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]

    if (sub === 'create') {
      const result = transport.createCart(store, userId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'list') {
      const carts = transport.listCarts(userId)
      if (carts.length === 0) return reply(mp, store, userId, 'You have no carts.')
      const lines = carts.map(cart => {
        const items = cart.inventory.length
          ? cart.inventory.map(entry => `${entry.baseId.toString(16)} x${entry.count}`).join(', ')
          : 'empty'
        return `${cart.id} (${cart.holdId || 'no hold'}): ${items}`
      })
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'load' || sub === 'unload') {
      const cartId = args[1]
      const baseId = parseBaseId(args[2])
      const count = parseInt(args[3])
      if (!cartId || !baseId || !count || count <= 0) return reply(mp, store, userId, `Usage: /cart ${sub} [cartId] [baseId] [amount]`)
      const result = sub === 'load'
        ? transport.loadCart(mp, store, userId, cartId, baseId, count)
        : transport.unloadCart(mp, store, userId, cartId, baseId, count)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'probe') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const type = (args[1] || '').toLowerCase()
      if (!type) return reply(mp, store, userId, 'Usage: /cart probe horse|cart|carriage')
      const result = transport.probeVehicle(mp, bus, type)
      return reply(mp, store, userId, result.message)
    }

    reply(mp, store, userId, 'Usage: /cart create | list | load [cartId] [baseId] [amount] | unload [cartId] [baseId] [amount] | probe horse|cart|carriage')
  }

  handlers['alpha'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const player = store.get(userId)
    if (!player) return

    if (sub === 'plugin') {
      const status = alphaSpikes.getPluginStatus()
      const custom = status.customPlugins.length ? status.customPlugins.join(', ') : 'none'
      return reply(mp, store, userId, `Gamemode: ${status.gamemodePath}\nCustom plugins: ${custom}\nESL needs verification: ${status.eslNeedsVerification}`)
    }

    if (sub === 'papyrus') {
      const events = papyrusBridge.getRegisteredEvents(mp)
      return reply(mp, store, userId, `Registered Papyrus events: ${events.length ? events.join(', ') : 'none'}`)
    }

    if (sub === 'probes') {
      const lines = engineProbes.getProbeStatus().map(probe => `${probe.priority}. ${probe.id}: ${probe.status}`)
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'assets') {
      const families = espAssetRegistry.getRecordFamilies()
      return reply(mp, store, userId, `Registered ESP asset families: ${families.join(', ')}`)
    }

    if (sub === 'mods') {
      const lines = modSourceRegistry.getIntegrationSummary().map(mod => `${mod.id}: ${mod.permissionStatus}`)
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'ui') {
      const payload = alphaSpikes.sendUiStatus(mp, player.actorId)
      return reply(mp, store, userId, `Alpha UI path: ${payload.alphaUiPath}; SkyUI: ${payload.skyUiStatus}`)
    }

    reply(mp, store, userId, 'Usage: /alpha plugin | papyrus | ui')
  }

  // ── Housing ──────────────────────────────────────────────────────────────
  handlers['property'] = (userId, args) => {
    const sub = args[0]
    if (sub === 'list') {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const player = store.get(userId)
      const holdId = player ? player.holdId : null
      if (!holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
      const list = housing.getPropertiesByHold(holdId)
      const lines = list.map(p => `${p.id}: ${p.name} [${p.type}] — ${p.ownerId ? 'Owned' : p.pendingOwnerId ? 'Pending' : 'Available'}`)
      reply(mp, store, userId, lines.length ? lines.join('\n') : 'No properties in this hold.')
    } else if (sub === 'request') {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      if (!propertyId) return reply(mp, store, userId, 'Usage: /property request [propertyId]')
      // Find a steward in the hold (simplified: notify all leaders in hold)
      const stewardId = _findStewardForProperty(store, housing, propertyId)
      if (stewardId === null) return reply(mp, store, userId, 'No Steward available in this hold.')
      const ok = housing.requestProperty(mp, store, bus, userId, propertyId, stewardId)
      reply(mp, store, userId, ok ? 'Property request sent to Steward.' : 'Property unavailable.')
    } else if (sub === 'approve') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.approveProperty(mp, store, bus, propertyId, userId, treasury)
      reply(mp, store, userId, ok ? 'Property approved.' : 'No pending request for that property.')
    } else if (sub === 'deny') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.denyProperty(mp, propertyId, store)
      reply(mp, store, userId, ok ? 'Property request denied.' : 'Property not found.')
    } else if (sub === 'setprice') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const price = parseInt(args[2])
      if (!propertyId || isNaN(price) || price < 0) return reply(mp, store, userId, 'Usage: /property setprice [id] [price]')
      const ok = housing.setPropertyPrice(propertyId, price)
      reply(mp, store, userId, ok ? `Property price set to ${price}.` : 'Property not found.')
    } else if (sub === 'summon') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.summonProperty(mp, store, bus, propertyId, userId)
      reply(mp, store, userId, ok ? 'Property requester summoned.' : 'No pending request for that property.')
    } else if (sub === 'revoke') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.revokeProperty(mp, store, propertyId)
      reply(mp, store, userId, ok ? 'Property revoked.' : 'Property not found.')
    } else {
      reply(mp, store, userId, 'Usage: /property list | request [id] | approve [id] | deny [id] | setprice [id] [price] | summon [id] | revoke [id]')
    }
  }

  handlers['craft'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (sub === 'list' || !sub) {
      const lines = Object.values(crafting.RECIPES).map(recipe => `${recipe.id}: ${recipe.name}`)
      return reply(mp, store, userId, lines.join('\n'))
    }
    const result = crafting.craftItem(mp, store, bus, userId, sub)
    reply(mp, store, userId, result.message)
  }

  // ── Bounty ───────────────────────────────────────────────────────────────
  handlers['bounty'] = (userId, args) => {
    const sub = args[0]
    if (!sub) {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const bounties = bounty.getAllBounties(mp, store, userId)
      const lines = Object.entries(bounties).filter(([,v]) => v > 0).map(([h,v]) => `${h}: ${v}`)
      reply(mp, store, userId, lines.length ? lines.join('\n') : 'No bounties.')
    } else if (sub === 'check') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const target = targetFromArgs(userId, args.slice(1), { defaultSelf: true })
      if (!target) return reply(mp, store, userId, `Player "${args.slice(1).join(' ')}" not found.`)
      const bounties = bounty.getAllBounties(mp, store, target.id)
      const lines = Object.entries(bounties).filter(([,v]) => v > 0).map(([h,v]) => `${h}: ${v}`)
      reply(mp, store, userId, `Bounties for ${target.name}:\n${lines.length ? lines.join('\n') : 'None'}`)
    } else if (sub === 'add') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const amount = parseInt(args[args.length - 1])
      const holdId = (args[args.length - 2] || '').toLowerCase()
      const target = targetFromArgs(userId, args.slice(1, -2))
      if (!target || !holdId || !amount) return reply(mp, store, userId, 'Usage: /bounty add [name] [holdId] [amount]')
      bounty.addBounty(mp, store, bus, target.id, holdId, amount)
      reply(mp, store, userId, `Added ${amount} bounty for ${target.name} in ${holdId}.`)
    } else if (sub === 'clear') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[args.length - 1] || '').toLowerCase()
      const target = targetFromArgs(userId, args.slice(1, -1))
      if (!target || !holdId) return reply(mp, store, userId, 'Usage: /bounty clear [name] [holdId]')
      bounty.clearBounty(mp, store, bus, target.id, holdId)
      reply(mp, store, userId, `Cleared bounty for ${target.name} in ${holdId}.`)
    } else {
      reply(mp, store, userId, 'Usage: /bounty | check [name] | add [name] [hold] [amount] | clear [name] [hold]')
    }
  }

  // ── Justice ──────────────────────────────────────────────────────────────
  handlers['arrest'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const officer = store.get(userId)
    const holdId  = officer ? officer.holdId : null
    if (!holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
    // Find Jarl of this hold to notify
    const jarlId = _findJarlForHold(store, holdId)
    const ok = prison.queueForSentencing(mp, store, bus, target.id, holdId, userId, jarlId || userId)
    reply(mp, store, userId, ok ? `${target.name} queued for sentencing.` : `${target.name} is already in queue.`)
  }

  handlers['sentence'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const type = (args[1] || '').toLowerCase()
    if (!['fine','release','banish'].includes(type)) return reply(mp, store, userId, 'Usage: /sentence [name] fine [amount] | release | banish')
    const sentence = { type }
    if (type === 'fine') {
      sentence.fineAmount = parseInt(args[2]) || 0
    }
    const ok = prison.sentencePlayer(mp, store, bus, target.id, userId, sentence)
    reply(mp, store, userId, ok ? `Sentenced ${target.name}: ${type}.` : `${target.name} is not in queue.`)
  }

  // ── Captivity ────────────────────────────────────────────────────────────
  handlers['capture'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    captivity.capturePlayer(mp, store, bus, target.id, userId)
    reply(mp, store, userId, `${target.name} taken captive.`)
  }

  handlers['release'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    captivity.releasePlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} released.`)
  }

  handlers['handsup'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const enabled = (args[0] || 'on').toLowerCase() !== 'off'
    const result = interactionState.setSurrender(mp, store, bus, userId, enabled)
    reply(mp, store, userId, result.message)
  }

  handlers['cuff'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.cuffPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['uncuff'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.uncuffPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['search'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.searchPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['carry'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.carryPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['treat'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    const treatmentId = (args[1] || 'bandage').toLowerCase()
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = medical.treatPlayer(mp, store, bus, userId, target.id, treatmentId)
    reply(mp, store, userId, result.message)
  }

  // ── Combat — player actions ──────────────────────────────────────────────
  handlers['revive'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.revivePlayer(mp, store, bus, userId, target.id)
    if (ok) {
      reply(mp, store, userId, `You revived ${target.name}.`)
    }
  }

  handlers['execute'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.executePlayer(mp, store, bus, prison, housing, userId, target.id)
    if (ok) reply(mp, store, userId, `${target.name} executed.`)
  }

  handlers['loot'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.openLootSession(mp, store, bus, inv, userId, target.id)
    if (!ok) reply(mp, store, userId, `Could not open loot menu for ${target.name}.`)
  }

  // ── Combat (staff) ───────────────────────────────────────────────────────
  handlers['down'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    combat.downPlayer(mp, store, bus, target.id, userId)
    reply(mp, store, userId, `${target.name} forced down.`)
  }

  handlers['rise'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    combat.risePlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} risen.`)
  }

  handlers['nvfl'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    if (args[0] === 'clear') {
      const target = findPlayer(store, args[1])
      if (!target) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      nvfl.clearNvfl(store, target.id)
      reply(mp, store, userId, `NVFL cleared for ${target.name}.`)
    } else {
      reply(mp, store, userId, 'Usage: /nvfl clear [name]')
    }
  }

  // ── Factions ─────────────────────────────────────────────────────────────
  handlers['faction'] = (userId, args) => {
    const sub = args[0]
    if (sub === 'join') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const maybeRank = parseInt(args[args.length - 1])
      const hasRank = args.length > 3 && !isNaN(maybeRank)
      const factionId = (args[hasRank ? args.length - 2 : args.length - 1] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, hasRank ? -2 : -1))
      const rank      = hasRank ? maybeRank : 0
      if (!target || !factionId) return reply(mp, store, userId, 'Usage: /faction join [name] [factionId] (rank)')
      factions.joinFaction(mp, store, bus, target.id, factionId, rank)
      reply(mp, store, userId, `${target.name} joined ${factionId} at rank ${rank}.`)
    } else if (sub === 'leave') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const factionId = (args[args.length - 1] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, -1))
      if (!target || !factionId) return reply(mp, store, userId, 'Usage: /faction leave [name] [factionId]')
      factions.leaveFaction(mp, store, bus, target.id, factionId)
      reply(mp, store, userId, `${target.name} left ${factionId}.`)
    } else if (sub === 'rank') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const rank      = parseInt(args[args.length - 1])
      const factionId = (args[args.length - 2] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, -2))
      if (!target || !factionId || isNaN(rank)) return reply(mp, store, userId, 'Usage: /faction rank [name] [factionId] [rank]')
      factions.joinFaction(mp, store, bus, target.id, factionId, rank)
      reply(mp, store, userId, `${target.name} set to rank ${rank} in ${factionId}.`)
    } else if (sub === 'bbb') {
      if (args[1] === 'set') {
        if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
        // Multi-line input not supported yet — stub only
        reply(mp, store, userId, 'BBB set not yet implemented (requires multi-line input).')
      } else {
        const factionId = (args[1] || '').toLowerCase()
        const doc = factions.getFactionDocument(mp, factionId)
        if (!doc) return reply(mp, store, userId, `No BBB document for ${factionId}.`)
        reply(mp, store, userId, `[${factionId}] Benefits: ${doc.benefits}\nBurdens: ${doc.burdens}\nBylaws: ${doc.bylaws}`)
      }
    } else {
      reply(mp, store, userId, 'Usage: /faction join|leave|rank|bbb ...')
    }
  }

  // ── Staff utilities ──────────────────────────────────────────────────────
  handlers['sober'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = targetFromArgs(userId, args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    drunkBar.soberPlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} sobered.`)
  }

  handlers['feed'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const maybeLevels = parseInt(args[args.length - 1])
    const hasLevels = args.length > 1 && !isNaN(maybeLevels)
    const target = targetFromArgs(userId, hasLevels ? args.slice(0, -1) : args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    const levels = hasLevels ? maybeLevels : 5
    hunger.feedPlayer(mp, store, bus, target.id, levels)
    reply(mp, store, userId, `Fed ${target.name} (${levels} levels).`)
  }

  // ── Treasury ─────────────────────────────────────────────────────────────
  handlers['treasury'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (!sub) {
      const balances = treasury.getAllBalances()
      const lines = treasury.ALL_HOLDS.map(h => `${h}: ${balances[h]} Septims`)
      return reply(mp, store, userId, lines.join('\n'))
    }
    if (sub === 'balance') {
      const holdId = (args[1] || '').toLowerCase()
      if (!holdId) return reply(mp, store, userId, 'Usage: /treasury balance [holdId]')
      return reply(mp, store, userId, `${holdId} treasury: ${treasury.getBalance(holdId)} Septims`)
    }
    if (sub === 'withdraw') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[1] || '').toLowerCase()
      const amount = parseInt(args[2])
      if (!holdId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /treasury withdraw [holdId] [amount]')
      const player = store.get(userId)
      if (player && player.holdId !== holdId && !player.isStaff) return reply(mp, store, userId, `You can only withdraw from your own hold (${player.holdId}).`)
      const ok = treasury.withdraw(bus, holdId, amount)
      reply(mp, store, userId, ok ? `Withdrew ${amount} Septims from ${holdId} treasury.` : `Insufficient funds in ${holdId} treasury.`)
      return
    }
    if (sub === 'deposit') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[1] || '').toLowerCase()
      const amount = parseInt(args[2])
      if (!holdId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /treasury deposit [holdId] [amount]')
      treasury.deposit(bus, holdId, amount)
      reply(mp, store, userId, `Deposited ${amount} Septims into ${holdId} treasury.`)
      return
    }
    reply(mp, store, userId, 'Usage: /treasury | balance [holdId] | withdraw [holdId] [amount] | deposit [holdId] [amount]')
  }

  // ── Magic — skill dice ────────────────────────────────────────────────────
  handlers['skill-dice'] = (userId, args) => {
    magic.handleSkillDice(mp, store, bus, userId, args)
  }

  // ── Roleplay ──────────────────────────────────────────────────────────────
  handlers['setdescription'] = (userId, args) => {
    const player = store.get(userId)
    if (!player) return
    const text = args.join(' ').trim()
    if (!text) return reply(mp, store, userId, 'Usage: /description [text]')
    const saved = roleplay.setDescription(mp, player.actorId, text)
    reply(mp, store, userId, `Description set (${saved.length}/${roleplay.DESCRIPTION_MAX} chars).`)
  }

  handlers['description'] = handlers['setdescription']
  handlers['desc'] = handlers['setdescription']

  handlers['examine'] = (userId, args) => {
    const target = targetFromArgs(userId, args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    const packet = roleplay.examinePlayer(mp, store, userId, target.id, { bounty, prison })
    if (!packet) return
    const lines = [
      `${packet.name} (${packet.race})`,
      packet.description,
    ]
    if (packet.warrant) {
      lines.push(`Warrant: ${packet.warrant.holdId} bounty ${packet.warrant.activeBounty}; priors ${packet.warrant.priors.length}`)
    }
    reply(mp, store, userId, lines.join('\n'))
    mp.sendCustomPacket(store.get(userId).actorId, 'examine', packet)
  }

  handlers['racemenu'] = (userId, args) => {
    const player = store.get(userId)
    if (!player) return
    if (args[0] === 'reset') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const target = targetFromArgs(userId, args.slice(1), { defaultSelf: true })
      if (!target) return reply(mp, store, userId, `Player "${args.slice(1).join(' ')}" not found.`)
      roleplay.resetRaceMenu(mp, target.actorId)
      reply(mp, store, userId, `Race menu reset for ${target.name}.`)
      return
    }
    const ok = roleplay.openRaceMenu(mp, player.actorId)
    if (!ok) reply(mp, store, userId, 'Your character is already set up. Contact staff to reset.')
  }

  // ── Role management (staff only) ─────────────────────────────────────────
  handlers['role'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    if (args[0] !== 'set') return reply(mp, store, userId, 'Usage: /role set [name] player|leader|staff')
    const split = splitTargetAndTrailingArg(args.slice(1))
    const target = targetFromArgs(userId, split.targetArgs, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${split.targetArgs.join(' ')}" not found.`)
    const role = (split.value || '').toLowerCase()
    if (!['player', 'leader', 'staff'].includes(role)) return reply(mp, store, userId, 'Role must be: player, leader, or staff')
    const ok = permissions.setRole(mp, store, bus, target.id, role)
    if (!ok) return reply(mp, store, userId, 'Failed to set role.')
    reply(mp, store, userId, `${target.name} is now ${role}.`)
    reply(mp, store, target.id, `Your role has been set to ${role} by ${store.get(userId).name}.`)
  }

  // ── Chat commands ─────────────────────────────────────────────────────────
  handlers['whisper'] = (userId, args) => {
    const text = args.join(' ')
    if (!text) return reply(mp, store, userId, 'Usage: /whisper <message>')
    chatHelper.broadcastProximity(mp, store, userId, text, PROXIMITY_RANGE_WHISPER, 'whisper')
  }

  handlers['yell'] = (userId, args) => {
    const text = args.join(' ')
    if (!text) return reply(mp, store, userId, 'Usage: /yell <message>')
    chatHelper.broadcastProximity(mp, store, userId, text, PROXIMITY_RANGE_YELL, 'yell')
  }

  // ── Register customPacket handler ────────────────────────────────────────
  mp.on('customPacket', (userId, contentJson) => {
    try {
      const content = JSON.parse(contentJson)
      const type = content.customPacketType || ''
      if (type === 'lootSelection') {
        combat.completeLootSession(mp, store, bus, inv, userId, content)
      }
    } catch (err) {
      console.error(`[commands] Error handling packet from ${userId}: ${err.message}`)
    }
  })

  _handlers = handlers
  console.log(`[commands] Registered ${Object.keys(handlers).length} commands`)
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _findUserIdByName(store, name, currentUserId) {
  const player = resolvePlayerTarget(store, currentUserId, name)
  return player ? player.id : null
}

function _findStewardForProperty(store, housing, propertyId) {
  const prop = housing.getProperty(propertyId)
  if (!prop) return null
  // Look for an online leader in the same hold — simplified heuristic
  const candidates = store.getAll().filter(p => p.holdId === prop.holdId && p.isLeader)
  return candidates.length ? candidates[0].id : null
}

function _findJarlForHold(store, holdId) {
  // Look for online staff in the same hold as a Jarl proxy
  const candidates = store.getAll().filter(p => p.holdId === holdId && p.isLeader)
  return candidates.length ? candidates[0].id : null
}

module.exports = {
  parseCommand,
  findPlayer,
  resolvePlayerTarget,
  resolvePlayerTargetFromArgs,
  splitTargetAndTrailingArg,
  checkPermission,
  registerAll,
  dispatch,
}


/***/ },

/***/ "./commodityExchange.js"
/*!******************************!*\
  !*** ./commodityExchange.js ***!
  \******************************/
(module, __unused_webpack_exports, __webpack_require__) {



const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
const production = __webpack_require__(/*! ./production */ "./production.js")

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


/***/ },

/***/ "./courier.js"
/*!********************!*\
  !*** ./courier.js ***!
  \********************/
(module) {



var DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
var PROP_KEY = 'ff_courier'

function loadNotifications(mp, actorId) {
  var raw
  try { raw = mp.get(actorId, PROP_KEY) } catch (e) { raw = null }
  return Array.isArray(raw) ? raw : []
}

function saveNotifications(mp, actorId, notifications) {
  var clean = filterExpired(notifications)
  mp.set(actorId, PROP_KEY, clean)
}

function createNotification(type, fromPlayerId, toPlayerId, holdId, payload, now) {
  if (now === undefined) now = Date.now()
  return {
    id: now + '-' + fromPlayerId + '-' + type,
    type: type,
    fromPlayerId: fromPlayerId,
    toPlayerId: toPlayerId,
    holdId: holdId,
    payload: payload,
    createdAt: now,
    expiresAt: now + DEFAULT_EXPIRY_MS,
    read: false,
  }
}

function filterExpired(notifications, now) {
  if (now === undefined) now = Date.now()
  return notifications.filter(function (n) {
    return n.expiresAt === null || n.expiresAt > now
  })
}

function getUnread(notifications) {
  return notifications.filter(function (n) { return !n.read })
}

function sendNotification(mp, store, notification) {
  var recipient = store.get(notification.toPlayerId)

  if (recipient) {
    var existing = loadNotifications(mp, recipient.actorId)
    saveNotifications(mp, recipient.actorId, existing.concat([notification]))
    mp.sendCustomPacket(recipient.actorId, 'courierNotification', { notification: notification })
  }

  console.log('[Courier] Notification ' + notification.id + ' queued for player ' + notification.toPlayerId)
}

function markRead(mp, store, playerId, notificationId) {
  var player = store.get(playerId)
  if (!player) return

  var notifications = loadNotifications(mp, player.actorId)
  var updated = notifications.map(function (n) {
    return n.id === notificationId ? Object.assign({}, n, { read: true }) : n
  })
  saveNotifications(mp, player.actorId, updated)
}

function getPendingNotifications(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return []
  var notifications = loadNotifications(mp, player.actorId)
  return getUnread(filterExpired(notifications))
}

function init(mp, store, bus) {
  console.log('[courier] Initializing')

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var player = store.get(playerId)
    if (!player) return

    var notifications = loadNotifications(mp, actorId)
    var unread = getUnread(filterExpired(notifications))

    if (unread.length > 0) {
      mp.sendCustomPacket(actorId, 'courierDelivery', {
        count: unread.length,
        notifications: unread,
      })
      console.log('[Courier] Delivered ' + unread.length + ' notification(s) to ' + player.name)
    }
  })

  console.log('[courier] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var notifications = loadNotifications(mp, player.actorId)
  var unread = getUnread(filterExpired(notifications))
  if (unread.length > 0) {
    mp.sendCustomPacket(player.actorId, 'courierDelivery', {
      count: unread.length,
      notifications: unread,
    })
  }
}

module.exports = {
  createNotification, filterExpired, getUnread,
  sendNotification, markRead, getPendingNotifications,
  init, onConnect,
}


/***/ },

/***/ "./crafting.js"
/*!*********************!*\
  !*** ./crafting.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
const production = __webpack_require__(/*! ./production */ "./production.js")
const skills = __webpack_require__(/*! ./skills */ "./skills.js")

const ITEMS = {
  saltPile: 0x00034CDF,
  jazbayGrapes: 0x0006AC4A,
  bread: 0x00065C97,
  nordMead: 0x00034C5D,
  leather: 0x000DB5D2,
  leatherStrips: 0x000800E4,
  linenWrap: 0x00034CD6,
  bandage: 0x00034CD6,
}

const RECIPES = {
  ironIngot: {
    id: 'ironIngot',
    name: 'Iron Ingot',
    station: 'smelter',
    inputs: [{ baseId: production.RESOURCES.ironOre.baseId, count: 2 }],
    output: { baseId: 0x0005ACE4, count: 1 },
    skillId: 'smithing',
    xp: 15,
  },
  charcoal: {
    id: 'charcoal',
    name: 'Charcoal',
    station: 'kiln',
    inputs: [{ baseId: production.RESOURCES.lumber.baseId, count: 2 }],
    output: { baseId: 0x00033760, count: 1 },
    skillId: 'smithing',
    xp: 8,
  },
  leather: {
    id: 'leather',
    name: 'Leather',
    station: 'tanningRack',
    inputs: [{ baseId: 0x0003AD52, count: 1 }],
    output: { baseId: ITEMS.leather, count: 1 },
    skillId: 'tailoring',
    xp: 10,
  },
  flatbread: {
    id: 'flatbread',
    name: 'Flatbread',
    station: 'oven',
    inputs: [
      { baseId: production.RESOURCES.wheat.baseId, count: 2 },
      { baseId: ITEMS.saltPile, count: 1 },
    ],
    output: { baseId: ITEMS.bread, count: 1 },
    skillId: 'baking',
    xp: 12,
  },
  juniperMead: {
    id: 'juniperMead',
    name: 'Juniper Mead',
    station: 'brewery',
    inputs: [
      { baseId: production.RESOURCES.honey.baseId, count: 2 },
      { baseId: ITEMS.jazbayGrapes, count: 1 },
    ],
    output: { baseId: ITEMS.nordMead, count: 1 },
    skillId: 'brewing',
    xp: 16,
  },
  leatherStrips: {
    id: 'leatherStrips',
    name: 'Leather Strips',
    station: 'tanningRack',
    inputs: [{ baseId: ITEMS.leather, count: 1 }],
    output: { baseId: ITEMS.leatherStrips, count: 4 },
    skillId: 'tailoring',
    xp: 8,
  },
  linenBandage: {
    id: 'linenBandage',
    name: 'Linen Bandage',
    station: 'medicalTable',
    inputs: [{ baseId: ITEMS.linenWrap, count: 2 }],
    output: { baseId: ITEMS.bandage, count: 1 },
    skillId: 'medicine',
    xp: 10,
  },
}

function canCraft(mp, actorId, recipe) {
  if (!recipe) return { ok: false, reason: 'unknown_recipe' }
  for (const input of recipe.inputs) {
    if (!inv.hasItem(mp, actorId, input.baseId, input.count)) {
      return { ok: false, reason: 'missing_input', input }
    }
  }
  return { ok: true }
}

function craftItem(mp, store, bus, playerId, recipeId) {
  const player = store.get(playerId)
  const recipe = RECIPES[recipeId]
  if (!player) return { ok: false, message: 'Player not found.' }
  const allowed = canCraft(mp, player.actorId, recipe)
  if (!allowed.ok) return { ok: false, reason: allowed.reason, message: 'You do not have the required materials.' }

  for (const input of recipe.inputs) {
    inv.removeItem(mp, player.actorId, input.baseId, input.count)
  }
  inv.addItem(mp, player.actorId, recipe.output.baseId, recipe.output.count)
  const xpGranted = recipe.skillId ? skills.addSkillXp(mp, store, playerId, recipe.skillId, recipe.xp || 0) : 0
  if (bus) {
    if (xpGranted > 0) bus.dispatch({ type: 'skillXpGranted', playerId, skillId: recipe.skillId, xp: xpGranted, source: 'crafting', recipeId })
    bus.dispatch({ type: 'itemCrafted', playerId, recipeId, output: recipe.output })
  }
  return { ok: true, message: `Crafted ${recipe.name}.`, recipe, xpGranted }
}

module.exports = { ITEMS, RECIPES, canCraft, craftItem }


/***/ },

/***/ "./dialogProperty.js"
/*!***************************!*\
  !*** ./dialogProperty.js ***!
  \***************************/
(module, __unused_webpack_exports, __webpack_require__) {



const fi = __webpack_require__(/*! ./functionInfo */ "./functionInfo.js")
const rw = __webpack_require__(/*! ./refreshWidgets */ "./refreshWidgets.js")

let _mp
const _openDialogIds = new Map()

class DialogProperty {
  static init(mp) {
    _mp = mp
    mp.makeProperty('dialog', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(DialogProperty._clientsideUpdateOwner()).getText({ refreshWidgets: rw.refreshWidgetsJs }),
      updateNeighbor: '',
    })
    mp.makeEventSource('_onDialogResponse', new fi.FunctionInfo(DialogProperty._clientsideInitDialogResponse()).getText())
    mp['_onDialogResponse'] = DialogProperty._onDialogResponse
  }

  static showMessageBox(actorId, dialogId, caption, text, buttons) {
    _openDialogIds.set(actorId, dialogId)
    _mp.set(actorId, 'dialog', ['messageBox', caption, text, buttons])
  }

  static clearDialog(actorId) {
    _openDialogIds.delete(actorId)
    _mp.set(actorId, 'dialog', null)
  }

  static setResponseHandler(handler) {
    DialogProperty._handler = handler
  }

  static _onDialogResponse(actorId, ...args) {
    if (args[0] !== 'buttonClick' || typeof args[1] !== 'number') return
    const dialogId = _openDialogIds.get(actorId)
    if (dialogId == null) return
    const buttonIndex = args[1]
    if (DialogProperty._handler) {
      DialogProperty._handler({ actorId, dialogId, buttonIndex })
    }
  }

  static _clientsideInitDialogResponse() {
    return () => {
      ctx.sp.on('browserMessage', function (event) {
        if (event.arguments[0] === 'buttonClick') {
          ctx.sendEvent(...event.arguments)
        }
      })
    }
  }

  static _clientsideUpdateOwner() {
    return () => {
      var newJ = JSON.stringify(ctx.value)
      if (newJ === ctx.state._dlgPrev) return
      ctx.state._dlgPrev = newJ

      if (!ctx.value) {
        ctx.sp.browser.executeJavaScript('window.dialog=[];' + refreshWidgets)
        return
      }

      if (ctx.value[0] === 'messageBox') {
        var caption = ctx.value[1]
        var text = ctx.value[2]
        var buttons = ctx.value[3]
        var src = 'var _t={type:"form",caption:' + JSON.stringify(caption) + ',elements:[]};'
        src += '_t.elements.push({type:"text",text:' + JSON.stringify(text) + '});'
        for (var i = 0; i < buttons.length; i++) {
          src += '_t.elements.push({type:"button",text:' + JSON.stringify(buttons[i]) + ',tags:["BUTTON_STYLE_FRAME"],click:(function(n){return function(){window.skyrimPlatform.sendMessage("buttonClick",n);};})('+i+')});'
        }
        src += 'window.dialog=[_t];' + refreshWidgets
        ctx.sp.browser.executeJavaScript(src)
      }
    }
  }
}

DialogProperty._handler = null

module.exports = { DialogProperty }


/***/ },

/***/ "./drunkBar.js"
/*!*********************!*\
  !*** ./drunkBar.js ***!
  \*********************/
(module) {



var DRUNK_MAX = 10
var DRUNK_MIN = 0
var SOBER_DRAIN_INTERVAL_MINUTES = 5
var TICK_INTERVAL_MS = 60 * 1000

var ALCOHOL_STRENGTHS = {
  '0x000340': 1,
  '0x034c5e': 1,
  '0x034c5f': 2,
  '0x034c60': 3,
  '0x034c62': 2,
  '0x0003404b': 3,
}

function calcNewDrunkLevel(current, delta) {
  return Math.max(DRUNK_MIN, Math.min(DRUNK_MAX, current + delta))
}

function shouldSober(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % SOBER_DRAIN_INTERVAL_MINUTES === 0
}

function getAlcoholStrength(baseId) {
  return ALCOHOL_STRENGTHS[baseId] || 0
}

function drinkAlcohol(mp, store, bus, playerId, baseId) {
  var player = store.get(playerId)
  if (!player) return -1

  var strength = getAlcoholStrength(baseId)
  if (strength === 0) return player.drunkLevel

  var newDrunk = calcNewDrunkLevel(player.drunkLevel, strength)
  store.update(playerId, { drunkLevel: newDrunk })
  mp.set(player.actorId, 'ff_drunk', newDrunk)

  bus.dispatch({ type: 'drunkChanged', playerId: playerId, drunkLevel: newDrunk })

  return newDrunk
}

function soberPlayer(mp, store, bus, playerId) {
  var player = store.get(playerId)
  if (!player) return

  store.update(playerId, { drunkLevel: DRUNK_MIN })
  mp.set(player.actorId, 'ff_drunk', DRUNK_MIN)

  bus.dispatch({ type: 'drunkChanged', playerId: playerId, drunkLevel: DRUNK_MIN })
}

function init(mp, store, bus) {
  console.log('[drunkBar] Initializing')

  mp.makeProperty('ff_drunk', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var persisted = mp.get(actorId, 'ff_drunk')
    var drunk = persisted !== null && persisted !== undefined ? persisted : DRUNK_MIN
    store.update(playerId, { drunkLevel: drunk })
    mp.set(actorId, 'ff_drunk', drunk)
  })

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var player = players[i]
      if (player.drunkLevel <= DRUNK_MIN) continue

      if (shouldSober(player.minutesOnline)) {
        var newDrunk = calcNewDrunkLevel(player.drunkLevel, -1)
        store.update(player.id, { drunkLevel: newDrunk })
        mp.set(player.actorId, 'ff_drunk', newDrunk)
        bus.dispatch({ type: 'drunkChanged', playerId: player.id, drunkLevel: newDrunk })
      }
    }
  }, TICK_INTERVAL_MS)

  console.log('[drunkBar] Started')
}

function onConnect(mp, store, bus, userId) {
  // drunk level restored from persistence in playerJoined handler
}

module.exports = {
  calcNewDrunkLevel, shouldSober, getAlcoholStrength,
  drinkAlcohol, soberPlayer, init, onConnect,
}


/***/ },

/***/ "./economy.js"
/*!********************!*\
  !*** ./economy.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const inv  = __webpack_require__(/*! ./inventory */ "./inventory.js")

// ── Constants ─────────────────────────────────────────────────────────────────
const STIPEND_RATE         = 50
const STIPEND_CAP_HOURS    = 24
const STIPEND_INTERVAL_MIN = 60
const TICK_INTERVAL_MS     = 60 * 1000

// ── Pure helpers ──────────────────────────────────────────────────────────────

function isStipendEligible(stipendPaidHours) {
  return stipendPaidHours < STIPEND_CAP_HOURS
}

function shouldPayStipend(minutesOnline, stipendPaidHours) {
  if (!isStipendEligible(stipendPaidHours)) return false
  return minutesOnline > 0 && minutesOnline % STIPEND_INTERVAL_MIN === 0
}

// ── Actions ───────────────────────────────────────────────────────────────────

function transferGold(mp, store, fromId, toId, amount) {
  if (!amount || amount <= 0) return false
  const from = store.get(fromId)
  const to   = store.get(toId)
  if (!from || !to) return false
  if (from.septims < amount) return false

  if (!inv.transferItem(mp, from.actorId, to.actorId, inv.GOLD_BASE_ID, amount)) return false

  store.update(fromId, { septims: inv.getItemCount(mp, from.actorId, inv.GOLD_BASE_ID) })
  store.update(toId,   { septims: inv.getItemCount(mp, to.actorId,   inv.GOLD_BASE_ID) })

  return true
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[economy] Initializing')

  const scheduleTick = () => {
    setTimeout(() => {
      try {
        for (const player of store.getAll()) {
          if (shouldPayStipend(player.minutesOnline, player.stipendPaidHours)) {
            const newHours = player.stipendPaidHours + 1
            inv.addItem(mp, player.actorId, inv.GOLD_BASE_ID, STIPEND_RATE)
            const newSeptims = inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID)
            store.update(player.id, { septims: newSeptims, stipendPaidHours: newHours })
            mp.set(player.actorId, 'ff_stipendHours', newHours)
            bus.dispatch({ type: 'stipendTick', playerId: player.id, septims: newSeptims, stipendPaidHours: newHours })
          }
        }
      } catch (err) {
        console.error(`[economy] Tick error: ${err.message}`)
      }
      scheduleTick()
    }, TICK_INTERVAL_MS)
  }

  scheduleTick()
  console.log('[economy] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  store.update(userId, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })

  const saved = mp.get(player.actorId, 'ff_stipendHours')
  const hours = (saved !== null && saved !== undefined) ? saved : 0
  store.update(userId, { stipendPaidHours: hours })
}

module.exports = { isStipendEligible, shouldPayStipend, transferGold, onConnect, init }


/***/ },

/***/ "./engineProbes.js"
/*!*************************!*\
  !*** ./engineProbes.js ***!
  \*************************/
(module) {



const PROBES = [
  {
    id: 'esp-loadorder',
    priority: 1,
    gate: 'Custom ESP loads server-side and client-side.',
    evidence: ['server-settings loadOrder', 'FormID resolution', 'client activation packet'],
  },
  {
    id: 'esl-light-plugin',
    priority: 2,
    gate: 'Light plugins resolve without corrupting FormID assumptions.',
    evidence: ['ESL load order index', 'local FormID range 0x800-0xFFF', 'server/client activation parity'],
  },
  {
    id: 'npc-sync',
    priority: 3,
    gate: 'Wildlife and interior mobs replicate damage, death, and loot cleanly.',
    evidence: ['spawn owner', 'damage event', 'death event', 'loot validation'],
  },
  {
    id: 'mount-rider-state',
    priority: 4,
    gate: 'Horse/cart mount state can be observed and corrected safely.',
    evidence: ['rider actor', 'mount actor', 'dismount behavior', 'host authority'],
  },
  {
    id: 'combat-sync',
    priority: 5,
    gate: 'PvP/PvE combat events reach the server with enough authority to validate outcomes.',
    evidence: ['death packet', 'bleedout packet', 'attacker identity', 'damage timing'],
  },
  {
    id: 'actor-authority',
    priority: 6,
    gate: 'Server-created actors and objects have clear host/authority ownership.',
    evidence: ['mp.createActor result', 'neighbor replication', 'ownership changes', 'cleanup behavior'],
  },
]

let results = {}

function listProbes() {
  return PROBES.slice().sort((a, b) => a.priority - b.priority)
}

function getProbe(id) {
  const probe = PROBES.find(item => item.id === id)
  if (!probe) return null
  return Object.assign({ status: 'unverified', resultEvidence: null }, probe, results[id] || {})
}

function getProbeStatus() {
  return listProbes().map(probe => getProbe(probe.id))
}

function recordProbeResult(id, result) {
  if (!PROBES.some(probe => probe.id === id)) return { ok: false, message: 'Unknown probe.' }
  const status = result && result.status ? result.status : 'unverified'
  results[id] = {
    status,
    resultEvidence: result.evidence || null,
    checkedAt: result.checkedAt || Date.now(),
  }
  return { ok: true, probe: getProbe(id) }
}

function resetForTests() {
  results = {}
}

function init(mp, store, bus) {
  console.log('[engineProbes] Loaded ' + PROBES.length + ' probe definitions')
}

module.exports = { listProbes, getProbe, getProbeStatus, recordProbeResult, resetForTests, init }


/***/ },

/***/ "./espAssetRegistry.js"
/*!*****************************!*\
  !*** ./espAssetRegistry.js ***!
  \*****************************/
(module, __unused_webpack_exports, __webpack_require__) {



const ASSET_PACK = __webpack_require__(/*! ./data/esp-asset-pack.json */ "./data/esp-asset-pack.json")

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


/***/ },

/***/ "./evalProperty.js"
/*!*************************!*\
  !*** ./evalProperty.js ***!
  \*************************/
(module, __unused_webpack_exports, __webpack_require__) {



const fi = __webpack_require__(/*! ./functionInfo */ "./functionInfo.js")

class EvalProperty {
  static init() {
    mp.makeProperty('eval', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(this.clientsideUpdateOwner()).getText(),
      updateNeighbor: '',
    });
    mp.makeEventSource('_onEvalFinish', new fi.FunctionInfo(this.clientsideInitEvalFinish()).getText());
    mp['_onEvalFinish'] = this.onEvalFinish;
  }

  static eval(actorId, f, args) {
    const baseDesc = mp.get(actorId, 'baseDesc');
    const baseId = mp.getIdFromDesc(baseDesc);
    if (baseId !== 0x7 && baseId !== 0) return;

    const code = new fi.FunctionInfo(f).getText(args);
    const value = mp.get(actorId, 'eval') || { commands: [], nextId: 0 };
    value.commands.push({ code, id: value.nextId });
    value.nextId++;
    mp.set(actorId, 'eval', value);
  }

  static onEvalFinish(actorId, ...args) {
    if (typeof args[0] === 'number') {
      const greatestExecutedId = args[0];
      const value = mp.get(actorId, 'eval') || { commands: [], nextId: 0 };
      value.commands = value.commands.filter((command) => command.id > greatestExecutedId);
      mp.set(actorId, 'eval', value);
    }
  }

  static clientsideUpdateOwner() {
    return () => {
      if (!ctx.value) {
        return;
      }

      if (typeof ctx.state.evalGreatestId !== 'number') {
        ctx.state.evalGreatestId = -1;
      }

      for (const command of ctx.value.commands) {
        if (command.id > ctx.state.evalGreatestId) {
          ctx.state.evalGreatestId = command.id;

          ctx.sp.browser.executeJavaScript(
            `window.skyrimPlatform.sendMessage('evalFinish', ${ctx.state.evalGreatestId})`
          );
          eval(command.code);
        }
      }
    };
  }

  static clientsideInitEvalFinish() {
    return () => {
      ctx.sp.on('browserMessage', (event) => {
        if (event.arguments[0] === 'evalFinish') {
          const evalGreatestId = event.arguments[1];
          ctx.sendEvent(evalGreatestId);
        }
      });
    };
  }
}

module.exports = { EvalProperty };


/***/ },

/***/ "./factions.js"
/*!*********************!*\
  !*** ./factions.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



var worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

var DOCS_KEY = 'ff_faction_docs'
var MEMBERS_KEY = 'ff_memberships'

function loadDocs(mp) {
  return worldStore.get(DOCS_KEY) || {}
}

function saveDocs(mp, docs) {
  worldStore.set(DOCS_KEY, docs)
}

function loadMemberships(mp, actorId) {
  var raw = mp.get(actorId, MEMBERS_KEY)
  return Array.isArray(raw) ? raw : []
}

function saveMemberships(mp, actorId, memberships) {
  mp.set(actorId, MEMBERS_KEY, memberships)
}

function getFactionDocument(mp, factionId) {
  var docs = loadDocs(mp)
  return docs[factionId] || null
}

function setFactionDocument(mp, doc) {
  var docs = loadDocs(mp)
  docs[doc.factionId] = Object.assign({}, doc, { updatedAt: doc.updatedAt || Date.now() })
  saveDocs(mp, docs)
  console.log('[Factions] BBB document updated for ' + doc.factionId + ' by staff ' + doc.updatedBy)
}

function joinFaction(mp, store, bus, playerId, factionId, rank) {
  if (rank === undefined) rank = 0
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return false
  }

  var entry = { factionId: factionId, rank: rank, joinedAt: Date.now() }
  memberships.push(entry)
  saveMemberships(mp, player.actorId, memberships)

  store.update(playerId, { factions: memberships.map(function (m) { return m.factionId }) })

  bus.dispatch({ type: 'factionJoined', playerId: playerId, factionId: factionId, rank: rank })

  mp.sendCustomPacket(player.actorId, 'factionJoined', { factionId: factionId, rank: rank })
  console.log('[Factions] ' + player.name + ' joined ' + factionId + ' at rank ' + rank)
  return true
}

function leaveFaction(mp, store, bus, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  var before = memberships.length
  var updated = memberships.filter(function (m) { return m.factionId !== factionId })
  if (updated.length === before) return false

  saveMemberships(mp, player.actorId, updated)
  store.update(playerId, { factions: updated.map(function (m) { return m.factionId }) })

  bus.dispatch({ type: 'factionLeft', playerId: playerId, factionId: factionId })

  mp.sendCustomPacket(player.actorId, 'factionLeft', { factionId: factionId })
  console.log('[Factions] ' + player.name + ' left ' + factionId)
  return true
}

function isFactionMember(mp, store, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return false
  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return true
  }
  return false
}

function getPlayerFactionRank(mp, store, playerId, factionId) {
  var player = store.get(playerId)
  if (!player) return null
  var memberships = loadMemberships(mp, player.actorId)
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) return memberships[i].rank
  }
  return null
}

function setFactionRank(mp, store, bus, playerId, factionId, rank) {
  var player = store.get(playerId)
  if (!player) return false

  var memberships = loadMemberships(mp, player.actorId)
  var entry = null
  for (var i = 0; i < memberships.length; i++) {
    if (memberships[i].factionId === factionId) { entry = memberships[i]; break }
  }
  if (!entry) return false

  entry.rank = rank
  saveMemberships(mp, player.actorId, memberships)

  bus.dispatch({ type: 'factionJoined', playerId: playerId, factionId: factionId, rank: rank })
  mp.sendCustomPacket(player.actorId, 'factionSync', { memberships: memberships })

  console.log('[Factions] ' + player.name + ' rank in ' + factionId + ' set to ' + rank)
  return true
}

function getPlayerMemberships(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return []
  return loadMemberships(mp, player.actorId)
}

function init(mp, store, bus) {
  console.log('[factions] Initializing')

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var player = store.get(playerId)
    if (!player) return

    var memberships = loadMemberships(mp, player.actorId)
    var factionIds = memberships.map(function (m) { return m.factionId })
    store.update(playerId, { factions: factionIds })

    if (memberships.length > 0) {
      mp.sendCustomPacket(player.actorId, 'factionSync', { memberships: memberships })
    }
  })

  console.log('[factions] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var memberships = loadMemberships(mp, player.actorId)
  var factionIds = memberships.map(function (m) { return m.factionId })
  store.update(userId, { factions: factionIds })
}

module.exports = {
  getFactionDocument, setFactionDocument,
  joinFaction, leaveFaction, isFactionMember,
  getPlayerFactionRank, setFactionRank, getPlayerMemberships,
  init, onConnect,
}


/***/ },

/***/ "./functionInfo.js"
/*!*************************!*\
  !*** ./functionInfo.js ***!
  \*************************/
(module) {



function FunctionInfo(f) {
  this.f = f
}

Object.defineProperty(FunctionInfo.prototype, 'text', {
  get: function () {
    return 'try{' + this.getTextWithoutErrorHandling() + '}catch(e){' +
      "ctx.sp.printConsole('[CTX ERROR]', e, '\\n', " + this.f + ')}'
  }
})

FunctionInfo.prototype.getText = function (args) {
  if (!args) return this.text
  return 'const {' + Object.keys(args).join(',') + '} = ' + JSON.stringify(args) + ';' + this.text
}

FunctionInfo.prototype.getTextWithoutErrorHandling = function () {
  var s = this.f.toString().substring(0, this.f.toString().length - 1)
  return s.replace(new RegExp('^.+?{', 'm'), '').trim()
}

module.exports = { FunctionInfo: FunctionInfo }


/***/ },

/***/ "./housing.js"
/*!********************!*\
  !*** ./housing.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

// ── Property Registry ─────────────────────────────────────────────────────────
// 16 properties across 9 holds. propertyId is the stable key used everywhere.

const PROPERTY_REGISTRY = [
  // Whiterun
  { id: 'wrun_breezehome',   name: 'Breezehome',          holdId: 'whiterun',   type: 'home' },
  { id: 'wrun_breezeannex',  name: 'Breezehome Annex',    holdId: 'whiterun',   type: 'business' },
  // Eastmarch
  { id: 'east_hjerim',       name: 'Hjerim',              holdId: 'eastmarch',  type: 'home' },
  { id: 'east_windhelm_shop',name: 'Windhelm Market Stall',holdId: 'eastmarch', type: 'business' },
  // Rift
  { id: 'rift_honeyside',    name: 'Honeyside',           holdId: 'rift',       type: 'home' },
  { id: 'rift_riften_shop',  name: 'Riften Stall',        holdId: 'rift',       type: 'business' },
  // Reach
  { id: 'reach_vlindrel',    name: 'Vlindrel Hall',       holdId: 'reach',      type: 'home' },
  { id: 'reach_markarth_shop','name': 'Markarth Stall',   holdId: 'reach',      type: 'business' },
  // Haafingar
  { id: 'haaf_proudspire',   name: 'Proudspire Manor',    holdId: 'haafingar',  type: 'home' },
  { id: 'haaf_solitude_shop','name': 'Solitude Market',   holdId: 'haafingar',  type: 'business' },
  // Pale
  { id: 'pale_dawnstar_home','name': 'Dawnstar Cottage',  holdId: 'pale',       type: 'home' },
  { id: 'pale_dawnstar_shop','name': 'Dawnstar Stall',    holdId: 'pale',       type: 'business' },
  // Falkreath
  { id: 'falk_lakeview',     name: 'Lakeview Manor',      holdId: 'falkreath',  type: 'home' },
  { id: 'falk_falkreath_shop','name': 'Falkreath Stall',  holdId: 'falkreath',  type: 'business' },
  // Hjaalmarch
  { id: 'hjaal_windstad',    name: 'Windstad Manor',      holdId: 'hjaalmarch', type: 'home' },
  // Winterhold
  { id: 'wint_college_quarters','name': 'College Quarters',holdId: 'winterhold',type: 'home' },
]

// ── Runtime state ─────────────────────────────────────────────────────────────
// properties Map: propertyId → { ownerId, pendingOwnerId, price }

const properties = new Map()
let persistEnabled = true

function _loadRegistry() {
  for (const def of PROPERTY_REGISTRY) {
    if (!properties.has(def.id)) {
      properties.set(def.id, { ownerId: null, pendingOwnerId: null, price: null, escrowAmount: 0 })
    }
  }
}

// ── Pure lookups ──────────────────────────────────────────────────────────────

function getProperty(id) {
  const def   = PROPERTY_REGISTRY.find(p => p.id === id)
  const state = properties.get(id)
  if (!def || !state) return null
  return Object.assign({}, def, state)
}

function getPropertiesByHold(holdId) {
  return PROPERTY_REGISTRY
    .filter(p => p.holdId === holdId)
    .map(p => getProperty(p.id))
}

function getOwnedProperties(playerId) {
  return PROPERTY_REGISTRY
    .map(p => getProperty(p.id))
    .filter(p => p && p.ownerId === playerId)
}

function isAvailable(propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  return state.ownerId === null && state.pendingOwnerId === null
}

// ── Actions ───────────────────────────────────────────────────────────────────

function requestProperty(mp, store, bus, playerId, propertyId, stewardId) {
  if (!isAvailable(propertyId)) return false
  const courier = __webpack_require__(/*! ./courier */ "./courier.js")
  const state = properties.get(propertyId)
  const price = state.price || 0
  const player = store.get(playerId)
  if (!player) return false
  if (price > 0) {
    const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
    if (!inv.removeItem(mp, player.actorId, inv.GOLD_BASE_ID, price)) return false
    store.update(playerId, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })
  }
  state.pendingOwnerId = playerId
  state.escrowAmount = price
  _persist()
  const note = courier.createNotification(
    'propertyRequest', playerId, stewardId, null,
    { propertyId, requesterName: store.get(playerId) ? store.get(playerId).name : String(playerId) }
  )
  courier.sendNotification(mp, store, note)
  bus.dispatch({ type: 'propertyRequested', playerId, propertyId })
  return true
}

function approveProperty(mp, store, bus, propertyId, approverId, treasury) {
  const state = properties.get(propertyId)
  if (!state || state.pendingOwnerId === null) return false
  const def = PROPERTY_REGISTRY.find(p => p.id === propertyId)
  const newOwnerId = state.pendingOwnerId
  const escrowAmount = state.escrowAmount || 0
  state.ownerId        = newOwnerId
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()

  const player = store.get(newOwnerId)
  if (player) {
    const owned = store.get(newOwnerId).properties.concat([propertyId])
    store.update(newOwnerId, { properties: owned })
    mp.sendCustomPacket(player.actorId, 'propertyApproved', { propertyId })
  }
  if (treasury && escrowAmount > 0 && def) treasury.deposit(bus, def.holdId, escrowAmount)
  bus.dispatch({ type: 'propertyApproved', propertyId, newOwnerId, approvedBy: approverId, escrowAmount })
  return true
}

function denyProperty(mp, propertyId, store) {
  const state = properties.get(propertyId)
  if (!state) return false
  if (store && state.pendingOwnerId !== null && state.escrowAmount > 0) {
    const player = store.get(state.pendingOwnerId)
    if (player) {
      const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
      inv.addItem(mp, player.actorId, inv.GOLD_BASE_ID, state.escrowAmount)
      store.update(player.id, { septims: inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID) })
    }
  }
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()
  return true
}

function revokeProperty(mp, store, propertyId) {
  const state = properties.get(propertyId)
  if (!state) return false
  const prevOwner = state.ownerId
  state.ownerId        = null
  state.pendingOwnerId = null
  state.escrowAmount = 0
  _persist()
  if (prevOwner !== null) {
    const player = store.get(prevOwner)
    if (player) {
      const owned = player.properties.filter(id => id !== propertyId)
      store.update(prevOwner, { properties: owned })
    }
  }
  return true
}

// ── Internal ──────────────────────────────────────────────────────────────────

function setPropertyPrice(propertyId, price) {
  const state = properties.get(propertyId)
  if (!state) return false
  state.price = price
  _persist()
  return true
}

function summonProperty(mp, store, bus, propertyId, summonerId) {
  const state = properties.get(propertyId)
  if (!state || state.pendingOwnerId === null) return false
  const requesterId = state.pendingOwnerId
  const player = store.get(requesterId)
  if (player) mp.sendCustomPacket(player.actorId, 'propertySummon', { propertyId })
  bus.dispatch({ type: 'propertySummoned', propertyId, requesterId, summonedBy: summonerId })
  return true
}

function _persist() {
  if (!persistEnabled) return
  const data = []
  for (const [id, state] of properties) {
    data.push({ id, ownerId: state.ownerId, pendingOwnerId: state.pendingOwnerId, price: state.price, escrowAmount: state.escrowAmount || 0 })
  }
  worldStore.set('ff_properties', data)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[housing] Initializing')
  _loadRegistry()

  // Restore persisted state
  const saved = worldStore.get('ff_properties')
  if (Array.isArray(saved)) {
    for (const entry of saved) {
      if (properties.has(entry.id)) {
        const s = properties.get(entry.id)
        s.ownerId        = entry.ownerId
        s.pendingOwnerId = entry.pendingOwnerId
        s.price          = entry.price !== undefined ? entry.price : null
        s.escrowAmount   = entry.escrowAmount || 0
      }
    }
  }

  console.log('[housing] Started')
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  const owned = getOwnedProperties(userId).map(p => p.id)
  store.update(userId, { properties: owned })
  if (player.holdId) {
    const list = getPropertiesByHold(player.holdId)
    mp.sendCustomPacket(player.actorId, 'propertyList', { properties: list })
  }
}

function resetForTests() {
  persistEnabled = false
  properties.clear()
  _loadRegistry()
}

module.exports = {
  getProperty, getPropertiesByHold, getOwnedProperties, isAvailable,
  requestProperty, approveProperty, denyProperty, revokeProperty,
  setPropertyPrice, summonProperty, resetForTests,
  onConnect, init,
}


/***/ },

/***/ "./hudMenu.js"
/*!********************!*\
  !*** ./hudMenu.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const fi = __webpack_require__(/*! ./functionInfo */ "./functionInfo.js")
const sk = __webpack_require__(/*! ./skills */ "./skills.js")
const fa = __webpack_require__(/*! ./factions */ "./factions.js")

const _TIER_NAMES = ['Novice', 'Apprentice', 'Journeyman', 'Adept', 'Expert', 'Master']

const D = {
  CHARACTER: 100,
  SKILLS: 101,
  FACTIONS: 102,
  ACTIONS: 200,
  ACTIONS_SETDESC: 201,
  INVENTORY: 300,
}

let _mp, _store, _dp

function _findPlayer(actorId) {
  var all = _store.getAll()
  for (var i = 0; i < all.length; i++) {
    if (all[i].actorId === actorId) return all[i]
  }
  return null
}

function _showCharacterMain(actorId) {
  var p = _findPlayer(actorId)
  if (!p) return
  var hold = p.holdId || 'No Hold'
  var desc = _mp.get(actorId, 'ff_description')
  var text = 'Name: ' + p.name + '  |  Hold: ' + hold
  if (desc) text += '  |  ' + String(desc).slice(0, 80)
  _dp.DialogProperty.showMessageBox(actorId, D.CHARACTER, 'Character Profile', text, ['Skills', 'Factions', 'Close'])
}

function _showSkills(actorId) {
  var p = _findPlayer(actorId)
  if (!p) return
  var lines = sk.SKILL_IDS.map(function (id) {
    var xp = sk.getSkillXp(_mp, p.id, id)
    var tier = _TIER_NAMES[sk.getSkillLevel(xp)] || 'Novice'
    return id.charAt(0).toUpperCase() + id.slice(1) + ': ' + tier
  })
  var text = lines.slice(0, 4).join('  /  ') + '   |   ' + lines.slice(4).join('  /  ')
  _dp.DialogProperty.showMessageBox(actorId, D.SKILLS, 'Skills', text, ['Back', 'Close'])
}

function _showFactions(actorId) {
  var p = _findPlayer(actorId)
  if (!p) return
  var memberships = fa.getPlayerMemberships(_mp, _store, p.id)
  var text
  if (!memberships.length) {
    text = 'No faction memberships.'
  } else {
    text = memberships.map(function (m) {
      return m.factionId + ' (rank ' + m.rank + ')'
    }).join('  |  ')
  }
  _dp.DialogProperty.showMessageBox(actorId, D.FACTIONS, 'Factions', text, ['Back', 'Close'])
}

function _showActions(actorId) {
  _dp.DialogProperty.showMessageBox(actorId, D.ACTIONS, 'Actions',
    'What would you like to do?',
    ['Set Description', 'Inventory', 'Close'])
}

function _showInventory(actorId) {
  var p = _findPlayer(actorId)
  if (!p) return
  var gold = p.septims || 0
  _dp.DialogProperty.showMessageBox(actorId, D.INVENTORY, 'Inventory',
    'Gold: ' + gold + ' septims',
    ['Close'])
}

function _handleResponse(data) {
  var actorId = data.actorId
  var dialogId = data.dialogId
  var btn = data.buttonIndex

  switch (dialogId) {
    case D.CHARACTER:
      if (btn === 0) { _showSkills(actorId); return }
      if (btn === 1) { _showFactions(actorId); return }
      break
    case D.SKILLS:
      if (btn === 0) { _showCharacterMain(actorId); return }
      break
    case D.FACTIONS:
      if (btn === 0) { _showCharacterMain(actorId); return }
      break
    case D.ACTIONS:
      if (btn === 0) {
        _dp.DialogProperty.showMessageBox(actorId, D.ACTIONS_SETDESC, 'Set Description',
          'Type /setdescription <text> in chat to update your character description.', ['Close'])
        return
      }
      if (btn === 1) { _showInventory(actorId); return }
      break
    case D.INVENTORY:
      break
    default:
      break
  }
  _dp.DialogProperty.clearDialog(actorId)
}

function _buildHudBarJs() {
  var css = '#ff-hud{position:fixed;bottom:22px;right:18px;display:flex;flex-direction:column;gap:5px;z-index:9100}'
  css += '.ff-b{background:rgba(0,0,0,.7);border:1px solid rgba(200,166,70,.4);color:#c8a646;font:bold 11px/1 sans-serif;padding:6px 16px;cursor:pointer;text-transform:uppercase;letter-spacing:1.2px}'
  css += '.ff-b:hover{background:rgba(200,166,70,.15);border-color:rgba(200,166,70,.9)}'
  var js = '(function(){'
  js += 'if(document.getElementById("ff-hud"))return;'
  js += 'var s=document.createElement("style");s.textContent=' + JSON.stringify(css) + ';document.head.appendChild(s);'
  js += 'var b=document.createElement("div");b.id="ff-hud";'
  var btns = [['character', 'Character'], ['actions', 'Actions'], ['inventory', 'Inventory']]
  btns.forEach(function (x) {
    js += 'var btn=document.createElement("button");btn.className="ff-b";btn.textContent=' + JSON.stringify(x[1]) + ';'
    js += 'btn.onclick=(function(a){return function(){window.skyrimPlatform.sendMessage("hudAction",a);}})(' + JSON.stringify(x[0]) + ');'
    js += 'b.appendChild(btn);'
  })
  js += 'document.body.appendChild(b);'
  js += '})()'
  return js
}

function init(mp, store, bus, dp) {
  _mp = mp
  _store = store
  _dp = dp

  dp.DialogProperty.setResponseHandler(_handleResponse)

  var hudBarJs = _buildHudBarJs()

  mp.makeProperty('hudBar', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: new fi.FunctionInfo(function () {
      if (ctx.state._hudBarInjected) return
      ctx.state._hudBarInjected = true
      ctx.sp.browser.executeJavaScript(hudBarJs)
    }).getText({ hudBarJs: hudBarJs }),
    updateNeighbor: '',
  })

  mp.makeEventSource('_onHudAction', new fi.FunctionInfo(function () {
    return () => {
      ctx.sp.on('browserMessage', function (event) {
        if (event.arguments[0] === 'hudAction') {
          ctx.sendEvent(...event.arguments)
        }
      })
    }
  }()).getText())

  mp['_onHudAction'] = function (actorId, ...args) {
    if (args[0] !== 'hudAction') return
    var action = args[1]
    if (action === 'character') _showCharacterMain(actorId)
    else if (action === 'actions') _showActions(actorId)
    else if (action === 'inventory') _showInventory(actorId)
  }
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player || !player.actorId) return
  mp.set(player.actorId, 'hudBar', true)
}

module.exports = { init, onConnect }


/***/ },

/***/ "./hudSync.js"
/*!********************!*\
  !*** ./hudSync.js ***!
  \********************/
(module) {



var TICK_INTERVAL_MS = 3000

function init(mp, store, bus) {
  console.log('[hudSync] Initializing — pushes HUD state every ' + (TICK_INTERVAL_MS / 1000) + 's')

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var p = players[i]
      if (!p.actorId) continue

      var hunger = p.hungerLevel || 0
      var drunk  = p.drunkLevel  || 0
      var hold   = p.holdId      || 'Unknown'
      var bounty = p.bounty      || {}

      mp.sendCustomPacket(p.actorId, 'ff_hud_update', {
        hunger: hunger,
        drunk: drunk,
        septims: p.septims || 0,
        hold: hold,
        bounty: bounty,
      })
    }
  }, TICK_INTERVAL_MS)
}

function onConnect(mp, store, bus, userId) {
  var p = store.get(userId)
  if (!p) return

  var hunger = p.hungerLevel || 0
  var drunk  = p.drunkLevel  || 0
  var hold   = p.holdId      || 'Unknown'
  var bounty = p.bounty      || {}

  mp.sendCustomPacket(p.actorId, 'ff_hud_update', {
    hunger: hunger,
    drunk: drunk,
    septims: p.septims || 0,
    hold: hold,
    bounty: bounty,
  })
}

module.exports = { init: init, onConnect: onConnect }


/***/ },

/***/ "./hunger.js"
/*!*******************!*\
  !*** ./hunger.js ***!
  \*******************/
(module) {



var HUNGER_MAX = 10
var HUNGER_MIN = 0
var HUNGER_DRAIN_INTERVAL_MINUTES = 30
var TICK_INTERVAL_MS = 60 * 1000

function calcNewHunger(current, delta) {
  return Math.max(HUNGER_MIN, Math.min(HUNGER_MAX, current + delta))
}

function shouldDrainHunger(minutesOnline) {
  return minutesOnline > 0 && minutesOnline % HUNGER_DRAIN_INTERVAL_MINUTES === 0
}

function feedPlayer(mp, store, bus, playerId, levels) {
  if (levels === undefined) levels = 3
  var player = store.get(playerId)
  if (!player) return -1

  var newHunger = calcNewHunger(player.hungerLevel, levels)
  store.update(playerId, { hungerLevel: newHunger })
  mp.set(player.actorId, 'ff_hunger', newHunger)

  bus.dispatch({ type: 'hungerTick', playerId: playerId, hungerLevel: newHunger })

  return newHunger
}

function init(mp, store, bus) {
  console.log('[hunger] Initializing')

  mp.makeProperty('ff_hunger', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var persisted = mp.get(actorId, 'ff_hunger')
    var hunger = persisted !== null && persisted !== undefined ? persisted : HUNGER_MAX
    store.update(playerId, { hungerLevel: hunger })
    mp.set(actorId, 'ff_hunger', hunger)
  })

  setInterval(function () {
    var players = store.getAll()
    for (var i = 0; i < players.length; i++) {
      var player = players[i]
      var next = player.minutesOnline + 1
      store.update(player.id, { minutesOnline: next })

      if (shouldDrainHunger(next)) {
        var newHunger = calcNewHunger(player.hungerLevel, -1)
        store.update(player.id, { hungerLevel: newHunger })
        mp.set(player.actorId, 'ff_hunger', newHunger)
        bus.dispatch({ type: 'hungerTick', playerId: player.id, hungerLevel: newHunger })
      }
    }
  }, TICK_INTERVAL_MS)

  console.log('[hunger] Started')
}

function onConnect(mp, store, bus, userId) {
  // hunger restored from persistence in playerJoined handler
}

module.exports = { calcNewHunger, shouldDrainHunger, feedPlayer, init, onConnect }


/***/ },

/***/ "./identityOverlay.js"
/*!****************************!*\
  !*** ./identityOverlay.js ***!
  \****************************/
(module) {



function _pos(mp, actorId) {
  try { return mp.get(actorId, 'pos') || null } catch (err) { return null }
}

function _dist(a, b) {
  if (!a || !b) return Infinity
  const ax = Array.isArray(a) ? a[0] : a.x
  const ay = Array.isArray(a) ? a[1] : a.y
  const az = Array.isArray(a) ? a[2] : a.z
  const bx = Array.isArray(b) ? b[0] : b.x
  const by = Array.isArray(b) ? b[1] : b.y
  const bz = Array.isArray(b) ? b[2] : b.z
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function buildIdentityOverlay(mp, store, playerId, range) {
  const viewer = store.get(playerId)
  const maxRange = range || 2500
  if (!viewer || !viewer.actorId) return { customPacketType: 'ff_identity_overlay', identities: [] }

  const viewerPos = _pos(mp, viewer.actorId)
  const identities = store.getAll()
    .filter(player => player.actorId)
    .map(player => {
      const pos = _pos(mp, player.actorId)
      const distance = player.id === viewer.id ? 0 : _dist(viewerPos, pos)
      return { player, pos, distance }
    })
    .filter(entry => entry.distance <= maxRange)
    .sort((a, b) => a.distance - b.distance)
    .map(entry => {
      let description = null
      try { description = mp.get(entry.player.actorId, 'ff_description') || null } catch (err) { description = null }
      return {
        playerId: entry.player.id,
        actorId: entry.player.actorId,
        name: entry.player.name,
        distance: Math.round(entry.distance),
        description,
        factions: Array.isArray(entry.player.factions) ? entry.player.factions : [],
      }
    })

  return { customPacketType: 'ff_identity_overlay', range: maxRange, identities }
}

function sendIdentityOverlay(mp, store, playerId, range) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return { ok: false, message: 'Player not found.' }
  const payload = buildIdentityOverlay(mp, store, playerId, range)
  mp.sendCustomPacket(player.actorId, 'ff_identity_overlay', payload)
  return { ok: true, message: 'Nearby identities refreshed.', payload }
}

function init(mp, store, bus) {
  console.log('[identityOverlay] Initialized')
}

module.exports = { buildIdentityOverlay, sendIdentityOverlay, init }


/***/ },

/***/ "./interactionState.js"
/*!*****************************!*\
  !*** ./interactionState.js ***!
  \*****************************/
(module) {



function _packet(mp, player, type, payload) {
  if (player && player.actorId) mp.sendCustomPacket(player.actorId, type, payload)
}

function setSurrender(mp, store, bus, playerId, enabled) {
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }
  store.update(playerId, { isSurrendering: !!enabled })
  _packet(mp, player, 'ff_interaction_state', { playerId, isSurrendering: !!enabled })
  if (bus) bus.dispatch({ type: enabled ? 'playerSurrendered' : 'playerStoppedSurrendering', playerId })
  return { ok: true, message: enabled ? 'Hands raised.' : 'Hands lowered.' }
}

function cuffPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isSurrendering && !target.isDown && !target.isCaptive) {
    return { ok: false, message: 'Target must be surrendered, downed, or captive.' }
  }
  store.update(targetId, { isCuffed: true, cuffedBy: actorId, isSurrendering: false })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, isCuffed: true, cuffedBy: actorId })
  _packet(mp, actor, 'ff_interaction_state', { targetId, isCuffed: true })
  if (bus) bus.dispatch({ type: 'playerCuffed', actorId, targetId })
  return { ok: true, message: `${target.name} cuffed.` }
}

function uncuffPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed) return { ok: false, message: 'Target is not cuffed.' }
  store.update(targetId, { isCuffed: false, cuffedBy: null, escortedBy: null })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, isCuffed: false, escortedBy: null })
  _packet(mp, actor, 'ff_interaction_state', { targetId, isCuffed: false })
  if (bus) bus.dispatch({ type: 'playerUncuffed', actorId, targetId })
  return { ok: true, message: `${target.name} uncuffed.` }
}

function searchPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed && !target.isDown && !target.isSurrendering) {
    return { ok: false, message: 'Target must be cuffed, downed, or surrendered.' }
  }
  _packet(mp, actor, 'ff_search_result', { targetId, targetName: target.name })
  if (bus) bus.dispatch({ type: 'playerSearched', actorId, targetId })
  return { ok: true, message: `Searching ${target.name}.` }
}

function carryPlayer(mp, store, bus, actorId, targetId) {
  const actor = store.get(actorId)
  const target = store.get(targetId)
  if (!actor || !target) return { ok: false, message: 'Player not found.' }
  if (!target.isCuffed && !target.isDown) return { ok: false, message: 'Target must be cuffed or downed.' }
  store.update(targetId, { escortedBy: actorId })
  _packet(mp, target, 'ff_interaction_state', { playerId: targetId, escortedBy: actorId })
  _packet(mp, actor, 'ff_interaction_state', { targetId, escortedBy: actorId })
  if (bus) bus.dispatch({ type: 'playerEscorted', actorId, targetId })
  return { ok: true, message: `Escorting ${target.name}.` }
}

function init(mp, store, bus) {
  console.log('[interactionState] Initialized')
}

module.exports = { setSurrender, cuffPlayer, uncuffPlayer, searchPlayer, carryPlayer, init }


/***/ },

/***/ "./inventory.js"
/*!**********************!*\
  !*** ./inventory.js ***!
  \**********************/
(module) {



const GOLD_BASE_ID = 0x0000000F

function _getInv(mp, actorId) {
  const inv = mp.get(actorId, 'inv')
  return (inv && Array.isArray(inv.entries)) ? inv : { entries: [] }
}

function _setInv(mp, actorId, inv) {
  mp.set(actorId, 'inv', inv)
}

// ── Public API ────────────────────────────────────────────────────────────────

function getItemCount(mp, actorId, baseId) {
  const entry = _getInv(mp, actorId).entries.find(e => e.baseId === baseId)
  return entry ? entry.count : 0
}

function hasItem(mp, actorId, baseId, count) {
  return getItemCount(mp, actorId, baseId) >= (count || 1)
}

function addItem(mp, actorId, baseId, count) {
  const inv     = _getInv(mp, actorId)
  const entries = inv.entries.filter(e => e.baseId !== baseId)
  const current = inv.entries.find(e => e.baseId === baseId)
  const newCount = (current ? current.count : 0) + count
  if (newCount > 0) entries.push({ baseId, count: newCount })
  _setInv(mp, actorId, { entries })
}

function removeItem(mp, actorId, baseId, count) {
  const current = getItemCount(mp, actorId, baseId)
  if (current < count) return false
  const inv     = _getInv(mp, actorId)
  const entries = inv.entries.filter(e => e.baseId !== baseId)
  const newCount = current - count
  if (newCount > 0) entries.push({ baseId, count: newCount })
  _setInv(mp, actorId, { entries })
  return true
}

function transferItem(mp, fromActorId, toActorId, baseId, count) {
  if (!removeItem(mp, fromActorId, baseId, count)) return false
  addItem(mp, toActorId, baseId, count)
  return true
}

function getAll(mp, actorId) {
  return _getInv(mp, actorId).entries
}

module.exports = { getItemCount, hasItem, addItem, removeItem, transferItem, getAll, GOLD_BASE_ID }


/***/ },

/***/ "./locationUtils.js"
/*!**************************!*\
  !*** ./locationUtils.js ***!
  \**************************/
(module) {



function sqr(x) { return x * x }

function squareDist(pos1, pos2) {
  return sqr(pos1[0] - pos2[0]) + sqr(pos1[1] - pos2[1]) + sqr(pos1[2] - pos2[2])
}

module.exports = { sqr: sqr, squareDist: squareDist }


/***/ },

/***/ "./magic.js"
/*!******************!*\
  !*** ./magic.js ***!
  \******************/
(module, __unused_webpack_exports, __webpack_require__) {



const skills = __webpack_require__(/*! ./skills */ "./skills.js")
const papyrusBridge = __webpack_require__(/*! ./papyrusBridge */ "./papyrusBridge.js")

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOLS = ['destruction', 'restoration', 'alteration', 'illusion', 'conjuration']

const XP_ON_CAST = 3   // awarded when a known spell is cast (OnSpellCast Papyrus event)
const XP_ON_ROLL = 5   // awarded when /skill-dice magic [school] is rolled

const DETECT_LIFE_RANGE = 3000  // game units; verify against Skyrim scale

// ── Spell formId → school ─────────────────────────────────────────────────────
// Base-game spells only. Verify formIds against CK if discrepancies appear.
// Custom/modded spells will simply not grant XP from OnSpellCast.
const SPELL_SCHOOL = (function () {
  const map = new Map()
  const by_school = {
    destruction: [
      0x00012FD0, // Flames
      0x00012FD1, // Sparks
      0x00012FD2, // Frostbite
      0x0001C789, // Fireball
      0x0001CDEC, // Ice Spike
      0x0001CEDF, // Lightning Bolt
      0x0001C88B, // Chain Lightning
      0x000211EE, // Incinerate
      0x0007E8DC, // Icy Spear
      0x0007E8DD, // Thunderbolt
      0x0007E8DE, // Wall of Flames
      0x0007E8DF, // Wall of Frost
      0x0007E8E0, // Wall of Storms
      0x0002DD29, // Firestorm
      0x0002DD2B, // Blizzard
    ],
    restoration: [
      0x00012FD3, // Healing
      0x0003CDA6, // Fast Healing
      0x0003CDA7, // Close Wounds
      0x0003CDA8, // Grand Healing
      0x00012FD4, // Healing Hands
      0x0002F3B8, // Lesser Ward
      0x00042FAA, // Steadfast Ward
      0x0004E940, // Greater Ward
      0x000B62EF, // Turn Undead
      0x000B62F0, // Repel Undead
      0x000B62F1, // Expel Undead
      0x000A879D, // Bane of the Undead
    ],
    alteration: [
      0x00012FD5, // Oakflesh
      0x0005AD5C, // Stoneflesh
      0x0005AD5E, // Ironflesh
      0x0005AD5F, // Ebonyflesh
      0x0005AD60, // Dragonhide
      0x0001A4CC, // Candlelight
      0x00043324, // Magelight
      0x0001A4CD, // Detect Life
      0x0002ACD3, // Detect Dead
      0x00021143, // Waterbreathing
      0x0007E8E1, // Telekinesis
      0x000211F1, // Transmute Mineral Ore
      0x00045F96, // Paralysis (NPC only per server rules)
    ],
    illusion: [
      0x00021192, // Calm
      0x00021193, // Fear
      0x00021194, // Fury
      0x0002FF24, // Muffle
      0x00021195, // Invisibility
      0x000211AD, // Frenzy
      0x000211AE, // Rout
      0x000211AF, // Rally
      0x000211B1, // Courage
      0x0004DEED, // Pacify
      0x0004DEEE, // Harmony
      0x00031666, // Mayhem
      0x00031668, // Hysteria
      0x00021198, // Clairvoyance
    ],
    conjuration: [
      0x000204C3, // Conjure Familiar
      0x0001DAD4, // Conjure Flame Atronach
      0x0001DAD5, // Conjure Frost Atronach
      0x0001DAD6, // Conjure Storm Atronach
      0x000204BB, // Raise Zombie
      0x000B62DC, // Reanimate Corpse
      0x000B45F5, // Revenant
      0x000B45F6, // Dread Zombie
      0x000B45F7, // Dead Thrall
      0x00045F99, // Bound Sword
      0x00045F9A, // Bound Battleaxe
      0x00045F9B, // Bound Bow
      0x000204C4, // Banish Daedra
      0x000640B6, // Soul Trap
      0x000A26E0, // Conjure Dremora Lord
    ],
  }
  for (const [school, ids] of Object.entries(by_school)) {
    for (const id of ids) map.set(id, school)
  }
  return map
})()

// Detect Life / Detect Dead — Alteration, but trigger a special response
const DETECT_LIFE_SPELLS = new Set([0x0001A4CD, 0x0002ACD3])

// ── Helpers ───────────────────────────────────────────────────────────────────

function _findUserIdByActorId(store, actorId) {
  return (store.getAll().find(p => p.actorId === actorId) || {}).id || null
}

function _dist3d(a, b) {
  // mp.get(actorId, 'pos') may return [x,y,z] or {x,y,z} — handle both
  const [ax, ay, az] = Array.isArray(a) ? a : [a.x, a.y, a.z]
  const [bx, by, bz] = Array.isArray(b) ? b : [b.x, b.y, b.z]
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function _holdBroadcast(mp, store, userId, text) {
  const player = store.get(userId)
  if (!player) return
  const targets = store.getAll().filter(p => !player.holdId || p.holdId === player.holdId)
  for (const t of targets) mp.sendCustomPacket(t.actorId, 'chatMessage', { text })
}

// ── Detect Life ───────────────────────────────────────────────────────────────

function _handleDetectLife(mp, store, userId) {
  const caster = store.get(userId)
  if (!caster) return
  const casterPos = mp.get(caster.actorId, 'pos')
  if (!casterPos) return

  const nearby = store.getAll()
    .filter(p => {
      if (p.id === userId) return false
      const pos = mp.get(p.actorId, 'pos')
      return pos && _dist3d(casterPos, pos) <= DETECT_LIFE_RANGE
    })
    .map(p => ({ name: p.name }))

  mp.sendCustomPacket(caster.actorId, 'detectLifeResult', { nearby })
}

// ── /skill-dice handler ───────────────────────────────────────────────────────

function handleSkillDice(mp, store, bus, userId, args) {
  const action = (args[0] || '').toLowerCase()
  if (!action) return

  const player = store.get(userId)
  if (!player) return

  if (action === 'init') {
    const skillData = {}
    for (const school of SCHOOLS) {
      const xp    = skills.getSkillXp(mp, userId, school)
      const level = skills.getSkillLevel(xp)
      skillData[school] = { level }
    }
    // weapons/armor omitted — client reads equipped state from game engine directly
    mp.sendCustomPacket(player.actorId, 'skillDiceInit', {
      skills:  skillData,
      weapons: [],
      armor:   null,
    })
    return
  }

  if (action === 'wolf' || action === 'vampus') {
    const state   = args[1] === 'on'
    const formStr = action === 'wolf' ? 'werewolf' : 'vampire lord'
    const msg     = `★ ${player.name} ${state ? 'shifts into' : 'reverts from'} ${formStr} form`
    _holdBroadcast(mp, store, userId, msg)
    return
  }

  if (action === 'heal' || action === 'self-attack') {
    const hp  = parseInt(args[1]) || 0
    const msg = action === 'heal'
      ? `★ ${player.name} tends their wounds [HP: ${hp}/5]`
      : `★ ${player.name} takes a wound [HP: ${hp}/5]`
    _holdBroadcast(mp, store, userId, msg)
    return
  }

  // initiative, weapon, magic, defence
  const type  = args[1] || null
  const value = parseInt(args[2]) || 0
  const buff  = parseInt(args[3]) || 0

  const buffStr   = buff !== 0 ? ` (${buff > 0 ? '+' : ''}${buff})` : ''
  const label     = type ? `${type}` : action
  const msg       = `★ ${player.name} — ${label}: ${value}${buffStr}`
  _holdBroadcast(mp, store, userId, msg)

  if (action === 'magic' && SCHOOLS.includes(type)) {
    skills.addSkillXp(mp, store, userId, type, XP_ON_ROLL)
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[magic] Initializing')

  // Papyrus event — property assignment verified against ScampServerListener.cpp and
  // test_onPapyrusEvent_OnItemAdded.js. First arg is casterFormId (number); second arg
  // is the spell as { type, desc } — use mp.getIdFromDesc to get the numeric formId.
  papyrusBridge.registerEvent(mp, 'OnSpellCast', (casterActorId, spellArg) => {
    const userId = _findUserIdByActorId(store, casterActorId)
    if (!userId) return  // NPC cast — ignore

    const spellFormId = (spellArg && spellArg.desc) ? mp.getIdFromDesc(spellArg.desc) : null
    if (spellFormId === null) return

    if (DETECT_LIFE_SPELLS.has(spellFormId)) {
      _handleDetectLife(mp, store, userId)
    }

    const school = SPELL_SCHOOL.get(spellFormId)
    if (school) skills.addSkillXp(mp, store, userId, school, XP_ON_CAST)
  })

  // No mp.onHit — HitEvent.cpp does not exist in gamemode_events; there is no onHit
  // gamemode property. Destruction-on-hit XP would require onPapyrusEvent:OnHit with
  // a Papyrus script registered on affected actors — deferred.

  console.log('[magic] Started')
}

module.exports = { handleSkillDice, init, SCHOOLS, SPELL_SCHOOL, DETECT_LIFE_RANGE, XP_ON_CAST, XP_ON_ROLL }


/***/ },

/***/ "./medical.js"
/*!********************!*\
  !*** ./medical.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
const crafting = __webpack_require__(/*! ./crafting */ "./crafting.js")
const skills = __webpack_require__(/*! ./skills */ "./skills.js")

const TREATMENTS = {
  bandage: { itemBaseId: crafting.ITEMS.bandage, clears: ['bleeding'], xp: 20 },
}

function applyInjury(mp, store, bus, playerId, injury) {
  const player = store.get(playerId)
  if (!player) return { ok: false, message: 'Player not found.' }
  const injuries = Array.isArray(player.injuries) ? player.injuries.slice() : []
  const next = Object.assign({ type: 'wound', severity: 1, appliedAt: Date.now() }, injury || {})
  injuries.push(next)
  store.update(playerId, { injuries })
  mp.sendCustomPacket(player.actorId, 'ff_medical_state', { playerId, injuries })
  if (bus) bus.dispatch({ type: 'playerInjured', playerId, injury: next })
  return { ok: true, injury: next, injuries }
}

function treatPlayer(mp, store, bus, healerId, patientId, treatmentId) {
  const healer = store.get(healerId)
  const patient = store.get(patientId)
  const treatment = TREATMENTS[treatmentId]
  if (!healer || !patient) return { ok: false, message: 'Player not found.' }
  if (!treatment) return { ok: false, message: 'Unknown treatment.' }

  const currentInjuries = Array.isArray(patient.injuries) ? patient.injuries : []
  const injuries = currentInjuries.filter(injury => treatment.clears.indexOf(injury.type) === -1)
  if (injuries.length === currentInjuries.length) {
    return { ok: false, message: 'That treatment does not match any current injury.' }
  }

  if (!inv.removeItem(mp, healer.actorId, treatment.itemBaseId, 1)) {
    return { ok: false, message: 'You do not have the required treatment item.' }
  }

  store.update(patientId, { injuries })
  const xpGranted = skills.addSkillXp(mp, store, healerId, 'medicine', treatment.xp)
  mp.sendCustomPacket(patient.actorId, 'ff_medical_state', { playerId: patientId, injuries })
  if (healer.actorId !== patient.actorId) mp.sendCustomPacket(healer.actorId, 'ff_medical_treated', { patientId, treatmentId, xpGranted })
  if (bus) {
    if (xpGranted > 0) bus.dispatch({ type: 'skillXpGranted', playerId: healerId, skillId: 'medicine', xp: xpGranted, source: 'medical', patientId })
    bus.dispatch({ type: 'playerTreated', healerId, patientId, treatmentId })
  }
  return { ok: true, message: 'Treatment applied.', injuries, xpGranted }
}

function init(mp, store, bus) {
  console.log('[medical] Initialized')
}

module.exports = { TREATMENTS, applyInjury, treatPlayer, init }


/***/ },

/***/ "./modSourceRegistry.js"
/*!******************************!*\
  !*** ./modSourceRegistry.js ***!
  \******************************/
(module) {



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


/***/ },

/***/ "./nvfl.js"
/*!*****************!*\
  !*** ./nvfl.js ***!
  \*****************/
(module) {



var NVFL_WINDOW_MS = 24 * 60 * 60 * 1000

function isNvflRestricted(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || player.downedAt === null) return false
  return now - player.downedAt < NVFL_WINDOW_MS
}

function getNvflRemainingMs(store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player || player.downedAt === null) return 0
  var remaining = NVFL_WINDOW_MS - (now - player.downedAt)
  return Math.max(0, remaining)
}

function clearNvfl(store, playerId) {
  var player = store.get(playerId)
  if (!player) return false
  store.update(playerId, { downedAt: null })
  return true
}

module.exports = {
  isNvflRestricted, getNvflRemainingMs, clearNvfl,
}


/***/ },

/***/ "./packetUtils.js"
/*!************************!*\
  !*** ./packetUtils.js ***!
  \************************/
(module) {



const ACTOR_ID_MIN = 0xFF000000

function resolveCustomPacketTarget(store, targetId) {
  if (!targetId || typeof targetId !== 'number') {
    return { ok: false, reason: 'missing-target', userId: 0, wasActorId: false }
  }

  if (targetId >= ACTOR_ID_MIN) {
    const all = store && typeof store.getAll === 'function' ? store.getAll() : []
    for (let i = 0; i < all.length; i++) {
      if (all[i].actorId === targetId) {
        return { ok: true, userId: all[i].id, wasActorId: true }
      }
    }
    return { ok: false, reason: 'untracked-actor', userId: 0, wasActorId: true }
  }

  return { ok: true, userId: targetId, wasActorId: false }
}

module.exports = { ACTOR_ID_MIN, resolveCustomPacketTarget }


/***/ },

/***/ "./papyrusBridge.js"
/*!**************************!*\
  !*** ./papyrusBridge.js ***!
  \**************************/
(module) {



const REGISTRY = Symbol.for('frostfall.papyrusBridge.events')

function _registry(mp) {
  if (!mp[REGISTRY]) mp[REGISTRY] = []
  return mp[REGISTRY]
}

function registerEvent(mp, eventName, handler) {
  if (!eventName || typeof handler !== 'function') return false
  const key = `onPapyrusEvent:${eventName}`
  mp[key] = handler
  const events = _registry(mp)
  if (!events.includes(eventName)) events.push(eventName)
  return true
}

function getRegisteredEvents(mp) {
  return _registry(mp).slice()
}

function init(mp, store, bus) {
  console.log('[papyrusBridge] Initialized')
}

module.exports = { registerEvent, getRegisteredEvents, init }


/***/ },

/***/ "./parseChatMessage.js"
/*!*****************************!*\
  !*** ./parseChatMessage.js ***!
  \*****************************/
(module) {



var map = {
  '(': { double: true, close: ')', type: 'nonrp', color: '#91916D' },
  '*': { close: '*', type: 'action', color: '#CFAA6E' },
  '%': { close: '%', type: 'whisper', color: '#A062C9' },
  '\u2116': { close: '\u2116', type: 'shout', color: '#F78C8C', canBeNested: false },
}

function parseChatMessage(text) {
  var stack = []
  var texts = []
  var lastIndex = 0
  var currentType = []

  for (var i = 0; i < text.length; i++) {
    var char = text[i]
    if (char in map) {
      if (char === stack[stack.length - 1]) {
        stack.pop()
        texts.push({ text: text.slice(lastIndex, i), color: map[char].color, type: currentType.slice() })
        lastIndex = i
        currentType.pop()
      } else {
        if (map[char].double) {
          if (char !== text[i + 1]) continue
          i += 1
        }
        if (
          (map[char].canBeNested === false && (stack.length !== 0 || currentType.length !== 0)) ||
          text.lastIndexOf(map[char].close) === i
        ) continue

        var prevColor = currentType.length > 0 ? map[stack[0]].color : '#FFFFFF'
        stack.push(char)

        var tThis = 0
        var tPrev = 0
        if (stack[0] && map[stack[stack.length - 1]].double) tThis += 1
        if (stack[1] && map[stack[stack.length - 2]].double) tPrev += 1

        texts.push({
          text: text.slice(lastIndex + tThis + tPrev, i - tThis),
          color: prevColor,
          type: currentType.length > 0 ? currentType.slice() : ['plain'],
        })
        currentType.push(map[char].type)
        lastIndex = i
      }
    } else {
      var closing = Object.keys(map).find(function (k) { return map[k].close === char })
      if (closing && closing === stack[stack.length - 1]) {
        if (map[closing].double) {
          if (map[closing].close !== text[i + 1]) continue
          i += 1
        }
        stack.pop()
        texts.push({
          text: text.slice(lastIndex + 1, i - (map[closing].double ? 1 : 0)),
          color: map[closing].color,
          type: currentType.slice(),
        })
        currentType.pop()
        lastIndex = i + 1
      }
    }
  }

  texts.push({ type: ['plain'], text: text.slice(lastIndex), color: '#FFFFFF' })

  texts.forEach(function (msg) {
    msg.text = msg.text.replace(/\%|\№|\*|(\(\()|(\)\))/gi, '')
  })
  texts = texts.filter(function (msg) { return msg.text !== '' })

  var isNonRpOpened = false
  texts.forEach(function (msg, idx) {
    if (msg.type.indexOf('nonrp') !== -1) {
      var nextHasNonrp = texts[idx + 1] && texts[idx + 1].type.indexOf('nonrp') !== -1
      if (isNonRpOpened && (!nextHasNonrp || idx + 1 === texts.length)) {
        msg.text += '))'
        isNonRpOpened = false
      } else if (!isNonRpOpened && (idx + 1 === texts.length || !nextHasNonrp)) {
        msg.text = '((' + msg.text + '))'
      } else if (!isNonRpOpened) {
        msg.text = '((' + msg.text
        isNonRpOpened = true
      }
    }
  })

  return texts
}

module.exports = { parseChatMessage: parseChatMessage }


/***/ },

/***/ "./permissions.js"
/*!************************!*\
  !*** ./permissions.js ***!
  \************************/
(module) {



// ── Role Persistence ──────────────────────────────────────────────────────────
// Persists isStaff / isLeader across reconnects via mp.set on the actor.
// On connect: reads stored role and restores the booleans into the store.
// On /role set: writes to mp.set so it survives restarts.

const ROLE_KEY = 'ff_role'

function readStoredRole(mp, actorId) {
  try {
    const role = mp.get(actorId, ROLE_KEY)
    return ['player', 'leader', 'staff'].includes(role) ? role : null
  } catch (err) {
    return null
  }
}

function shouldBootstrapStaff(mp, userId) {
  if (userId !== 1) return false
  try {
    const settings = mp.getServerSettings()
    return settings && settings.offlineMode === true
  } catch (err) {
    return false
  }
}

function getRole(mp, actorId) {
  return readStoredRole(mp, actorId) || 'player'
}

function setRole(mp, store, bus, userId, role) {
  const player = store.get(userId)
  if (!player) return false
  if (!['player', 'leader', 'staff'].includes(role)) return false
  mp.set(player.actorId, ROLE_KEY, role)
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
  bus.dispatch({ type: 'roleChanged', targetId: userId, role })
  console.log(`[permissions] ${player.name} role set to ${role}`)
  return true
}

function onConnect(mp, store, bus, userId) {
  const player = store.get(userId)
  if (!player) return
  let role = readStoredRole(mp, player.actorId)
  if (!role) {
    role = shouldBootstrapStaff(mp, userId) ? 'staff' : 'player'
    mp.set(player.actorId, ROLE_KEY, role)
  }
  store.update(userId, {
    isStaff:  role === 'staff',
    isLeader: role === 'leader' || role === 'staff',
  })
}

function init(mp, store, bus) {
  console.log('[permissions] Initialized')
}

module.exports = { getRole, setRole, onConnect, init }


/***/ },

/***/ "./prison.js"
/*!*******************!*\
  !*** ./prison.js ***!
  \*******************/
(module, __unused_webpack_exports, __webpack_require__) {



const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

// ── Types ─────────────────────────────────────────────────────────────────────
// SentenceType: 'fine' | 'release' | 'banish'
// PrisonQueueEntry: { playerId, holdId, arrestedBy, queuedAt }

// ── State ─────────────────────────────────────────────────────────────────────
// In-memory queue, also persisted to world storage

let queue = []

// ── Accessors ─────────────────────────────────────────────────────────────────

function getQueue(mp, holdId) {
  if (holdId) return queue.filter(e => e.holdId === holdId)
  return queue.slice()
}

function isQueued(mp, playerId) {
  return queue.some(e => e.playerId === playerId)
}

// ── Actions ───────────────────────────────────────────────────────────────────

function queueForSentencing(mp, store, bus, playerId, holdId, arrestingOfficerId, notifyId) {
  if (isQueued(mp, playerId)) return false

  const entry = { playerId, holdId, arrestedBy: arrestingOfficerId, queuedAt: Date.now() }
  queue.push(entry)
  _persist(mp)

  const courier = __webpack_require__(/*! ./courier */ "./courier.js")
  const note = courier.createNotification(
    'prisonRequest', playerId, notifyId, holdId,
    { playerId, arrestedBy: arrestingOfficerId }
  )
  courier.sendNotification(mp, store, note)
  bus.dispatch({ type: 'playerArrested', playerId, holdId, arrestedBy: arrestingOfficerId })
  return true
}

function sentencePlayer(mp, store, bus, playerId, jarlId, sentence) {
  const entry = queue.find(e => e.playerId === playerId)
  if (!entry) return false

  const { holdId } = entry
  queue = queue.filter(e => e.playerId !== playerId)
  _persist(mp)

  const player = store.get(playerId)

  if (sentence.type === 'fine') {
    const fineAmount = Math.min(sentence.fineAmount || 0, player ? player.septims : 0)
    if (player && fineAmount > 0) {
      const newSeptims = player.septims - fineAmount
      store.update(playerId, { septims: newSeptims })
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
      mp.set(player.actorId, 'ff_bounty', [])
    }
  } else if (sentence.type === 'release') {
    if (player) {
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
    }
  } else if (sentence.type === 'banish') {
    if (player) {
      const newBounty = Object.assign({}, player.bounty, { [holdId]: 0 })
      store.update(playerId, { bounty: newBounty })
      mp.sendCustomPacket(player.actorId, 'playerBanished', { holdId })
    }
  }

  if (player) appendPrior(mp, player.actorId, { holdId, type: sentence.type, fineAmount: sentence.fineAmount || 0, sentencedAt: Date.now() })

  bus.dispatch({ type: 'playerSentenced', playerId, jarlId, holdId, sentence })
  return true
}

function getPriors(mp, actorId, holdId) {
  const all = mp.get(actorId, 'ff_priors') || []
  return holdId ? all.filter(p => p.holdId === holdId) : all
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _persist(mp) {
  worldStore.set('ff_prison_queue', queue)
}

function appendPrior(mp, actorId, record) {
  const existing = mp.get(actorId, 'ff_priors') || []
  existing.push(record)
  mp.set(actorId, 'ff_priors', existing)
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[prison] Initializing')

  const saved = worldStore.get('ff_prison_queue')
  if (Array.isArray(saved)) queue = saved

  console.log('[prison] Started')
}

module.exports = { getQueue, isQueued, queueForSentencing, sentencePlayer, getPriors, appendPrior, init }


/***/ },

/***/ "./production.js"
/*!***********************!*\
  !*** ./production.js ***!
  \***********************/
(module, __unused_webpack_exports, __webpack_require__) {



const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")
const skills = __webpack_require__(/*! ./skills */ "./skills.js")
const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

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


/***/ },

/***/ "./productionActivation.js"
/*!*********************************!*\
  !*** ./productionActivation.js ***!
  \*********************************/
(module, __unused_webpack_exports, __webpack_require__) {



const siteRecords = __webpack_require__(/*! ./data/production-sites.json */ "./data/production-sites.json")

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


/***/ },

/***/ "./pve.js"
/*!****************!*\
  !*** ./pve.js ***!
  \****************/
(module) {



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


/***/ },

/***/ "./refreshWidgets.js"
/*!***************************!*\
  !*** ./refreshWidgets.js ***!
  \***************************/
(module) {



var refreshWidgetsJs = 'window.skyrimPlatform.widgets.set((window.chat || []).concat(window.dialog || []));'

module.exports = { refreshWidgetsJs: refreshWidgetsJs }


/***/ },

/***/ "./reports.js"
/*!********************!*\
  !*** ./reports.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

const REPORTS_KEY = 'ff_staff_reports'

function loadReports() {
  const saved = worldStore.get(REPORTS_KEY)
  return Array.isArray(saved) ? saved : []
}

function saveReports(reports) {
  worldStore.set(REPORTS_KEY, reports)
}

function createReport(player, text, staffRecipients) {
  const reports = loadReports()
  const report = {
    id: `report_${Date.now()}_${player.id}`,
    at: Date.now(),
    playerId: player.id,
    actorId: player.actorId,
    name: player.name,
    text,
    status: 'open',
    staffRecipients: staffRecipients || [],
  }
  reports.push(report)
  saveReports(reports.slice(-100))
  return report
}

function listOpenReports(limit) {
  const reports = loadReports().filter(report => report.status === 'open')
  return reports.slice(-(limit || 10)).reverse()
}

module.exports = { createReport, listOpenReports }


/***/ },

/***/ "./roleplay.js"
/*!*********************!*\
  !*** ./roleplay.js ***!
  \*********************/
(module) {



const DESCRIPTION_MAX = 400

// raceId → display name (Skyrim base-game playable races)
const RACE_NAMES = {
  0x00013740: 'Argonian',
  0x00013741: 'Breton',
  0x00013742: 'Dunmer',
  0x00013743: 'Altmer',
  0x00013744: 'Imperial',
  0x00013745: 'Khajiit',
  0x00013746: 'Nord',
  0x00013747: 'Orsimer',
  0x00013748: 'Redguard',
  0x00013749: 'Bosmer',
}

// ── Description ───────────────────────────────────────────────────────────────

function setDescription(mp, actorId, text) {
  const trimmed = text.trim().slice(0, DESCRIPTION_MAX)
  mp.set(actorId, 'ff_description', trimmed)
  if (!mp.get(actorId, 'ff_characterReady')) {
    mp.set(actorId, 'ff_characterReady', true)
  }
  return trimmed
}

function getDescription(mp, actorId) {
  return mp.get(actorId, 'ff_description') || null
}

// ── Race ──────────────────────────────────────────────────────────────────────

function getRaceName(mp, actorId) {
  const appearance = mp.get(actorId, 'appearance')
  if (!appearance || !appearance.raceId) return 'Unknown'
  return RACE_NAMES[appearance.raceId] || 'Unknown'
}

// ── Race menu ─────────────────────────────────────────────────────────────────

function openRaceMenu(mp, actorId) {
  if (mp.get(actorId, 'ff_characterReady')) return false
  mp.setRaceMenuOpen(actorId, true)
  return true
}

function resetRaceMenu(mp, actorId) {
  mp.set(actorId, 'ff_characterReady', false)
  mp.setRaceMenuOpen(actorId, true)
}

// ── Examine ───────────────────────────────────────────────────────────────────

function examinePlayer(mp, store, examiningId, targetId, { bounty, prison }) {
  const examiner = store.get(examiningId)
  const target   = store.get(targetId)
  if (!examiner || !target) return null

  const packet = {
    name:        target.name,
    race:        getRaceName(mp, target.actorId),
    description: getDescription(mp, target.actorId) || '(No description set.)',
  }

  const canSeeWarrant = examiner.isLeader || examiner.isStaff
  if (canSeeWarrant && examiner.holdId) {
    const holdId       = examiner.holdId
    const activeBounty = bounty.getBounty(mp, store, targetId, holdId)
    const priors       = prison.getPriors(mp, target.actorId, holdId)

    if (activeBounty > 0 || priors.length > 0) {
      packet.warrant = {
        holdId,
        activeBounty,
        priors,
      }
    }
  }

  return packet
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[roleplay] Initialized')
}

module.exports = {
  setDescription, getDescription,
  getRaceName,
  openRaceMenu, resetRaceMenu,
  examinePlayer,
  init,
  DESCRIPTION_MAX,
}


/***/ },

/***/ "./shop.js"
/*!*****************!*\
  !*** ./shop.js ***!
  \*****************/
(module) {



const TAX_RATES = {
  propertySale: 1,
  playerShopSale: 0.05,
}

function calculateTax(amount, rate) {
  const numeric = parseInt(amount)
  if (!numeric || numeric <= 0) return 0
  return Math.floor(numeric * rate)
}

function recordShopSale(bus, { sellerId, buyerId, holdId, amount, itemBaseId, count, treasury }) {
  const tax = calculateTax(amount, TAX_RATES.playerShopSale)
  if (treasury && tax > 0) treasury.deposit(bus, holdId, tax)
  if (bus) {
    bus.dispatch({
      type: 'shopSaleRecorded',
      sellerId,
      buyerId,
      holdId,
      amount,
      itemBaseId,
      count,
      tax,
    })
  }
  return { ok: true, tax }
}

function init(mp, store, bus) {
  console.log('[shop] Initialized')
}

module.exports = { TAX_RATES, calculateTax, recordShopSale, init }


/***/ },

/***/ "./skillUi.js"
/*!********************!*\
  !*** ./skillUi.js ***!
  \********************/
(module, __unused_webpack_exports, __webpack_require__) {



const skills = __webpack_require__(/*! ./skills */ "./skills.js")

function buildSkillMenu(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return null
  const rows = skills.SKILL_IDS.map(skillId => {
    const xp = skills.getSkillXp(mp, playerId, skillId)
    const level = skills.getSkillLevel(xp)
    const cap = skills.getSkillCap(mp, store, playerId, skillId)
    return {
      id: skillId,
      name: skillId.charAt(0).toUpperCase() + skillId.slice(1),
      xp,
      cap,
      level,
      tierName: skills.TIER_NAMES[level] || 'novice',
      progress: skills.getSkillProgress(xp),
      capped: xp >= cap,
    }
  })
  return {
    customPacketType: 'ff_skill_menu',
    playerId: player.id,
    actorId: player.actorId,
    playerName: player.name,
    skills: rows,
  }
}

function sendSkillMenu(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return { ok: false, message: 'Player not found.' }
  const payload = buildSkillMenu(mp, store, playerId)
  mp.sendCustomPacket(player.actorId, 'ff_skill_menu', payload)
  return { ok: true, message: 'Skill menu opened.', payload }
}

function init(mp, store, bus) {
  console.log('[skillUi] Initialized')
}

module.exports = { buildSkillMenu, sendSkillMenu, init }


/***/ },

/***/ "./skills.js"
/*!*******************!*\
  !*** ./skills.js ***!
  \*******************/
(module, __unused_webpack_exports, __webpack_require__) {



// ── Skill tiers ───────────────────────────────────────────────────────────────
// Cumulative XP required to reach each tier.
// Designed so an actively playing magic character (~100 XP/h) hits tier 1 in
// ~24 hours; each subsequent tier doubles the required time from the previous.
//   Tier 0 → 1: 24h   (2,400 XP)
//   Tier 1 → 2: +48h  (total 72h  / 7,200 XP)
//   Tier 2 → 3: +96h  (total 168h / 16,800 XP)
//   Tier 3 → 4: +192h (total 360h / 36,000 XP)
//   Tier 4 → 5: +384h (total 744h / 72,000 XP)
//
// Study boosts (multipliers) halve time-to-next-tier at any tier, so a 2×
// boost from a master teacher scales correctly across the entire progression.
const TIER_XP = [0, 2400, 7200, 16800, 36000, 72000]
const TIER_NAMES = ['novice', 'apprentice', 'journeyman', 'adept', 'expert', 'master']

// Default cap: tier 1 (Apprentice) — independent practitioners reach this
// without faction membership. Faction rank unlocks tiers 2–4; tier 5 requires
// a master teacher event or equivalent IC attainment.
const DEFAULT_CAP_XP = TIER_XP[1]  // 2,400

const SKILL_IDS = [
  'destruction', 'restoration', 'alteration', 'conjuration', 'illusion',
  'smithing', 'enchanting', 'alchemy', 'tailoring', 'brewing', 'baking',
  'medicine', 'lockpicking', 'stealth', 'bardic', 'survival',
]

// Faction cap bonuses: { factionId, minRank, skills, cap }
const FACTION_CAPS = [
  { factionId: 'collegeOfWinterhold', minRank: 1, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[2] },
  { factionId: 'collegeOfWinterhold', minRank: 2, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[3] },
  { factionId: 'collegeOfWinterhold', minRank: 3, skills: ['destruction','restoration','alteration','conjuration','illusion'], cap: TIER_XP[4] },
  { factionId: 'companions',          minRank: 1, skills: ['smithing'],                        cap: TIER_XP[2] },
  { factionId: 'companions',          minRank: 2, skills: ['smithing'],                        cap: TIER_XP[3] },
  { factionId: 'companions',          minRank: 3, skills: ['smithing'],                        cap: TIER_XP[4] },
  { factionId: 'eastEmpireCompany',   minRank: 1, skills: ['smithing','enchanting','alchemy'], cap: TIER_XP[2] },
  { factionId: 'eastEmpireCompany',   minRank: 2, skills: ['smithing','enchanting','alchemy'], cap: TIER_XP[3] },
  { factionId: 'thievesGuild',        minRank: 1, skills: ['alchemy'],                        cap: TIER_XP[2] },
  { factionId: 'thievesGuild',        minRank: 2, skills: ['alchemy'],                        cap: TIER_XP[3] },
  { factionId: 'bardsCollege',        minRank: 1, skills: ['enchanting'],                     cap: TIER_XP[2] },
  { factionId: 'bardsCollege',        minRank: 2, skills: ['enchanting'],                     cap: TIER_XP[3] },
]

// ── In-memory session tracking ─────────────────────────────────────────────────
// userId → session start timestamp (wall clock)
const sessionStart = new Map()

// ── Pure helpers ──────────────────────────────────────────────────────────────

// Returns 0–5 (tier index, i.e. TIER_NAMES index). Used by dice system as a
// direct bonus: magicMastery = getSkillLevel(xp) + 1.
function getSkillLevel(xp) {
  for (let i = TIER_XP.length - 1; i >= 0; i--) {
    if (xp >= TIER_XP[i]) return i
  }
  return 0
}

// Progress within the current tier, 0.0–1.0. Useful for client progress bars.
function getSkillProgress(xp) {
  const tier = getSkillLevel(xp)
  if (tier >= TIER_XP.length - 1) return 1.0
  return (xp - TIER_XP[tier]) / (TIER_XP[tier + 1] - TIER_XP[tier])
}

function getSkillXp(mp, playerId, skillId) {
  const xpMap = mp.get(_actorForPlayer(mp, playerId), 'ff_skill_xp') || {}
  return xpMap[skillId] || 0
}

function getSkillCap(mp, store, playerId, skillId) {
  const factions = __webpack_require__(/*! ./factions */ "./factions.js")
  let cap = DEFAULT_CAP_XP
  for (const rule of FACTION_CAPS) {
    if (!rule.skills.includes(skillId)) continue
    const rank = factions.getPlayerFactionRank(mp, store, playerId, rule.factionId)
    if (rank !== null && rank >= rule.minRank && rule.cap > cap) {
      cap = rule.cap
    }
  }
  return cap
}

// ── Actions ───────────────────────────────────────────────────────────────────

function addSkillXp(mp, store, playerId, skillId, baseXp, now) {
  const player  = store.get(playerId)
  if (!player) return 0
  const cap     = getSkillCap(mp, store, playerId, skillId)
  const current = getSkillXp(mp, playerId, skillId)
  if (current >= cap) return 0

  // Apply any active study boost
  let multiplier = 1
  const boost = getActiveStudyBoost(mp, playerId, skillId, now)
  if (boost) multiplier = boost.multiplier

  const gain     = Math.round(baseXp * multiplier)
  const newXp    = Math.min(current + gain, cap)
  const actual   = newXp - current

  const xpMap = mp.get(player.actorId, 'ff_skill_xp') || {}
  xpMap[skillId] = newXp
  mp.set(player.actorId, 'ff_skill_xp', xpMap)
  return actual
}

function grantStudyBoost(mp, playerId, skillId, multiplier, onlineMs) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  boosts.push({ skillId, multiplier, remainingOnlineMs: onlineMs, sessionStart: Date.now() })
  mp.set(actorId, 'ff_study_boosts', boosts)
}

function getActiveStudyBoost(mp, playerId, skillId, now) {
  _consumeBoostTime(mp, playerId, now)
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  return boosts.find(b => b.skillId === skillId && b.remainingOnlineMs > 0) || null
}

function getStudyBoosts(mp, playerId) {
  const actorId = _actorForPlayer(mp, playerId)
  return mp.get(actorId, 'ff_study_boosts') || []
}

// ── Internal ──────────────────────────────────────────────────────────────────

// Drain elapsed online time from all boosts for this player
function _consumeBoostTime(mp, playerId, now) {
  const actorId = _actorForPlayer(mp, playerId)
  const boosts  = mp.get(actorId, 'ff_study_boosts') || []
  const start   = sessionStart.get(playerId)
  if (!start) return
  const elapsed = (now || Date.now()) - start
  const updated = boosts
    .map(b => Object.assign({}, b, { remainingOnlineMs: Math.max(0, b.remainingOnlineMs - elapsed) }))
    .filter(b => b.remainingOnlineMs > 0)
  sessionStart.set(playerId, now || Date.now())
  mp.set(actorId, 'ff_study_boosts', updated)
}

function onSkillPlayerDisconnect(mp, playerId, now) {
  _consumeBoostTime(mp, playerId, now)
  sessionStart.delete(playerId)
}

function _actorForPlayer(mp, playerId) {
  try { return mp.getUserActor(playerId) } catch { return null }
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[skills] Initializing')

  mp.makeProperty('ff_skill_xp', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty('ff_study_boosts', {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  console.log('[skills] Started')
}

function onConnect(mp, store, bus, userId) {
  sessionStart.set(userId, Date.now())
  const player = store.get(userId)
  if (!player) return
  const xpMap = mp.get(player.actorId, 'ff_skill_xp') || {}
  mp.sendCustomPacket(player.actorId, 'skillsSync', { xpMap })
}

module.exports = {
  SKILL_IDS, TIER_NAMES, getSkillLevel, getSkillProgress, getSkillXp, getSkillCap,
  addSkillXp, grantStudyBoost, getActiveStudyBoost, getStudyBoosts,
  onSkillPlayerDisconnect, onConnect,
  init,
}


/***/ },

/***/ "./store.js"
/*!******************!*\
  !*** ./store.js ***!
  \******************/
(module) {



function createDefaultState(id, actorId, name) {
  return {
    id,
    actorId,
    name,
    holdId: null,
    factions: [],
    bounty: {},
    isDown: false,
    isCaptive: false,
    downedAt: null,
    captiveAt: null,
    properties: [],
    hungerLevel: 10,
    drunkLevel: 0,
    septims: 0,
    stipendPaidHours: 0,
    minutesOnline: 0,
    isStaff: false,
    isLeader: false,
  }
}

const players = new Map()

function register(id, actorId, name) {
  const state = createDefaultState(id, actorId, name)
  players.set(id, state)
  return state
}

function deregister(id) {
  players.delete(id)
}

function get(id) {
  return players.get(id) || null
}

function getAll() {
  return Array.from(players.values())
}

function update(id, patch) {
  const current = players.get(id)
  if (!current) throw new Error('Player ' + id + ' not in store')
  const next = Object.assign({}, current, patch)
  players.set(id, next)
  return next
}

module.exports = { register, deregister, get, getAll, update }


/***/ },

/***/ "./training.js"
/*!*********************!*\
  !*** ./training.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



var TRAINING_BOOST_MULTIPLIER = 2.0
var TRAINING_BOOST_ONLINE_MS = 24 * 60 * 60 * 1000
var TRAINING_LOCATION_RADIUS = 500

var activeSessions = new Map()

function distance(a, b) {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z))
}

function startTraining(mp, store, bus, trainerId, skillId) {
  if (!store.get(trainerId)) return false
  if (activeSessions.has(trainerId)) return false

  activeSessions.set(trainerId, {
    trainerId: trainerId,
    skillId: skillId,
    startedAt: Date.now(),
    attendees: [],
  })

  bus.dispatch({ type: 'trainingStarted', trainerId: trainerId, skillId: skillId })
  return true
}

function joinTraining(mp, store, bus, playerId, trainerId) {
  if (!store.get(playerId)) return false
  var session = activeSessions.get(trainerId)
  if (!session) return false
  if (playerId === trainerId) return false
  if (session.attendees.indexOf(playerId) !== -1) return false

  var trainer = store.get(trainerId)
  var player = store.get(playerId)
  if (!trainer || !player) return false

  var trainerPos = mp.get(trainer.actorId, 'pos')
  var attendeePos = mp.get(player.actorId, 'pos')
  if (!trainerPos || !attendeePos) return false
  if (distance(trainerPos, attendeePos) > TRAINING_LOCATION_RADIUS) return false

  session.attendees.push(playerId)
  return true
}

function endTraining(mp, store, bus, trainerId) {
  var session = activeSessions.get(trainerId)
  if (!session) return false

  var skills = __webpack_require__(/*! ./skills */ "./skills.js")

  for (var i = 0; i < session.attendees.length; i++) {
    var attendeeId = session.attendees[i]
    skills.grantStudyBoost(mp, attendeeId, session.skillId, TRAINING_BOOST_MULTIPLIER, TRAINING_BOOST_ONLINE_MS)
  }

  bus.dispatch({
    type: 'trainingEnded',
    trainerId: trainerId,
    skillId: session.skillId,
    attendeeCount: session.attendees.length,
  })

  activeSessions.delete(trainerId)
  return true
}

function getActiveTraining(trainerId) {
  return activeSessions.get(trainerId) || null
}

function init(mp, store, bus) {
  // Sessions are in-memory only
}

function onConnect(mp, store, bus, userId) {
  // nothing to restore
}

module.exports = {
  startTraining, joinTraining, endTraining, getActiveTraining,
  init, onConnect,
}


/***/ },

/***/ "./transport.js"
/*!**********************!*\
  !*** ./transport.js ***!
  \**********************/
(module, __unused_webpack_exports, __webpack_require__) {



const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")
const inv = __webpack_require__(/*! ./inventory */ "./inventory.js")

const CARTS_KEY = 'ff_transport_carts'

const VEHICLE_FORMS = {
  horse:    { name: 'Horse', baseId: 0x00023AB2 },
  cart:     { name: 'Hand Cart', baseId: 0x0006EA46 },
  carriage: { name: 'Carriage', baseId: 0x00068D73 },
}

let carts = null
let persistEnabled = true

function _loadCarts() {
  if (carts) return carts
  const saved = worldStore.get(CARTS_KEY)
  carts = Array.isArray(saved) ? saved : []
  return carts
}

function _saveCarts() {
  if (!persistEnabled) return
  worldStore.set(CARTS_KEY, _loadCarts())
}

function _getCart(cartId) {
  return _loadCarts().find(cart => cart.id === cartId) || null
}

function _ownsCart(cart, playerId) {
  return cart.ownerId === playerId || cart.accessIds.includes(playerId)
}

function createCart(store, ownerId) {
  const owner = store.get(ownerId)
  if (!owner) return { ok: false, message: 'Player not found.' }

  const cart = {
    id: `cart_${Date.now()}_${ownerId}`,
    ownerId,
    accessIds: [],
    holdId: owner.holdId || null,
    inventory: [],
    createdAt: Date.now(),
  }
  _loadCarts().push(cart)
  _saveCarts()
  return { ok: true, message: `Created cart ${cart.id}. Alpha fallback: inventory transport only.`, cart }
}

function listCarts(playerId) {
  return _loadCarts().filter(cart => _ownsCart(cart, playerId))
}

function _getCartItem(cart, baseId) {
  return cart.inventory.find(entry => entry.baseId === baseId) || null
}

function loadCart(mp, store, playerId, cartId, baseId, count) {
  const player = store.get(playerId)
  const cart = _getCart(cartId)
  if (!player || !cart) return { ok: false, message: 'Cart not found.' }
  if (!_ownsCart(cart, playerId)) return { ok: false, message: 'You do not have access to that cart.' }
  if (!count || count <= 0) return { ok: false, message: 'Amount must be positive.' }
  if (!inv.removeItem(mp, player.actorId, baseId, count)) return { ok: false, message: 'You do not have enough of that item.' }

  const existing = _getCartItem(cart, baseId)
  if (existing) existing.count += count
  else cart.inventory.push({ baseId, count })
  _saveCarts()
  return { ok: true, message: `Loaded ${count} of ${baseId.toString(16)} into ${cart.id}.`, cart }
}

function unloadCart(mp, store, playerId, cartId, baseId, count) {
  const player = store.get(playerId)
  const cart = _getCart(cartId)
  if (!player || !cart) return { ok: false, message: 'Cart not found.' }
  if (!_ownsCart(cart, playerId)) return { ok: false, message: 'You do not have access to that cart.' }
  if (!count || count <= 0) return { ok: false, message: 'Amount must be positive.' }

  const existing = _getCartItem(cart, baseId)
  if (!existing || existing.count < count) return { ok: false, message: 'The cart does not have enough of that item.' }
  existing.count -= count
  if (existing.count === 0) cart.inventory = cart.inventory.filter(entry => entry.baseId !== baseId)
  inv.addItem(mp, player.actorId, baseId, count)
  _saveCarts()
  return { ok: true, message: `Unloaded ${count} of ${baseId.toString(16)} from ${cart.id}.`, cart }
}

function probeVehicle(mp, bus, type) {
  const vehicle = VEHICLE_FORMS[type]
  if (!vehicle) return { ok: false, message: 'Unknown vehicle type.' }
  let spawnApi = null
  let actorId = null
  if (typeof mp.createActor === 'function') {
    actorId = mp.createActor(vehicle.baseId, [0, 0, 0], 0, null)
    spawnApi = 'createActor'
  } else if (typeof mp.place === 'function') {
    actorId = mp.place(vehicle.baseId)
    spawnApi = 'place'
  }
  const result = {
    ok: !!actorId,
    message: actorId
      ? `Placed ${vehicle.name} probe ${actorId}. Rideable sync remains unverified; use cart inventory transport for alpha.`
      : `Could not place ${vehicle.name}; use cart inventory transport for alpha.`,
    type,
    actorId,
    spawnApi,
    rideableSync: 'unverified',
    alphaFallback: 'cartInventory',
  }
  if (bus) bus.dispatch({ type: 'transportProbe', vehicleType: type, actorId, spawnApi, rideableSync: result.rideableSync })
  return result
}

function resetForTests() {
  carts = []
  persistEnabled = false
}

function init(mp, store, bus) {
  _loadCarts()
  console.log('[transport] Initialized')
}

module.exports = {
  VEHICLE_FORMS,
  createCart,
  listCarts,
  loadCart,
  unloadCart,
  probeVehicle,
  resetForTests,
  init,
}


/***/ },

/***/ "./treasury.js"
/*!*********************!*\
  !*** ./treasury.js ***!
  \*********************/
(module, __unused_webpack_exports, __webpack_require__) {



const worldStore = __webpack_require__(/*! ./worldStore */ "./worldStore.js")

// ── Hold Treasury ─────────────────────────────────────────────────────────────
// Per-hold gold ledger. Persisted to world/ff-world-data.json via worldStore.
// Sources: shop taxes, property purchases, sentencing fines.
// Withdrawals: Jarl / Steward via /treasury withdraw.

const ALL_HOLDS = [
  'whiterun', 'eastmarch', 'rift', 'reach', 'haafingar',
  'pale', 'falkreath', 'hjaalmarch', 'winterhold',
]

const TREASURY_KEY = 'ff_treasury'
let persistEnabled = true
let testData = null

function _load() {
  if (testData) return testData
  const saved = worldStore.get(TREASURY_KEY)
  const data  = (saved && typeof saved === 'object') ? saved : {}
  // Ensure every hold has an entry
  for (const h of ALL_HOLDS) {
    if (typeof data[h] !== 'number') data[h] = 0
  }
  return data
}

function _save(data) {
  if (!persistEnabled) return
  worldStore.set(TREASURY_KEY, data)
}

// ── Public API ────────────────────────────────────────────────────────────────

function getBalance(holdId) {
  return _load()[holdId] || 0
}

function getAllBalances() {
  return _load()
}

function deposit(bus, holdId, amount) {
  const data    = _load()
  data[holdId]  = (data[holdId] || 0) + amount
  _save(data)
  if (bus) bus.dispatch({ type: 'treasuryChanged', holdId, delta: amount, newBalance: data[holdId] })
  console.log(`[treasury] ${holdId} +${amount} → ${data[holdId]}`)
}

function withdraw(bus, holdId, amount) {
  const data = _load()
  if ((data[holdId] || 0) < amount) return false
  data[holdId] -= amount
  _save(data)
  if (bus) bus.dispatch({ type: 'treasuryChanged', holdId, delta: -amount, newBalance: data[holdId] })
  console.log(`[treasury] ${holdId} -${amount} → ${data[holdId]}`)
  return true
}

function init(mp, store, bus) {
  console.log('[treasury] Initialized')
}

function resetForTests() {
  persistEnabled = false
  testData = {}
  for (const h of ALL_HOLDS) testData[h] = 0
}

module.exports = { getBalance, getAllBalances, deposit, withdraw, resetForTests, ALL_HOLDS, init }


/***/ },

/***/ "./worldStore.js"
/*!***********************!*\
  !*** ./worldStore.js ***!
  \***********************/
(module, __unused_webpack_exports, __webpack_require__) {



const fs = __webpack_require__(/*! fs */ "fs")
const path = __webpack_require__(/*! path */ "path")

const FILE = path.join(__dirname, '..', 'world', 'ff-world-data.json')

let _cache = null

function _load() {
  if (_cache) return _cache
  try {
    _cache = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    _cache = {}
  }
  return _cache
}

function _save() {
  try {
    const dir = path.dirname(FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(_cache, null, 2))
  } catch (err) {
    console.error('[worldStore] Failed to save world data:', err?.message ?? err)
  }
}

function get(key) {
  const data = _load()
  return data[key] !== undefined ? data[key] : null
}

function set(key, value) {
  _load()
  _cache[key] = value
  _save()
}

module.exports = { get, set }


/***/ },

/***/ "./data/esp-asset-pack.json"
/*!**********************************!*\
  !*** ./data/esp-asset-pack.json ***!
  \**********************************/
(module) {

module.exports = /*#__PURE__*/JSON.parse('{"plugin":"FrostfallProduction.esp","packageName":"Frostfall Roleplay Asset Pack","records":[{"family":"productionActivator","editorId":"FFRP_Activator_ProductionMarker","localFormId":"0x800","type":"ACTI","purpose":"Generic server-validated production activation marker."},{"family":"pinboard","editorId":"FFRP_Activator_PinboardWhiterun","localFormId":"0x801","type":"ACTI","purpose":"Physical hold pinboard that opens server-owned posts."},{"family":"loom","editorId":"FFRP_Furniture_Loom","localFormId":"0x802","type":"FURN","purpose":"Tailoring station for cloth and clothing production."},{"family":"mail","editorId":"FFRP_Activator_RavenPost","localFormId":"0x803","type":"ACTI","purpose":"Mail/courier pickup point for delayed IC correspondence."},{"family":"lock","editorId":"FFRP_Lock_ServerBound","localFormId":"0x804","type":"KEYM","purpose":"Server-bound lock/key anchor for custom lockpicking and keys."},{"family":"book","editorId":"FFRP_Book_ServerText","localFormId":"0x805","type":"BOOK","purpose":"Book shell whose text is selected from server-indexed authored content."},{"family":"medical","editorId":"FFRP_Furniture_MedicalBed","localFormId":"0x806","type":"FURN","purpose":"Medical treatment/recovery station for server-owned injuries."}],"papyrusScripts":[{"name":"FFRP_ActivationReporter","role":"Reports activation local FormID, base FormID, cell, and actor to the SkyrimPlatform bridge."},{"name":"FFRP_BlockVanillaActivation","role":"Blocks vanilla reward paths where the server must validate output."}]}');

/***/ },

/***/ "./data/production-sites.json"
/*!************************************!*\
  !*** ./data/production-sites.json ***!
  \************************************/
(module) {

module.exports = /*#__PURE__*/JSON.parse('[{"siteId":"whiterun_halted_stream_iron","activationKind":"mine","baseFormIds":[466163],"targetFormIds":[],"holdId":"whiterun"},{"siteId":"whiterun_riverwood_lumber","activationKind":"mill","baseFormIds":[456006],"targetFormIds":[],"holdId":"whiterun"},{"siteId":"whiterun_pelagia_wheat","activationKind":"farm","baseFormIds":[307386],"targetFormIds":[],"holdId":"whiterun"}]');

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		if (!(moduleId in __webpack_modules__)) {
/******/ 			delete __webpack_module_cache__[moduleId];
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!******************!*\
  !*** ./index.js ***!
  \******************/


const store    = __webpack_require__(/*! ./store */ "./store.js")
const bus      = __webpack_require__(/*! ./bus */ "./bus.js")
const hunger   = __webpack_require__(/*! ./hunger */ "./hunger.js")
const drunkBar = __webpack_require__(/*! ./drunkBar */ "./drunkBar.js")
const economy  = __webpack_require__(/*! ./economy */ "./economy.js")
const courier  = __webpack_require__(/*! ./courier */ "./courier.js")
const housing  = __webpack_require__(/*! ./housing */ "./housing.js")
const bounty   = __webpack_require__(/*! ./bounty */ "./bounty.js")
const combat   = __webpack_require__(/*! ./combat */ "./combat.js")
const captivity = __webpack_require__(/*! ./captivity */ "./captivity.js")
const medical   = __webpack_require__(/*! ./medical */ "./medical.js")
const interactionState = __webpack_require__(/*! ./interactionState */ "./interactionState.js")
const prison   = __webpack_require__(/*! ./prison */ "./prison.js")
const factions = __webpack_require__(/*! ./factions */ "./factions.js")
const college  = __webpack_require__(/*! ./college */ "./college.js")
const skills   = __webpack_require__(/*! ./skills */ "./skills.js")
const training  = __webpack_require__(/*! ./training */ "./training.js")
const treasury  = __webpack_require__(/*! ./treasury */ "./treasury.js")
const production = __webpack_require__(/*! ./production */ "./production.js")
const shop       = __webpack_require__(/*! ./shop */ "./shop.js")
const productionActivation = __webpack_require__(/*! ./productionActivation */ "./productionActivation.js")
const skillUi    = __webpack_require__(/*! ./skillUi */ "./skillUi.js")
const identityOverlay = __webpack_require__(/*! ./identityOverlay */ "./identityOverlay.js")
const pve       = __webpack_require__(/*! ./pve */ "./pve.js")
const transport = __webpack_require__(/*! ./transport */ "./transport.js")
const roleplay  = __webpack_require__(/*! ./roleplay */ "./roleplay.js")
const nvfl      = __webpack_require__(/*! ./nvfl */ "./nvfl.js")
const inventory = __webpack_require__(/*! ./inventory */ "./inventory.js")
const magic     = __webpack_require__(/*! ./magic */ "./magic.js")
const papyrusBridge = __webpack_require__(/*! ./papyrusBridge */ "./papyrusBridge.js")
const alphaSpikes = __webpack_require__(/*! ./alphaSpikes */ "./alphaSpikes.js")
const espAssetRegistry = __webpack_require__(/*! ./espAssetRegistry */ "./espAssetRegistry.js")
const engineProbes = __webpack_require__(/*! ./engineProbes */ "./engineProbes.js")
const modSourceRegistry = __webpack_require__(/*! ./modSourceRegistry */ "./modSourceRegistry.js")
const commands  = __webpack_require__(/*! ./commands */ "./commands.js")
const hudSync   = __webpack_require__(/*! ./hudSync */ "./hudSync.js")
const chat        = __webpack_require__(/*! ./chat */ "./chat.js")
const cp          = __webpack_require__(/*! ./chatProperty */ "./chatProperty.js")
const ep          = __webpack_require__(/*! ./evalProperty */ "./evalProperty.js")
const bp          = __webpack_require__(/*! ./browserProperty */ "./browserProperty.js")
const dp          = __webpack_require__(/*! ./dialogProperty */ "./dialogProperty.js")
const hudMenu       = __webpack_require__(/*! ./hudMenu */ "./hudMenu.js")
const permissions   = __webpack_require__(/*! ./permissions */ "./permissions.js")
const packetUtils   = __webpack_require__(/*! ./packetUtils */ "./packetUtils.js")

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

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=gamemode.js.map
// skymp:sig:y:frostfall:eE9AG4YM4Yyvq8xQgYC+tblk6s/iQZxNf4MkN5yfZ4XnAGuAM1GRLYt0VCfbrwu9iQNQKL67GNqXjjG4CPUqBg==
