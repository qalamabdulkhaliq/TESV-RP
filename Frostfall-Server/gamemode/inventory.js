'use strict'

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
