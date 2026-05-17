'use strict'

const skills = require('./skills')
const papyrusBridge = require('./papyrusBridge')

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOLS = ['destruction', 'restoration', 'alteration', 'illusion', 'conjuration']

const XP_ON_CAST = 3   // awarded when a known spell is cast (OnSpellCast Papyrus event)
const XP_ON_ROLL = 5   // awarded when /skill-dice magic [school] is rolled

const DETECT_LIFE_RANGE = 3000  // game units; verify against Skyrim scale

// ── Spell formId → school ─────────────────────────────────────────────────────
// Base-game spells only. Verify formIds against CK if discrepancies appear.
// Custom/modded spells will simply not grant XP from OnSpellCast.
const SPELL_SCHOOL = (function () {
  const map = new Map()
  const by_school = {
    destruction: [
      0x00012FD0, // Flames
      0x00012FD1, // Sparks
      0x00012FD2, // Frostbite
      0x0001C789, // Fireball
      0x0001CDEC, // Ice Spike
      0x0001CEDF, // Lightning Bolt
      0x0001C88B, // Chain Lightning
      0x000211EE, // Incinerate
      0x0007E8DC, // Icy Spear
      0x0007E8DD, // Thunderbolt
      0x0007E8DE, // Wall of Flames
      0x0007E8DF, // Wall of Frost
      0x0007E8E0, // Wall of Storms
      0x0002DD29, // Firestorm
      0x0002DD2B, // Blizzard
    ],
    restoration: [
      0x00012FD3, // Healing
      0x0003CDA6, // Fast Healing
      0x0003CDA7, // Close Wounds
      0x0003CDA8, // Grand Healing
      0x00012FD4, // Healing Hands
      0x0002F3B8, // Lesser Ward
      0x00042FAA, // Steadfast Ward
      0x0004E940, // Greater Ward
      0x000B62EF, // Turn Undead
      0x000B62F0, // Repel Undead
      0x000B62F1, // Expel Undead
      0x000A879D, // Bane of the Undead
    ],
    alteration: [
      0x00012FD5, // Oakflesh
      0x0005AD5C, // Stoneflesh
      0x0005AD5E, // Ironflesh
      0x0005AD5F, // Ebonyflesh
      0x0005AD60, // Dragonhide
      0x0001A4CC, // Candlelight
      0x00043324, // Magelight
      0x0001A4CD, // Detect Life
      0x0002ACD3, // Detect Dead
      0x00021143, // Waterbreathing
      0x0007E8E1, // Telekinesis
      0x000211F1, // Transmute Mineral Ore
      0x00045F96, // Paralysis (NPC only per server rules)
    ],
    illusion: [
      0x00021192, // Calm
      0x00021193, // Fear
      0x00021194, // Fury
      0x0002FF24, // Muffle
      0x00021195, // Invisibility
      0x000211AD, // Frenzy
      0x000211AE, // Rout
      0x000211AF, // Rally
      0x000211B1, // Courage
      0x0004DEED, // Pacify
      0x0004DEEE, // Harmony
      0x00031666, // Mayhem
      0x00031668, // Hysteria
      0x00021198, // Clairvoyance
    ],
    conjuration: [
      0x000204C3, // Conjure Familiar
      0x0001DAD4, // Conjure Flame Atronach
      0x0001DAD5, // Conjure Frost Atronach
      0x0001DAD6, // Conjure Storm Atronach
      0x000204BB, // Raise Zombie
      0x000B62DC, // Reanimate Corpse
      0x000B45F5, // Revenant
      0x000B45F6, // Dread Zombie
      0x000B45F7, // Dead Thrall
      0x00045F99, // Bound Sword
      0x00045F9A, // Bound Battleaxe
      0x00045F9B, // Bound Bow
      0x000204C4, // Banish Daedra
      0x000640B6, // Soul Trap
      0x000A26E0, // Conjure Dremora Lord
    ],
  }
  for (const [school, ids] of Object.entries(by_school)) {
    for (const id of ids) map.set(id, school)
  }
  return map
})()

// Detect Life / Detect Dead — Alteration, but trigger a special response
const DETECT_LIFE_SPELLS = new Set([0x0001A4CD, 0x0002ACD3])

// ── Helpers ───────────────────────────────────────────────────────────────────

function _findUserIdByActorId(store, actorId) {
  return (store.getAll().find(p => p.actorId === actorId) || {}).id || null
}

function _dist3d(a, b) {
  // mp.get(actorId, 'pos') may return [x,y,z] or {x,y,z} — handle both
  const [ax, ay, az] = Array.isArray(a) ? a : [a.x, a.y, a.z]
  const [bx, by, bz] = Array.isArray(b) ? b : [b.x, b.y, b.z]
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
}

function _holdBroadcast(mp, store, userId, text) {
  const player = store.get(userId)
  if (!player) return
  const targets = store.getAll().filter(p => !player.holdId || p.holdId === player.holdId)
  for (const t of targets) mp.sendCustomPacket(t.actorId, 'chatMessage', { text })
}

// ── Detect Life ───────────────────────────────────────────────────────────────

function _handleDetectLife(mp, store, userId) {
  const caster = store.get(userId)
  if (!caster) return
  const casterPos = mp.get(caster.actorId, 'pos')
  if (!casterPos) return

  const nearby = store.getAll()
    .filter(p => {
      if (p.id === userId) return false
      const pos = mp.get(p.actorId, 'pos')
      return pos && _dist3d(casterPos, pos) <= DETECT_LIFE_RANGE
    })
    .map(p => ({ name: p.name }))

  mp.sendCustomPacket(caster.actorId, 'detectLifeResult', { nearby })
}

// ── /skill-dice handler ───────────────────────────────────────────────────────

function handleSkillDice(mp, store, bus, userId, args) {
  const action = (args[0] || '').toLowerCase()
  if (!action) return

  const player = store.get(userId)
  if (!player) return

  if (action === 'init') {
    const skillData = {}
    for (const school of SCHOOLS) {
      const xp    = skills.getSkillXp(mp, userId, school)
      const level = skills.getSkillLevel(xp)
      skillData[school] = { level }
    }
    // weapons/armor omitted — client reads equipped state from game engine directly
    mp.sendCustomPacket(player.actorId, 'skillDiceInit', {
      skills:  skillData,
      weapons: [],
      armor:   null,
    })
    return
  }

  if (action === 'wolf' || action === 'vampus') {
    const state   = args[1] === 'on'
    const formStr = action === 'wolf' ? 'werewolf' : 'vampire lord'
    const msg     = `★ ${player.name} ${state ? 'shifts into' : 'reverts from'} ${formStr} form`
    _holdBroadcast(mp, store, userId, msg)
    return
  }

  if (action === 'heal' || action === 'self-attack') {
    const hp  = parseInt(args[1]) || 0
    const msg = action === 'heal'
      ? `★ ${player.name} tends their wounds [HP: ${hp}/5]`
      : `★ ${player.name} takes a wound [HP: ${hp}/5]`
    _holdBroadcast(mp, store, userId, msg)
    return
  }

  // initiative, weapon, magic, defence
  const type  = args[1] || null
  const value = parseInt(args[2]) || 0
  const buff  = parseInt(args[3]) || 0

  const buffStr   = buff !== 0 ? ` (${buff > 0 ? '+' : ''}${buff})` : ''
  const label     = type ? `${type}` : action
  const msg       = `★ ${player.name} — ${label}: ${value}${buffStr}`
  _holdBroadcast(mp, store, userId, msg)

  if (action === 'magic' && SCHOOLS.includes(type)) {
    skills.addSkillXp(mp, store, userId, type, XP_ON_ROLL)
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init(mp, store, bus) {
  console.log('[magic] Initializing')

  // Papyrus event — property assignment verified against ScampServerListener.cpp and
  // test_onPapyrusEvent_OnItemAdded.js. First arg is casterFormId (number); second arg
  // is the spell as { type, desc } — use mp.getIdFromDesc to get the numeric formId.
  papyrusBridge.registerEvent(mp, 'OnSpellCast', (casterActorId, spellArg) => {
    const userId = _findUserIdByActorId(store, casterActorId)
    if (!userId) return  // NPC cast — ignore

    const spellFormId = (spellArg && spellArg.desc) ? mp.getIdFromDesc(spellArg.desc) : null
    if (spellFormId === null) return

    if (DETECT_LIFE_SPELLS.has(spellFormId)) {
      _handleDetectLife(mp, store, userId)
    }

    const school = SPELL_SCHOOL.get(spellFormId)
    if (school) skills.addSkillXp(mp, store, userId, school, XP_ON_CAST)
  })

  // No mp.onHit — HitEvent.cpp does not exist in gamemode_events; there is no onHit
  // gamemode property. Destruction-on-hit XP would require onPapyrusEvent:OnHit with
  // a Papyrus script registered on affected actors — deferred.

  console.log('[magic] Started')
}

module.exports = { handleSkillDice, init, SCHOOLS, SPELL_SCHOOL, DETECT_LIFE_RANGE, XP_ON_CAST, XP_ON_ROLL }
