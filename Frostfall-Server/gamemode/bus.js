'use strict'

const listeners = new Map()

function on(type, handler) {
  if (!listeners.has(type)) {
    listeners.set(type, new Set())
  }
  listeners.get(type).add(handler)
}

function off(type, handler) {
  const set = listeners.get(type)
  if (set) set.delete(handler)
}

function dispatch(event) {
  const handlers = listeners.get(event.type)
  if (!handlers) return
  for (const handler of handlers) {
    handler(event)
  }
}

module.exports = { on, off, dispatch }
