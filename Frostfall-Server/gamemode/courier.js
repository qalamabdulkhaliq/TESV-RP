'use strict'

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
