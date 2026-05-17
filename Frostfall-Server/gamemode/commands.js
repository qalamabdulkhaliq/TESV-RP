'use strict'

// ── Helpers ───────────────────────────────────────────────────────────────────

const chatHelper = require('./chat')
const cp = require('./chatProperty')
const chatLog = require('./chatLog')
const auditLog = require('./auditLog')
const reports = require('./reports')
const commodityExchange = require('./commodityExchange')
const crafting = require('./crafting')

const PROXIMITY_RANGE_NORMAL = 2000
const PROXIMITY_RANGE_WHISPER = 500
const PROXIMITY_RANGE_YELL = 10000

const lastPmByUser = new Map()

function parseCommand(text) {
  if (!text || !text.startsWith('/')) return null
  const parts = text.trim().slice(1).split(/\s+/)
  return { cmd: parts[0].toLowerCase(), args: parts.slice(1) }
}

function findPlayer(store, name) {
  return resolvePlayerTarget(store, null, name)
}

function resolvePlayerTarget(store, currentUserId, target) {
  const targetText = Array.isArray(target) ? target.join(' ') : String(target || '')
  const normalized = targetText.trim().toLowerCase()
  if (!normalized) return null
  if ((normalized === 'me' || normalized === 'self') && currentUserId !== null && currentUserId !== undefined) {
    return store.get(currentUserId)
  }
  return store.getAll().find(p => p.name.toLowerCase() === normalized) || null
}

function resolvePlayerTargetFromArgs(store, currentUserId, args, options) {
  const targetArgs = Array.isArray(args) ? args : []
  const opts = options || {}
  if (targetArgs.length === 0) {
    return {
      target: opts.defaultSelf ? store.get(currentUserId) : null,
      consumed: 0,
      text: '',
    }
  }
  const firstArg = String(targetArgs[0] || '').toLowerCase()
  if (firstArg === 'me' || firstArg === 'self') {
    return {
      target: store.get(currentUserId),
      consumed: 1,
      text: targetArgs[0],
    }
  }
  for (let count = targetArgs.length; count >= 1; count--) {
    const text = targetArgs.slice(0, count).join(' ')
    const target = resolvePlayerTarget(store, currentUserId, text)
    if (target) return { target, consumed: count, text }
  }
  return { target: null, consumed: 0, text: targetArgs.join(' ') }
}

function splitTargetAndTrailingArg(args) {
  const parts = Array.isArray(args) ? args : []
  return {
    targetArgs: parts.slice(0, -1),
    value: parts.length ? parts[parts.length - 1] : undefined,
  }
}

function checkPermission(store, playerId, level) {
  if (level === 'player') return true
  const player = store.get(playerId)
  if (!player) return false
  if (level === 'staff')  return player.isStaff
  if (level === 'leader') return player.isLeader || player.isStaff
  return false
}

function parseBaseId(value) {
  const text = String(value || '').trim()
  if (!text) return NaN
  const clean = text.toLowerCase().startsWith('0x') ? text.slice(2) : text
  const radix = /[a-f]/i.test(clean) ? 16 : 10
  return parseInt(clean, radix)
}

function reply(mp, store, playerId, message) {
  const player = store.get(playerId)
  if (!player || !player.actorId) return
  const msg = cp.ChatMessage.system(message)
  cp.ChatProperty.sendChatMessage(player.actorId, msg)
}

let _handlers = null

function dispatch(userId, text) {
  if (!_handlers) return false
  const parsed = parseCommand(text)
  if (!parsed) return false
  const handler = _handlers[parsed.cmd]
  if (!handler) return false
  handler(userId, parsed.args)
  return true
}

// ── Command registration ──────────────────────────────────────────────────────

function registerAll(mp, store, bus, systems) {
  const { hunger, drunkBar, economy, housing, bounty,
          combat, nvfl, captivity, medical, interactionState, prison, factions,
          college, skills, training, treasury, production, pve, transport, roleplay,
          inventory: inv, magic, papyrusBridge, alphaSpikes, espAssetRegistry, engineProbes, modSourceRegistry, skillUi, identityOverlay } = systems
  const permissions = require('./permissions')

  const handlers = {}

  function sendSystem(actorId, message) {
    if (!actorId) return
    cp.ChatProperty.sendChatMessage(actorId, cp.ChatMessage.system(message))
  }

  function playerPos(player) {
    if (!player || !player.actorId || !mp || typeof mp.get !== 'function') return null
    try { return mp.get(player.actorId, 'pos') || null } catch (err) { return null }
  }

  function distance(a, b) {
    if (!a || !b) return Infinity
    const ax = Array.isArray(a) ? a[0] : a.x
    const ay = Array.isArray(a) ? a[1] : a.y
    const az = Array.isArray(a) ? a[2] : a.z
    const bx = Array.isArray(b) ? b[0] : b.x
    const by = Array.isArray(b) ? b[1] : b.y
    const bz = Array.isArray(b) ? b[2] : b.z
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
  }

  function nearbyPlayers(player, range) {
    const senderPos = playerPos(player)
    if (!senderPos) return player ? [player] : []
    return store.getAll().filter(p => p.actorId && distance(senderPos, playerPos(p)) <= range)
  }

  function logChannel(player, channel, text, recipients) {
    chatLog.appendChatLog(chatLog.buildChatEntry({
      player,
      channel,
      text,
      pos: playerPos(player),
      recipients,
    }))
  }

  function targetFromArgs(userId, args, options) {
    return resolvePlayerTargetFromArgs(store, userId, args, options).target
  }

  // ── College ──────────────────────────────────────────────────────────────
  handlers['lecture'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (sub === 'start') {
      const ok = college.startLecture(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Lecture started.' : 'You already have an active lecture.')
    } else if (sub === 'join') {
      const lecturerId = _findUserIdByName(store, args[1])
      if (lecturerId === null) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      const ok = college.joinLecture(mp, store, bus, userId, lecturerId)
      reply(mp, store, userId, ok ? 'Joined lecture.' : 'Could not join that lecture.')
    } else if (sub === 'end') {
      const ok = college.endLecture(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Lecture ended. XP distributed.' : 'No active lecture.')
    } else {
      reply(mp, store, userId, 'Usage: /lecture start | join [name] | end')
    }
  }

  handlers['study'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const baseId = parseInt(args[0], 16)
    if (!baseId) return reply(mp, store, userId, 'Usage: /study [tomeBaseId]')
    college.studyTome(mp, store, bus, userId, baseId)
    reply(mp, store, userId, 'Studied tome.')
  }

  // ── Training ─────────────────────────────────────────────────────────────
  handlers['train'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const skillIds = skills.SKILL_IDS
    if (sub === 'start') {
      const skillId = (args[1] || '').toLowerCase()
      if (!skillIds.includes(skillId)) return reply(mp, store, userId, `Valid skills: ${skillIds.join(', ')}`)
      const ok = training.startTraining(mp, store, bus, userId, skillId)
      reply(mp, store, userId, ok ? `Training session started for ${skillId}.` : 'You already have an active session.')
    } else if (sub === 'join') {
      const trainerId = _findUserIdByName(store, args[1])
      if (trainerId === null) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      const ok = training.joinTraining(mp, store, bus, userId, trainerId)
      reply(mp, store, userId, ok ? 'Joined training session.' : 'Could not join (not nearby or no session).')
    } else if (sub === 'end') {
      const ok = training.endTraining(mp, store, bus, userId)
      reply(mp, store, userId, ok ? 'Training ended. Boosts granted to attendees.' : 'No active session.')
    } else {
      reply(mp, store, userId, 'Usage: /train start [skillId] | join [name] | end')
    }
  }

  // ── Skills ───────────────────────────────────────────────────────────────
  handlers['skill'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const player = store.get(userId)
    if (!player) return
    const target = (args[0] || '').toLowerCase()
    const list   = target ? [target] : skills.SKILL_IDS
    const lines  = []
    for (const skillId of list) {
      const xp    = skills.getSkillXp(mp, userId, skillId)
      const level = skills.getSkillLevel(xp)
      const cap   = skills.getSkillCap(mp, store, userId, skillId)
      lines.push(`${skillId}: level ${level} (${xp}/${cap} XP)`)
    }
    reply(mp, store, userId, lines.join('\n'))
  }

  handlers['skillsmenu'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const result = skillUi.sendSkillMenu(mp, store, userId)
    reply(mp, store, userId, result.message)
  }

  handlers['names'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const range = parseInt(args[0]) || 2500
    const result = identityOverlay.sendIdentityOverlay(mp, store, userId, range)
    reply(mp, store, userId, result.message)
  }

  // ── Economy ──────────────────────────────────────────────────────────────
  handlers['pay'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const amount = parseInt(args[0])
    if (!amount || amount <= 0) return reply(mp, store, userId, 'Usage: /pay [amount] [playerName]')
    const target = findPlayer(store, args[1])
    if (!target) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
    const ok = economy.transferGold(mp, store, userId, target.id, amount)
    if (ok) {
      reply(mp, store, userId, `Paid ${amount} Septims to ${target.name}.`)
      reply(mp, store, target.id, `Received ${amount} Septims from ${store.get(userId).name}.`)
    } else {
      reply(mp, store, userId, 'Insufficient funds.')
    }
  }

  handlers['gold'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const player = store.get(userId)
    if (!player) return
    const septims = inv.getItemCount(mp, player.actorId, inv.GOLD_BASE_ID)
    store.update(userId, { septims })
    reply(mp, store, userId, `You have ${septims} Septims.`)
  }

  // ── Serious Text RP channels ─────────────────────────────────────────────
  handlers['pm'] = (userId, args) => {
    const sender = store.get(userId)
    const target = findPlayer(store, args[0])
    const text = args.slice(1).join(' ').trim()
    if (!sender) return
    if (!target || !text) return reply(mp, store, userId, 'Usage: /pm [playerName] [message]')

    lastPmByUser.set(userId, target.id)
    lastPmByUser.set(target.id, userId)
    sendSystem(sender.actorId, `PM to ${target.name}: ${text}`)
    sendSystem(target.actorId, `PM from ${sender.name}: ${text}`)
    logChannel(sender, 'pm', text, [sender, target])
    auditLog.audit('chat.pm', { fromPlayerId: sender.id, toPlayerId: target.id, text })
  }

  handlers['r'] = (userId, args) => {
    const sender = store.get(userId)
    const targetId = lastPmByUser.get(userId)
    const target = targetId ? store.get(targetId) : null
    const text = args.join(' ').trim()
    if (!sender) return
    if (!target || !text) return reply(mp, store, userId, 'Usage: /r [message] (after receiving a PM)')

    lastPmByUser.set(userId, target.id)
    lastPmByUser.set(target.id, userId)
    sendSystem(sender.actorId, `PM to ${target.name}: ${text}`)
    sendSystem(target.actorId, `PM from ${sender.name}: ${text}`)
    logChannel(sender, 'pm-reply', text, [sender, target])
    auditLog.audit('chat.pm', { fromPlayerId: sender.id, toPlayerId: target.id, text, reply: true })
  }

  handlers['b'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /b [local OOC message]')

    const recipients = nearbyPlayers(sender, PROXIMITY_RANGE_NORMAL)
    for (const p of recipients) sendSystem(p.actorId, `(( ${sender.name}: ${text} ))`)
    logChannel(sender, 'looc', text, recipients)
  }

  handlers['looc'] = handlers['b']

  handlers['f'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /f [faction message]')
    const factionsForSender = Array.isArray(sender.factions) ? sender.factions : []
    if (factionsForSender.length === 0) return reply(mp, store, userId, 'You are not in a faction.')

    const recipients = store.getAll().filter(p => {
      const factionsForPlayer = Array.isArray(p.factions) ? p.factions : []
      return factionsForPlayer.some(factionId => factionsForSender.includes(factionId))
    })
    for (const p of recipients) sendSystem(p.actorId, `[Faction] ${sender.name}: ${text}`)
    logChannel(sender, 'faction', text, recipients)
  }

  handlers['ame'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /ame [short action]')

    const recipients = nearbyPlayers(sender, PROXIMITY_RANGE_NORMAL)
    for (const p of recipients) sendSystem(p.actorId, `* ${sender.name} ${text}`)
    logChannel(sender, 'ame', text, recipients)
  }

  handlers['report'] = (userId, args) => {
    const sender = store.get(userId)
    const text = args.join(' ').trim()
    if (!sender || !text) return reply(mp, store, userId, 'Usage: /report [message]')

    const staff = store.getAll().filter(p => p.isStaff && p.actorId)
    const recipients = staff.length ? staff : [sender]
    const report = reports.createReport(sender, text, staff.map(p => p.id))
    for (const p of recipients) sendSystem(p.actorId, `Report from ${sender.name}: ${text}`)
    if (!staff.some(p => p.id === sender.id)) sendSystem(sender.actorId, 'Report sent to online staff.')
    logChannel(sender, 'report', text, recipients)
    auditLog.audit('staff.report', { reportId: report.id, fromPlayerId: sender.id, text, staffRecipients: staff.map(p => p.id) })
  }

  handlers['reports'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const openReports = reports.listOpenReports(10)
    if (openReports.length === 0) return reply(mp, store, userId, 'No open reports.')
    const lines = openReports.map(report => `${report.id}: ${report.name} - ${report.text}`)
    reply(mp, store, userId, lines.join('\n'))
  }

  // ── Production / commodity floor ─────────────────────────────────────────
  handlers['production'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const player = store.get(userId)
    if (!player) return

    if (sub === 'list') {
      if (!player.holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
      const sites = production.getSitesByHold(player.holdId)
      if (sites.length === 0) return reply(mp, store, userId, 'No production sites are registered for this hold.')
      const lines = sites.map(site => {
        const resource = production.RESOURCES[site.resourceId]
        return `${site.id}: ${site.name} -> ${site.outputCount} ${resource.name}`
      })
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'work') {
      const siteId = args[1]
      if (!siteId) return reply(mp, store, userId, 'Usage: /production work [siteId]')
      const result = production.workSite(mp, store, bus, userId, siteId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'sell') {
      const resourceId = args[1]
      const amount = parseInt(args[2])
      if (!resourceId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /production sell [resourceId] [amount]')
      const result = commodityExchange.sellAtFloor({ mp, store, bus, playerId: userId, resourceId, count: amount })
      return reply(mp, store, userId, result.message)
    }

    const floors = Object.values(production.RESOURCES)
      .map(resource => `${resource.id}: ${resource.name} floor ${resource.floorPrice}g`)
      .join('\n')
    reply(mp, store, userId, 'Usage: /production list | work [siteId] | sell [resourceId] [amount]\n' + floors)
  }

  handlers['pve'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]

    if (sub === 'wildlife') {
      const holdId = (args[1] || '').toLowerCase()
      if (!holdId) return reply(mp, store, userId, 'Usage: /pve wildlife [holdId]')
      const result = pve.spawnWildlife(mp, bus, holdId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'dungeon') {
      const groupId = (args[1] || '').toLowerCase()
      if (!groupId) return reply(mp, store, userId, 'Usage: /pve dungeon [groupId]')
      const result = pve.spawnDungeon(mp, bus, groupId)
      return reply(mp, store, userId, result.message)
    }

    const holds = Object.keys(pve.WILDLIFE_BY_HOLD).join(', ')
    const groups = Object.keys(pve.DUNGEON_GROUPS).join(', ')
    reply(mp, store, userId, `Usage: /pve wildlife [holdId] | dungeon [groupId]\nHolds: ${holds}\nDungeons: ${groups}`)
  }

  handlers['cart'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]

    if (sub === 'create') {
      const result = transport.createCart(store, userId)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'list') {
      const carts = transport.listCarts(userId)
      if (carts.length === 0) return reply(mp, store, userId, 'You have no carts.')
      const lines = carts.map(cart => {
        const items = cart.inventory.length
          ? cart.inventory.map(entry => `${entry.baseId.toString(16)} x${entry.count}`).join(', ')
          : 'empty'
        return `${cart.id} (${cart.holdId || 'no hold'}): ${items}`
      })
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'load' || sub === 'unload') {
      const cartId = args[1]
      const baseId = parseBaseId(args[2])
      const count = parseInt(args[3])
      if (!cartId || !baseId || !count || count <= 0) return reply(mp, store, userId, `Usage: /cart ${sub} [cartId] [baseId] [amount]`)
      const result = sub === 'load'
        ? transport.loadCart(mp, store, userId, cartId, baseId, count)
        : transport.unloadCart(mp, store, userId, cartId, baseId, count)
      return reply(mp, store, userId, result.message)
    }

    if (sub === 'probe') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const type = (args[1] || '').toLowerCase()
      if (!type) return reply(mp, store, userId, 'Usage: /cart probe horse|cart|carriage')
      const result = transport.probeVehicle(mp, bus, type)
      return reply(mp, store, userId, result.message)
    }

    reply(mp, store, userId, 'Usage: /cart create | list | load [cartId] [baseId] [amount] | unload [cartId] [baseId] [amount] | probe horse|cart|carriage')
  }

  handlers['alpha'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    const player = store.get(userId)
    if (!player) return

    if (sub === 'plugin') {
      const status = alphaSpikes.getPluginStatus()
      const custom = status.customPlugins.length ? status.customPlugins.join(', ') : 'none'
      return reply(mp, store, userId, `Gamemode: ${status.gamemodePath}\nCustom plugins: ${custom}\nESL needs verification: ${status.eslNeedsVerification}`)
    }

    if (sub === 'papyrus') {
      const events = papyrusBridge.getRegisteredEvents(mp)
      return reply(mp, store, userId, `Registered Papyrus events: ${events.length ? events.join(', ') : 'none'}`)
    }

    if (sub === 'probes') {
      const lines = engineProbes.getProbeStatus().map(probe => `${probe.priority}. ${probe.id}: ${probe.status}`)
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'assets') {
      const families = espAssetRegistry.getRecordFamilies()
      return reply(mp, store, userId, `Registered ESP asset families: ${families.join(', ')}`)
    }

    if (sub === 'mods') {
      const lines = modSourceRegistry.getIntegrationSummary().map(mod => `${mod.id}: ${mod.permissionStatus}`)
      return reply(mp, store, userId, lines.join('\n'))
    }

    if (sub === 'ui') {
      const payload = alphaSpikes.sendUiStatus(mp, player.actorId)
      return reply(mp, store, userId, `Alpha UI path: ${payload.alphaUiPath}; SkyUI: ${payload.skyUiStatus}`)
    }

    reply(mp, store, userId, 'Usage: /alpha plugin | papyrus | ui')
  }

  // ── Housing ──────────────────────────────────────────────────────────────
  handlers['property'] = (userId, args) => {
    const sub = args[0]
    if (sub === 'list') {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const player = store.get(userId)
      const holdId = player ? player.holdId : null
      if (!holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
      const list = housing.getPropertiesByHold(holdId)
      const lines = list.map(p => `${p.id}: ${p.name} [${p.type}] — ${p.ownerId ? 'Owned' : p.pendingOwnerId ? 'Pending' : 'Available'}`)
      reply(mp, store, userId, lines.length ? lines.join('\n') : 'No properties in this hold.')
    } else if (sub === 'request') {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      if (!propertyId) return reply(mp, store, userId, 'Usage: /property request [propertyId]')
      // Find a steward in the hold (simplified: notify all leaders in hold)
      const stewardId = _findStewardForProperty(store, housing, propertyId)
      if (stewardId === null) return reply(mp, store, userId, 'No Steward available in this hold.')
      const ok = housing.requestProperty(mp, store, bus, userId, propertyId, stewardId)
      reply(mp, store, userId, ok ? 'Property request sent to Steward.' : 'Property unavailable.')
    } else if (sub === 'approve') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.approveProperty(mp, store, bus, propertyId, userId, treasury)
      reply(mp, store, userId, ok ? 'Property approved.' : 'No pending request for that property.')
    } else if (sub === 'deny') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.denyProperty(mp, propertyId, store)
      reply(mp, store, userId, ok ? 'Property request denied.' : 'Property not found.')
    } else if (sub === 'setprice') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const price = parseInt(args[2])
      if (!propertyId || isNaN(price) || price < 0) return reply(mp, store, userId, 'Usage: /property setprice [id] [price]')
      const ok = housing.setPropertyPrice(propertyId, price)
      reply(mp, store, userId, ok ? `Property price set to ${price}.` : 'Property not found.')
    } else if (sub === 'summon') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.summonProperty(mp, store, bus, propertyId, userId)
      reply(mp, store, userId, ok ? 'Property requester summoned.' : 'No pending request for that property.')
    } else if (sub === 'revoke') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const propertyId = args[1]
      const ok = housing.revokeProperty(mp, store, propertyId)
      reply(mp, store, userId, ok ? 'Property revoked.' : 'Property not found.')
    } else {
      reply(mp, store, userId, 'Usage: /property list | request [id] | approve [id] | deny [id] | setprice [id] [price] | summon [id] | revoke [id]')
    }
  }

  handlers['craft'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (sub === 'list' || !sub) {
      const lines = Object.values(crafting.RECIPES).map(recipe => `${recipe.id}: ${recipe.name}`)
      return reply(mp, store, userId, lines.join('\n'))
    }
    const result = crafting.craftItem(mp, store, bus, userId, sub)
    reply(mp, store, userId, result.message)
  }

  // ── Bounty ───────────────────────────────────────────────────────────────
  handlers['bounty'] = (userId, args) => {
    const sub = args[0]
    if (!sub) {
      if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
      const bounties = bounty.getAllBounties(mp, store, userId)
      const lines = Object.entries(bounties).filter(([,v]) => v > 0).map(([h,v]) => `${h}: ${v}`)
      reply(mp, store, userId, lines.length ? lines.join('\n') : 'No bounties.')
    } else if (sub === 'check') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const target = targetFromArgs(userId, args.slice(1), { defaultSelf: true })
      if (!target) return reply(mp, store, userId, `Player "${args.slice(1).join(' ')}" not found.`)
      const bounties = bounty.getAllBounties(mp, store, target.id)
      const lines = Object.entries(bounties).filter(([,v]) => v > 0).map(([h,v]) => `${h}: ${v}`)
      reply(mp, store, userId, `Bounties for ${target.name}:\n${lines.length ? lines.join('\n') : 'None'}`)
    } else if (sub === 'add') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const amount = parseInt(args[args.length - 1])
      const holdId = (args[args.length - 2] || '').toLowerCase()
      const target = targetFromArgs(userId, args.slice(1, -2))
      if (!target || !holdId || !amount) return reply(mp, store, userId, 'Usage: /bounty add [name] [holdId] [amount]')
      bounty.addBounty(mp, store, bus, target.id, holdId, amount)
      reply(mp, store, userId, `Added ${amount} bounty for ${target.name} in ${holdId}.`)
    } else if (sub === 'clear') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[args.length - 1] || '').toLowerCase()
      const target = targetFromArgs(userId, args.slice(1, -1))
      if (!target || !holdId) return reply(mp, store, userId, 'Usage: /bounty clear [name] [holdId]')
      bounty.clearBounty(mp, store, bus, target.id, holdId)
      reply(mp, store, userId, `Cleared bounty for ${target.name} in ${holdId}.`)
    } else {
      reply(mp, store, userId, 'Usage: /bounty | check [name] | add [name] [hold] [amount] | clear [name] [hold]')
    }
  }

  // ── Justice ──────────────────────────────────────────────────────────────
  handlers['arrest'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const officer = store.get(userId)
    const holdId  = officer ? officer.holdId : null
    if (!holdId) return reply(mp, store, userId, 'You are not assigned to a hold.')
    // Find Jarl of this hold to notify
    const jarlId = _findJarlForHold(store, holdId)
    const ok = prison.queueForSentencing(mp, store, bus, target.id, holdId, userId, jarlId || userId)
    reply(mp, store, userId, ok ? `${target.name} queued for sentencing.` : `${target.name} is already in queue.`)
  }

  handlers['sentence'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const type = (args[1] || '').toLowerCase()
    if (!['fine','release','banish'].includes(type)) return reply(mp, store, userId, 'Usage: /sentence [name] fine [amount] | release | banish')
    const sentence = { type }
    if (type === 'fine') {
      sentence.fineAmount = parseInt(args[2]) || 0
    }
    const ok = prison.sentencePlayer(mp, store, bus, target.id, userId, sentence)
    reply(mp, store, userId, ok ? `Sentenced ${target.name}: ${type}.` : `${target.name} is not in queue.`)
  }

  // ── Captivity ────────────────────────────────────────────────────────────
  handlers['capture'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    captivity.capturePlayer(mp, store, bus, target.id, userId)
    reply(mp, store, userId, `${target.name} taken captive.`)
  }

  handlers['release'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    captivity.releasePlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} released.`)
  }

  handlers['handsup'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const enabled = (args[0] || 'on').toLowerCase() !== 'off'
    const result = interactionState.setSurrender(mp, store, bus, userId, enabled)
    reply(mp, store, userId, result.message)
  }

  handlers['cuff'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.cuffPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['uncuff'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.uncuffPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['search'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.searchPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['carry'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = interactionState.carryPlayer(mp, store, bus, userId, target.id)
    reply(mp, store, userId, result.message)
  }

  handlers['treat'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    const treatmentId = (args[1] || 'bandage').toLowerCase()
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    const result = medical.treatPlayer(mp, store, bus, userId, target.id, treatmentId)
    reply(mp, store, userId, result.message)
  }

  // ── Combat — player actions ──────────────────────────────────────────────
  handlers['revive'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.revivePlayer(mp, store, bus, userId, target.id)
    if (ok) {
      reply(mp, store, userId, `You revived ${target.name}.`)
    }
  }

  handlers['execute'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.executePlayer(mp, store, bus, prison, housing, userId, target.id)
    if (ok) reply(mp, store, userId, `${target.name} executed.`)
  }

  handlers['loot'] = (userId, args) => {
    if (!checkPermission(store, userId, 'player')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    if (!target.isDown) return reply(mp, store, userId, `${target.name} is not downed.`)
    const ok = combat.openLootSession(mp, store, bus, inv, userId, target.id)
    if (!ok) reply(mp, store, userId, `Could not open loot menu for ${target.name}.`)
  }

  // ── Combat (staff) ───────────────────────────────────────────────────────
  handlers['down'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    combat.downPlayer(mp, store, bus, target.id, userId)
    reply(mp, store, userId, `${target.name} forced down.`)
  }

  handlers['rise'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = findPlayer(store, args[0])
    if (!target) return reply(mp, store, userId, `Player "${args[0]}" not found.`)
    combat.risePlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} risen.`)
  }

  handlers['nvfl'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    if (args[0] === 'clear') {
      const target = findPlayer(store, args[1])
      if (!target) return reply(mp, store, userId, `Player "${args[1]}" not found.`)
      nvfl.clearNvfl(store, target.id)
      reply(mp, store, userId, `NVFL cleared for ${target.name}.`)
    } else {
      reply(mp, store, userId, 'Usage: /nvfl clear [name]')
    }
  }

  // ── Factions ─────────────────────────────────────────────────────────────
  handlers['faction'] = (userId, args) => {
    const sub = args[0]
    if (sub === 'join') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const maybeRank = parseInt(args[args.length - 1])
      const hasRank = args.length > 3 && !isNaN(maybeRank)
      const factionId = (args[hasRank ? args.length - 2 : args.length - 1] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, hasRank ? -2 : -1))
      const rank      = hasRank ? maybeRank : 0
      if (!target || !factionId) return reply(mp, store, userId, 'Usage: /faction join [name] [factionId] (rank)')
      factions.joinFaction(mp, store, bus, target.id, factionId, rank)
      reply(mp, store, userId, `${target.name} joined ${factionId} at rank ${rank}.`)
    } else if (sub === 'leave') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const factionId = (args[args.length - 1] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, -1))
      if (!target || !factionId) return reply(mp, store, userId, 'Usage: /faction leave [name] [factionId]')
      factions.leaveFaction(mp, store, bus, target.id, factionId)
      reply(mp, store, userId, `${target.name} left ${factionId}.`)
    } else if (sub === 'rank') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const rank      = parseInt(args[args.length - 1])
      const factionId = (args[args.length - 2] || '').toLowerCase()
      const target    = targetFromArgs(userId, args.slice(1, -2))
      if (!target || !factionId || isNaN(rank)) return reply(mp, store, userId, 'Usage: /faction rank [name] [factionId] [rank]')
      factions.joinFaction(mp, store, bus, target.id, factionId, rank)
      reply(mp, store, userId, `${target.name} set to rank ${rank} in ${factionId}.`)
    } else if (sub === 'bbb') {
      if (args[1] === 'set') {
        if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
        // Multi-line input not supported yet — stub only
        reply(mp, store, userId, 'BBB set not yet implemented (requires multi-line input).')
      } else {
        const factionId = (args[1] || '').toLowerCase()
        const doc = factions.getFactionDocument(mp, factionId)
        if (!doc) return reply(mp, store, userId, `No BBB document for ${factionId}.`)
        reply(mp, store, userId, `[${factionId}] Benefits: ${doc.benefits}\nBurdens: ${doc.burdens}\nBylaws: ${doc.bylaws}`)
      }
    } else {
      reply(mp, store, userId, 'Usage: /faction join|leave|rank|bbb ...')
    }
  }

  // ── Staff utilities ──────────────────────────────────────────────────────
  handlers['sober'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const target = targetFromArgs(userId, args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    drunkBar.soberPlayer(mp, store, bus, target.id)
    reply(mp, store, userId, `${target.name} sobered.`)
  }

  handlers['feed'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    const maybeLevels = parseInt(args[args.length - 1])
    const hasLevels = args.length > 1 && !isNaN(maybeLevels)
    const target = targetFromArgs(userId, hasLevels ? args.slice(0, -1) : args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    const levels = hasLevels ? maybeLevels : 5
    hunger.feedPlayer(mp, store, bus, target.id, levels)
    reply(mp, store, userId, `Fed ${target.name} (${levels} levels).`)
  }

  // ── Treasury ─────────────────────────────────────────────────────────────
  handlers['treasury'] = (userId, args) => {
    if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
    const sub = args[0]
    if (!sub) {
      const balances = treasury.getAllBalances()
      const lines = treasury.ALL_HOLDS.map(h => `${h}: ${balances[h]} Septims`)
      return reply(mp, store, userId, lines.join('\n'))
    }
    if (sub === 'balance') {
      const holdId = (args[1] || '').toLowerCase()
      if (!holdId) return reply(mp, store, userId, 'Usage: /treasury balance [holdId]')
      return reply(mp, store, userId, `${holdId} treasury: ${treasury.getBalance(holdId)} Septims`)
    }
    if (sub === 'withdraw') {
      if (!checkPermission(store, userId, 'leader')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[1] || '').toLowerCase()
      const amount = parseInt(args[2])
      if (!holdId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /treasury withdraw [holdId] [amount]')
      const player = store.get(userId)
      if (player && player.holdId !== holdId && !player.isStaff) return reply(mp, store, userId, `You can only withdraw from your own hold (${player.holdId}).`)
      const ok = treasury.withdraw(bus, holdId, amount)
      reply(mp, store, userId, ok ? `Withdrew ${amount} Septims from ${holdId} treasury.` : `Insufficient funds in ${holdId} treasury.`)
      return
    }
    if (sub === 'deposit') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const holdId = (args[1] || '').toLowerCase()
      const amount = parseInt(args[2])
      if (!holdId || !amount || amount <= 0) return reply(mp, store, userId, 'Usage: /treasury deposit [holdId] [amount]')
      treasury.deposit(bus, holdId, amount)
      reply(mp, store, userId, `Deposited ${amount} Septims into ${holdId} treasury.`)
      return
    }
    reply(mp, store, userId, 'Usage: /treasury | balance [holdId] | withdraw [holdId] [amount] | deposit [holdId] [amount]')
  }

  // ── Magic — skill dice ────────────────────────────────────────────────────
  handlers['skill-dice'] = (userId, args) => {
    magic.handleSkillDice(mp, store, bus, userId, args)
  }

  // ── Roleplay ──────────────────────────────────────────────────────────────
  handlers['setdescription'] = (userId, args) => {
    const player = store.get(userId)
    if (!player) return
    const text = args.join(' ').trim()
    if (!text) return reply(mp, store, userId, 'Usage: /description [text]')
    const saved = roleplay.setDescription(mp, player.actorId, text)
    reply(mp, store, userId, `Description set (${saved.length}/${roleplay.DESCRIPTION_MAX} chars).`)
  }

  handlers['description'] = handlers['setdescription']
  handlers['desc'] = handlers['setdescription']

  handlers['examine'] = (userId, args) => {
    const target = targetFromArgs(userId, args, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${args.join(' ')}" not found.`)
    const packet = roleplay.examinePlayer(mp, store, userId, target.id, { bounty, prison })
    if (!packet) return
    const lines = [
      `${packet.name} (${packet.race})`,
      packet.description,
    ]
    if (packet.warrant) {
      lines.push(`Warrant: ${packet.warrant.holdId} bounty ${packet.warrant.activeBounty}; priors ${packet.warrant.priors.length}`)
    }
    reply(mp, store, userId, lines.join('\n'))
    mp.sendCustomPacket(store.get(userId).actorId, 'examine', packet)
  }

  handlers['racemenu'] = (userId, args) => {
    const player = store.get(userId)
    if (!player) return
    if (args[0] === 'reset') {
      if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
      const target = targetFromArgs(userId, args.slice(1), { defaultSelf: true })
      if (!target) return reply(mp, store, userId, `Player "${args.slice(1).join(' ')}" not found.`)
      roleplay.resetRaceMenu(mp, target.actorId)
      reply(mp, store, userId, `Race menu reset for ${target.name}.`)
      return
    }
    const ok = roleplay.openRaceMenu(mp, player.actorId)
    if (!ok) reply(mp, store, userId, 'Your character is already set up. Contact staff to reset.')
  }

  // ── Role management (staff only) ─────────────────────────────────────────
  handlers['role'] = (userId, args) => {
    if (!checkPermission(store, userId, 'staff')) return reply(mp, store, userId, 'No permission.')
    if (args[0] !== 'set') return reply(mp, store, userId, 'Usage: /role set [name] player|leader|staff')
    const split = splitTargetAndTrailingArg(args.slice(1))
    const target = targetFromArgs(userId, split.targetArgs, { defaultSelf: true })
    if (!target) return reply(mp, store, userId, `Player "${split.targetArgs.join(' ')}" not found.`)
    const role = (split.value || '').toLowerCase()
    if (!['player', 'leader', 'staff'].includes(role)) return reply(mp, store, userId, 'Role must be: player, leader, or staff')
    const ok = permissions.setRole(mp, store, bus, target.id, role)
    if (!ok) return reply(mp, store, userId, 'Failed to set role.')
    reply(mp, store, userId, `${target.name} is now ${role}.`)
    reply(mp, store, target.id, `Your role has been set to ${role} by ${store.get(userId).name}.`)
  }

  // ── Chat commands ─────────────────────────────────────────────────────────
  handlers['whisper'] = (userId, args) => {
    const text = args.join(' ')
    if (!text) return reply(mp, store, userId, 'Usage: /whisper <message>')
    chatHelper.broadcastProximity(mp, store, userId, text, PROXIMITY_RANGE_WHISPER, 'whisper')
  }

  handlers['yell'] = (userId, args) => {
    const text = args.join(' ')
    if (!text) return reply(mp, store, userId, 'Usage: /yell <message>')
    chatHelper.broadcastProximity(mp, store, userId, text, PROXIMITY_RANGE_YELL, 'yell')
  }

  // ── Register customPacket handler ────────────────────────────────────────
  mp.on('customPacket', (userId, contentJson) => {
    try {
      const content = JSON.parse(contentJson)
      const type = content.customPacketType || ''
      if (type === 'lootSelection') {
        combat.completeLootSession(mp, store, bus, inv, userId, content)
      }
    } catch (err) {
      console.error(`[commands] Error handling packet from ${userId}: ${err.message}`)
    }
  })

  _handlers = handlers
  console.log(`[commands] Registered ${Object.keys(handlers).length} commands`)
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _findUserIdByName(store, name, currentUserId) {
  const player = resolvePlayerTarget(store, currentUserId, name)
  return player ? player.id : null
}

function _findStewardForProperty(store, housing, propertyId) {
  const prop = housing.getProperty(propertyId)
  if (!prop) return null
  // Look for an online leader in the same hold — simplified heuristic
  const candidates = store.getAll().filter(p => p.holdId === prop.holdId && p.isLeader)
  return candidates.length ? candidates[0].id : null
}

function _findJarlForHold(store, holdId) {
  // Look for online staff in the same hold as a Jarl proxy
  const candidates = store.getAll().filter(p => p.holdId === holdId && p.isLeader)
  return candidates.length ? candidates[0].id : null
}

module.exports = {
  parseCommand,
  findPlayer,
  resolvePlayerTarget,
  resolvePlayerTargetFromArgs,
  splitTargetAndTrailingArg,
  checkPermission,
  registerAll,
  dispatch,
}
