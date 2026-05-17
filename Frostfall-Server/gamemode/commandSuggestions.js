'use strict'

const COMMANDS = [
  { name: '/say', usage: '/say <message>', group: 'rp', role: 'player' },
  { name: '/me', usage: '/me <action>', group: 'rp', role: 'player' },
  { name: '/do', usage: '/do <scene detail>', group: 'rp', role: 'player' },
  { name: '/pm', usage: '/pm <name> <message>', group: 'rp', role: 'player' },
  { name: '/r', usage: '/r <message>', group: 'rp', role: 'player' },
  { name: '/b', usage: '/b <local OOC>', group: 'rp', role: 'player' },
  { name: '/looc', usage: '/looc <local OOC>', group: 'rp', role: 'player' },
  { name: '/f', usage: '/f <faction message>', group: 'rp', role: 'player' },
  { name: '/ame', usage: '/ame <short action>', group: 'rp', role: 'player' },
  { name: '/report', usage: '/report <message>', group: 'staff', role: 'player' },
  { name: '/skillsmenu', usage: '/skillsmenu', group: 'skills', role: 'player' },
  { name: '/names', usage: '/names [range]', group: 'rp', role: 'player' },
  { name: '/handsup', usage: '/handsup [off]', group: 'interaction', role: 'player' },
  { name: '/cuff', usage: '/cuff <player>', group: 'interaction', role: 'player' },
  { name: '/uncuff', usage: '/uncuff <player>', group: 'interaction', role: 'player' },
  { name: '/search', usage: '/search <player>', group: 'interaction', role: 'player' },
  { name: '/carry', usage: '/carry <player>', group: 'interaction', role: 'player' },
  { name: '/treat', usage: '/treat <player> [bandage]', group: 'medical', role: 'player' },
  { name: '/gold', usage: '/gold', group: 'economy', role: 'player' },
  { name: '/pay', usage: '/pay <amount> <name>', group: 'economy', role: 'player' },
  { name: '/production', usage: '/production list|work|sell ...', group: 'economy', role: 'player' },
  { name: '/property', usage: '/property list|request|approve|deny|revoke ...', group: 'economy', role: 'player' },
  { name: '/cart', usage: '/cart create|list|load|unload|probe ...', group: 'transport', role: 'player' },
  { name: '/reports', usage: '/reports', group: 'staff', role: 'staff' },
  { name: '/role', usage: '/role set <name> player|leader|staff', group: 'staff', role: 'staff' },
  { name: '/pve', usage: '/pve wildlife|dungeon ...', group: 'staff', role: 'staff' },
  { name: '/alpha', usage: '/alpha plugin|papyrus|ui', group: 'staff', role: 'staff' },
]

function canUse(command, role) {
  if (command.role !== 'staff') return true
  return role === 'staff' || role === 'leader'
}

function suggest(input, role) {
  if (!input || input[0] !== '/') return []
  const query = input.toLowerCase()
  return COMMANDS
    .filter(command => canUse(command, role || 'player'))
    .filter(command => command.name.indexOf(query) === 0)
    .slice(0, 8)
}

module.exports = { COMMANDS, suggest }
