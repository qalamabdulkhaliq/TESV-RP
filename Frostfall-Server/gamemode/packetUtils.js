'use strict'

const ACTOR_ID_MIN = 0xFF000000

function resolveCustomPacketTarget(store, targetId) {
  if (!targetId || typeof targetId !== 'number') {
    return { ok: false, reason: 'missing-target', userId: 0, wasActorId: false }
  }

  if (targetId >= ACTOR_ID_MIN) {
    const all = store && typeof store.getAll === 'function' ? store.getAll() : []
    for (let i = 0; i < all.length; i++) {
      if (all[i].actorId === targetId) {
        return { ok: true, userId: all[i].id, wasActorId: true }
      }
    }
    return { ok: false, reason: 'untracked-actor', userId: 0, wasActorId: true }
  }

  return { ok: true, userId: targetId, wasActorId: false }
}

module.exports = { ACTOR_ID_MIN, resolveCustomPacketTarget }
