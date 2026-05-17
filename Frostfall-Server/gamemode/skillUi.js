'use strict'

const skills = require('./skills')

function buildSkillMenu(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player) return null
  const rows = skills.SKILL_IDS.map(skillId => {
    const xp = skills.getSkillXp(mp, playerId, skillId)
    const level = skills.getSkillLevel(xp)
    const cap = skills.getSkillCap(mp, store, playerId, skillId)
    return {
      id: skillId,
      name: skillId.charAt(0).toUpperCase() + skillId.slice(1),
      xp,
      cap,
      level,
      tierName: skills.TIER_NAMES[level] || 'novice',
      progress: skills.getSkillProgress(xp),
      capped: xp >= cap,
    }
  })
  return {
    customPacketType: 'ff_skill_menu',
    playerId: player.id,
    actorId: player.actorId,
    playerName: player.name,
    skills: rows,
  }
}

function sendSkillMenu(mp, store, playerId) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return { ok: false, message: 'Player not found.' }
  const payload = buildSkillMenu(mp, store, playerId)
  mp.sendCustomPacket(player.actorId, 'ff_skill_menu', payload)
  return { ok: true, message: 'Skill menu opened.', payload }
}

function init(mp, store, bus) {
  console.log('[skillUi] Initialized')
}

module.exports = { buildSkillMenu, sendSkillMenu, init }
