'use strict'

const inv = require('./inventory')
const production = require('./production')
const skills = require('./skills')

const ITEMS = {
  saltPile: 0x00034CDF,
  jazbayGrapes: 0x0006AC4A,
  bread: 0x00065C97,
  nordMead: 0x00034C5D,
  leather: 0x000DB5D2,
  leatherStrips: 0x000800E4,
  linenWrap: 0x00034CD6,
  bandage: 0x00034CD6,
}

const RECIPES = {
  ironIngot: {
    id: 'ironIngot',
    name: 'Iron Ingot',
    station: 'smelter',
    inputs: [{ baseId: production.RESOURCES.ironOre.baseId, count: 2 }],
    output: { baseId: 0x0005ACE4, count: 1 },
    skillId: 'smithing',
    xp: 15,
  },
  charcoal: {
    id: 'charcoal',
    name: 'Charcoal',
    station: 'kiln',
    inputs: [{ baseId: production.RESOURCES.lumber.baseId, count: 2 }],
    output: { baseId: 0x00033760, count: 1 },
    skillId: 'smithing',
    xp: 8,
  },
  leather: {
    id: 'leather',
    name: 'Leather',
    station: 'tanningRack',
    inputs: [{ baseId: 0x0003AD52, count: 1 }],
    output: { baseId: ITEMS.leather, count: 1 },
    skillId: 'tailoring',
    xp: 10,
  },
  flatbread: {
    id: 'flatbread',
    name: 'Flatbread',
    station: 'oven',
    inputs: [
      { baseId: production.RESOURCES.wheat.baseId, count: 2 },
      { baseId: ITEMS.saltPile, count: 1 },
    ],
    output: { baseId: ITEMS.bread, count: 1 },
    skillId: 'baking',
    xp: 12,
  },
  juniperMead: {
    id: 'juniperMead',
    name: 'Juniper Mead',
    station: 'brewery',
    inputs: [
      { baseId: production.RESOURCES.honey.baseId, count: 2 },
      { baseId: ITEMS.jazbayGrapes, count: 1 },
    ],
    output: { baseId: ITEMS.nordMead, count: 1 },
    skillId: 'brewing',
    xp: 16,
  },
  leatherStrips: {
    id: 'leatherStrips',
    name: 'Leather Strips',
    station: 'tanningRack',
    inputs: [{ baseId: ITEMS.leather, count: 1 }],
    output: { baseId: ITEMS.leatherStrips, count: 4 },
    skillId: 'tailoring',
    xp: 8,
  },
  linenBandage: {
    id: 'linenBandage',
    name: 'Linen Bandage',
    station: 'medicalTable',
    inputs: [{ baseId: ITEMS.linenWrap, count: 2 }],
    output: { baseId: ITEMS.bandage, count: 1 },
    skillId: 'medicine',
    xp: 10,
  },
}

function canCraft(mp, actorId, recipe) {
  if (!recipe) return { ok: false, reason: 'unknown_recipe' }
  for (const input of recipe.inputs) {
    if (!inv.hasItem(mp, actorId, input.baseId, input.count)) {
      return { ok: false, reason: 'missing_input', input }
    }
  }
  return { ok: true }
}

function craftItem(mp, store, bus, playerId, recipeId) {
  const player = store.get(playerId)
  const recipe = RECIPES[recipeId]
  if (!player) return { ok: false, message: 'Player not found.' }
  const allowed = canCraft(mp, player.actorId, recipe)
  if (!allowed.ok) return { ok: false, reason: allowed.reason, message: 'You do not have the required materials.' }

  for (const input of recipe.inputs) {
    inv.removeItem(mp, player.actorId, input.baseId, input.count)
  }
  inv.addItem(mp, player.actorId, recipe.output.baseId, recipe.output.count)
  const xpGranted = recipe.skillId ? skills.addSkillXp(mp, store, playerId, recipe.skillId, recipe.xp || 0) : 0
  if (bus) {
    if (xpGranted > 0) bus.dispatch({ type: 'skillXpGranted', playerId, skillId: recipe.skillId, xp: xpGranted, source: 'crafting', recipeId })
    bus.dispatch({ type: 'itemCrafted', playerId, recipeId, output: recipe.output })
  }
  return { ok: true, message: `Crafted ${recipe.name}.`, recipe, xpGranted }
}

module.exports = { ITEMS, RECIPES, canCraft, craftItem }
