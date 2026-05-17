'use strict'

const fs = require('fs')
const path = require('path')

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
