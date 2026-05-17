'use strict'

const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'world', 'ff-world-data.json')

let _cache = null

function _load() {
  if (_cache) return _cache
  try {
    _cache = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    _cache = {}
  }
  return _cache
}

function _save() {
  try {
    const dir = path.dirname(FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(_cache, null, 2))
  } catch (err) {
    console.error('[worldStore] Failed to save world data:', err?.message ?? err)
  }
}

function get(key) {
  const data = _load()
  return data[key] !== undefined ? data[key] : null
}

function set(key, value) {
  _load()
  _cache[key] = value
  _save()
}

module.exports = { get, set }
