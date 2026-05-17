'use strict'

const fs = require('fs')
const path = require('path')

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
