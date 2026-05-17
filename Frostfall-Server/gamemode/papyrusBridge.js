'use strict'

const REGISTRY = Symbol.for('frostfall.papyrusBridge.events')

function _registry(mp) {
  if (!mp[REGISTRY]) mp[REGISTRY] = []
  return mp[REGISTRY]
}

function registerEvent(mp, eventName, handler) {
  if (!eventName || typeof handler !== 'function') return false
  const key = `onPapyrusEvent:${eventName}`
  mp[key] = handler
  const events = _registry(mp)
  if (!events.includes(eventName)) events.push(eventName)
  return true
}

function getRegisteredEvents(mp) {
  return _registry(mp).slice()
}

function init(mp, store, bus) {
  console.log('[papyrusBridge] Initialized')
}

module.exports = { registerEvent, getRegisteredEvents, init }
