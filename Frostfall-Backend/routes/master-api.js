'use strict'

/**
 * Master API — called by the SkyMP game server (not the client directly).
 *
 * Mounted twice in server.js:
 *   app.use('/auth',        masterApiRoute)  → POST /auth/session
 *   app.use('/api/servers', masterApiRoute)  → GET/POST /api/servers/:key/…
 *
 * Endpoints:
 *
 *   POST /auth/session
 *     Body:    { discordUser: { id, username } }
 *     Returns: { profileId, session }
 *     Launcher calls this after Discord login to get a stable profileId and
 *     a session token that the game client passes to the game server.
 *
 *   GET /api/servers/:key/sessions/:session
 *     Called by the game server to validate a session token.
 *     Returns: { user: { id, discordId, username } }
 *
 *   GET /api/servers/:key/sessions/:session/balance
 *     Called by the game server to fetch a player's coin balance.
 *     Returns: { user: { id, balance } }
 *
 *   POST /api/servers/:key/sessions/:session/purchase
 *     Called by the game server (with X-Auth-Token) to spend a player's coins.
 *     Body:    { balanceToSpend: number }
 *     Returns: { balanceSpent: number, success: boolean }
 *
 *   GET /api/servers/:key/profiles/:profileId/check
 *     Called by the game server in offline mode to verify a profileId is allowed.
 *     Applies the same lock / whitelist rules as session validation.
 *     Returns: { allowed: true }  or  403/404 with { error }
 */

const router = require('express').Router()
const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')
const config = require('../config')

// ── Persistent Discord → profileId mapping ────────────────────────────────────

const PROFILES_PATH = path.join(__dirname, '..', 'data', 'profiles.json')

function loadProfiles() {
  try { return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8')) }
  catch { return { nextId: 1, map: {} } }
}

function saveProfiles(data) {
  fs.writeFileSync(PROFILES_PATH, JSON.stringify(data, null, 2) + '\n')
}

function getOrCreateProfileId(discordId) {
  const data = loadProfiles()
  if (!data.map[discordId]) {
    data.map[discordId] = data.nextId++
    saveProfiles(data)
  }
  return data.map[discordId]
}

function getDiscordIdByProfileId(profileId) {
  const data = loadProfiles()
  const entry = Object.entries(data.map).find(([, id]) => id === profileId)
  return entry ? entry[0] : null
}

// ── Persistent balance store — profileId → coin balance ──────────────────────

const BALANCES_PATH = path.join(__dirname, '..', 'data', 'balances.json')

function loadBalances() {
  try { return JSON.parse(fs.readFileSync(BALANCES_PATH, 'utf8')) }
  catch { return {} }
}

function saveBalances(data) {
  try { fs.writeFileSync(BALANCES_PATH, JSON.stringify(data, null, 2) + '\n') }
  catch (e) { console.error('Failed to persist balances:', e) }
}

function getBalance(profileId) {
  const data = loadBalances()
  return typeof data[profileId] === 'number' ? data[profileId] : 0
}

function setBalance(profileId, balance) {
  const data = loadBalances()
  data[profileId] = balance
  saveBalances(data)
}

// ── Persistent whitelist — Discord IDs allowed when server is unlocked ────────

const WHITELIST_PATH = path.join(__dirname, '..', 'data', 'whitelist.json')

function loadWhitelist() {
  try { return JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf8')) }
  catch { return [] }
}

// ── In-memory session store — used for online-mode validation only ────────────

const sessions      = new Map()
const SESSION_TTL   = 24 * 60 * 60 * 1000  // 24 h
const SESSIONS_PATH = path.join(__dirname, '..', 'data', 'sessions.json')

function pruneExpired() {
  const now = Date.now()
  for (const [token, s] of sessions)
    if (s.expiresAt < now) sessions.delete(token)
}

function saveSessions() {
  const now     = Date.now()
  const entries = [...sessions.entries()].filter(([, s]) => s.expiresAt > now)
  try { fs.writeFileSync(SESSIONS_PATH, JSON.stringify(entries, null, 2) + '\n') }
  catch (e) { console.error('Failed to persist sessions:', e) }
}

function loadSessions() {
  try {
    const entries = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'))
    const now     = Date.now()
    for (const [token, s] of entries)
      if (s.expiresAt > now) sessions.set(token, s)
    console.log(`Loaded ${sessions.size} active session(s) from disk`)
  } catch { /* first run or file absent — start fresh */ }
}

loadSessions()

// ── Helper — look up a session entry (exported for serverinfo route) ──────────

function lookupSession(token) {
  pruneExpired()
  return sessions.get(token) || null
}

// ── Helper — validate server master key ──────────────────────────────────────

function checkKey(req, res) {
  if (req.params.key !== config.serverMasterKey) {
    res.status(403).json({ error: 'Invalid master key.' })
    return false
  }
  return true
}

// ── Session creation helper (used by POST /auth/session and discord-auth callback) ─

function createSession(discordUser) {
  pruneExpired()
  const profileId = getOrCreateProfileId(discordUser.id)
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, {
    profileId,
    discordId: discordUser.id,
    username:  discordUser.username || '',
    expiresAt: Date.now() + SESSION_TTL,
  })
  saveSessions()
  return { profileId, session: token }
}

// ── POST /auth/session ────────────────────────────────────────────────────────

router.post('/session', (req, res) => {
  const { discordUser } = req.body || {}
  if (!discordUser || !discordUser.id)
    return res.status(400).json({ error: 'Missing discordUser.id' })

  const result = createSession(discordUser)
  res.json(result)
})

// ── GET /api/servers/:key/sessions/:session ───────────────────────────────────

router.get('/:key/sessions/:session', (req, res) => {
  if (!checkKey(req, res)) return

  pruneExpired()
  const entry = sessions.get(req.params.session)
  if (!entry)
    return res.status(404).json({ error: 'Session not found or expired.' })

  if (config.serverLocked) {
    if (!config.serverLockedAllowList.includes(entry.discordId))
      return res.status(403).json({ error: 'serverLocked' })
  } else {
    const whitelist = loadWhitelist()
    if (whitelist.length > 0 && !whitelist.includes(entry.discordId))
      return res.status(403).json({ error: 'notWhitelisted' })
  }

  res.json({
    user: {
      id:        entry.profileId,
      discordId: entry.discordId,
      username:  entry.username,
    },
  })
})

// ── GET /api/servers/:key/profiles/:profileId/check ──────────────────────────
// Used by the game server in offline mode to verify a profileId is allowed.

router.get('/:key/profiles/:profileId/check', (req, res) => {
  if (!checkKey(req, res)) return

  const profileId = parseInt(req.params.profileId, 10)
  if (isNaN(profileId))
    return res.status(400).json({ error: 'Invalid profileId.' })

  const discordId = getDiscordIdByProfileId(profileId)
  if (!discordId)
    return res.status(404).json({ error: 'profileNotFound' })

  if (config.serverLocked) {
    if (!config.serverLockedAllowList.includes(discordId))
      return res.status(403).json({ error: 'serverLocked' })
  } else {
    const whitelist = loadWhitelist()
    if (whitelist.length > 0 && !whitelist.includes(discordId))
      return res.status(403).json({ error: 'notWhitelisted' })
  }

  res.json({ allowed: true })
})

// ── GET /api/servers/:key/sessions/:session/balance ───────────────────────────

router.get('/:key/sessions/:session/balance', (req, res) => {
  if (!checkKey(req, res)) return

  pruneExpired()
  const entry = sessions.get(req.params.session)
  if (!entry)
    return res.status(404).json({ error: 'Session not found or expired.' })

  const balance = getBalance(entry.profileId)
  res.json({ user: { id: entry.profileId, balance } })
})

// ── POST /api/servers/:key/sessions/:session/purchase ────────────────────────

router.post('/:key/sessions/:session/purchase', (req, res) => {
  if (!checkKey(req, res)) return

  const authToken = req.headers['x-auth-token']
  if (!authToken || authToken !== config.masterApiAuthToken)
    return res.status(403).json({ error: 'Invalid auth token.' })

  pruneExpired()
  const entry = sessions.get(req.params.session)
  if (!entry)
    return res.status(404).json({ error: 'Session not found or expired.' })

  const { balanceToSpend } = req.body || {}
  if (typeof balanceToSpend !== 'number' || balanceToSpend < 0)
    return res.status(400).json({ error: 'balanceToSpend must be a non-negative number.' })

  const current = getBalance(entry.profileId)
  if (current < balanceToSpend)
    return res.json({ balanceSpent: 0, success: false })

  setBalance(entry.profileId, current - balanceToSpend)
  res.json({ balanceSpent: balanceToSpend, success: true })
})

module.exports = router
module.exports.lookupSession  = lookupSession
module.exports.loadWhitelist  = loadWhitelist
module.exports.createSession  = createSession
