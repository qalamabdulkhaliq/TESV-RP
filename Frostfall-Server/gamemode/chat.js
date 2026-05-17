'use strict'

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
