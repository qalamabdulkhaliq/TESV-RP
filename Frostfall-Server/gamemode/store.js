'use strict'

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
