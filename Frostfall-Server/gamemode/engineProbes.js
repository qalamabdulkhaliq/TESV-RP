'use strict'

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
