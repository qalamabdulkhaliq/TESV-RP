'use strict'

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
