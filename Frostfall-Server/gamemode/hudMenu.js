'use strict'

const fi = require('./functionInfo')
const sk = require('./skills')
const fa = require('./factions')

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
