'use strict'

const inv  = require('./inventory')

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
