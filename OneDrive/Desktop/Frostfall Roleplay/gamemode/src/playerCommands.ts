import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { SkillId, HoldId } from './types';
import { SKILL_IDS, ALL_HOLDS } from './types';
import { registerCommand, sendFeedback, resolvePlayer } from './commands';
import { hasPermission } from './permissions';
import { startLecture, joinLecture, endLecture } from './college';
import { startTraining, joinTraining, endTraining } from './training';
import { getSkillXp, getSkillCap, getSkillLevel } from './skills';
import { transferGold } from './economy';
import { getAllBounties, addBounty, clearBounty } from './bounty';
import { capturePlayer, releasePlayer } from './captivity';
import { requestProperty, getPropertiesByHold, approveProperty, denyProperty, summonProperty, setPropertyPrice } from './housing';

export function initPlayerCommands(mp: Mp, store: PlayerStore, bus: EventBus): void {

  // /lecture start | /lecture join [name] | /lecture end
  registerCommand('lecture', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];
    if (sub === 'start') {
      const ok = startLecture(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Lecture started.' : 'You already have an active lecture.', ok);
    } else if (sub === 'join') {
      const lecturerId = resolvePlayer(store, args[1] ?? '');
      if (!lecturerId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const ok = joinLecture(mp, store, bus, playerId, lecturerId);
      sendFeedback(mp, playerId, ok ? 'You joined the lecture.' : 'Could not join lecture.', ok);
    } else if (sub === 'end') {
      const ok = endLecture(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Lecture ended.' : 'No active lecture.', ok);
    } else {
      sendFeedback(mp, playerId, 'Usage: /lecture start | /lecture join [name] | /lecture end', false);
    }
  });

  // /train start [skillId] | /train join [name] | /train end
  registerCommand('train', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];
    if (sub === 'start') {
      const skillId = args[1] as SkillId;
      if (!(SKILL_IDS as readonly string[]).includes(skillId)) {
        sendFeedback(mp, playerId, `Unknown skill. Valid: ${SKILL_IDS.join(', ')}`, false);
        return;
      }
      const ok = startTraining(mp, store, bus, playerId, skillId);
      sendFeedback(mp, playerId, ok ? `Training session started for ${skillId}.` : 'You already have an active session.', ok);
    } else if (sub === 'join') {
      const trainerId = resolvePlayer(store, args[1] ?? '');
      if (!trainerId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const ok = joinTraining(mp, store, bus, playerId, trainerId);
      sendFeedback(mp, playerId, ok ? 'You joined the training session.' : 'Could not join. Check you are close enough.', ok);
    } else if (sub === 'end') {
      const ok = endTraining(mp, store, bus, playerId);
      sendFeedback(mp, playerId, ok ? 'Training session ended.' : 'No active session.', ok);
    } else {
      sendFeedback(mp, playerId, 'Usage: /train start [skill] | /train join [name] | /train end', false);
    }
  });

  // /skill | /skill [skillId]
  registerCommand('skill', 'player', ({ mp, store, playerId, args }) => {
    const skillId = args[0] as SkillId | undefined;
    if (skillId && !(SKILL_IDS as readonly string[]).includes(skillId)) {
      sendFeedback(mp, playerId, `Unknown skill. Valid: ${SKILL_IDS.join(', ')}`, false);
      return;
    }
    const skills = (skillId ? [skillId] : [...SKILL_IDS]) as SkillId[];
    const lines = skills.map(s => {
      const xp  = getSkillXp(mp, playerId, s);
      const lvl = getSkillLevel(xp);
      const cap = getSkillCap(mp, store, playerId, s);
      return `${s}: level ${lvl} (${xp}/${cap} XP)`;
    });
    sendFeedback(mp, playerId, lines.join('\n'));
  });

  // /pay [amount] [playerName]
  registerCommand('pay', 'player', ({ mp, store, playerId, args }) => {
    const amount = parseInt(args[0] ?? '', 10);
    if (isNaN(amount) || amount <= 0) {
      sendFeedback(mp, playerId, 'Usage: /pay [amount] [player]', false);
      return;
    }
    const targetId = resolvePlayer(store, args[1] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    if (targetId === playerId) { sendFeedback(mp, playerId, 'You cannot pay yourself.', false); return; }
    const ok = transferGold(mp, store, playerId, targetId, amount);
    const targetName = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `Paid ${amount} Septims to ${targetName}.` : 'Insufficient funds.', ok);
  });

  // /bounty — self-check (player)
  // /bounty add [name] [holdId] [amount] — staff only
  // /bounty clear [name] [holdId] — staff only
  registerCommand('bounty', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];

    if (sub === 'add') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const targetId = resolvePlayer(store, args[1] ?? '');
      if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const holdId = args[2] as HoldId;
      if (!ALL_HOLDS.includes(holdId)) { sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false); return; }
      const amount = parseInt(args[3] ?? '', 10);
      if (isNaN(amount) || amount <= 0) { sendFeedback(mp, playerId, 'Amount must be a positive number.', false); return; }
      const ok = addBounty(mp, store, bus, targetId, holdId, amount);
      sendFeedback(mp, playerId, ok ? `Bounty added: ${amount} in ${holdId}.` : 'Could not add bounty.', ok);

    } else if (sub === 'clear') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const targetId = resolvePlayer(store, args[1] ?? '');
      if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const holdId = args[2] as HoldId;
      if (!ALL_HOLDS.includes(holdId)) { sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false); return; }
      const ok = clearBounty(mp, store, bus, targetId, holdId);
      sendFeedback(mp, playerId, ok ? `Bounty cleared in ${holdId}.` : 'No bounty to clear.', ok);

    } else {
      const bounties = getAllBounties(mp, store, playerId);
      if (bounties.length === 0) {
        sendFeedback(mp, playerId, 'You have no active bounties.');
        return;
      }
      const lines = bounties.map(b => `${b.holdId}: ${b.amount} Septims`);
      sendFeedback(mp, playerId, 'Your bounties:\n' + lines.join('\n'));
    }
  });

  // /capture [playerName]
  registerCommand('capture', 'player', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const target = store.get(targetId);
    if (!target?.isDown) {
      sendFeedback(mp, playerId, 'Target must be downed first.', false);
      return;
    }
    capturePlayer(mp, store, bus, targetId, playerId);
    sendFeedback(mp, playerId, `${target.name} is now your captive.`);
  });

  // /release [playerName]
  registerCommand('release', 'player', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const target = store.get(targetId);
    if (!target?.isCaptive) {
      sendFeedback(mp, playerId, 'That player is not captive.', false);
      return;
    }
    releasePlayer(mp, store, bus, targetId);
    sendFeedback(mp, playerId, `${target.name} has been released.`);
  });

  // /property list | /property request [id] — player
  // /property approve|summon|deny [id] | /property setprice [id] [amount] — staff only
  registerCommand('property', 'player', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];

    if (sub === 'approve') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const propertyId = args[1];
      if (!propertyId) { sendFeedback(mp, playerId, 'Usage: /property approve [id]', false); return; }
      const ok = approveProperty(mp, store, bus, propertyId, playerId);
      sendFeedback(mp, playerId, ok ? `${propertyId} approved.` : 'No pending request for that property.', ok);

    } else if (sub === 'summon') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const propertyId = args[1];
      if (!propertyId) { sendFeedback(mp, playerId, 'Usage: /property summon [id]', false); return; }
      const ok = summonProperty(mp, store, bus, propertyId, playerId);
      sendFeedback(mp, playerId, ok ? 'Player summoned for hearing.' : 'No pending request for that property.', ok);

    } else if (sub === 'deny') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const propertyId = args[1];
      if (!propertyId) { sendFeedback(mp, playerId, 'Usage: /property deny [id]', false); return; }
      const ok = denyProperty(mp, propertyId);
      sendFeedback(mp, playerId, ok ? `${propertyId} request denied.` : 'No pending request for that property.', ok);

    } else if (sub === 'setprice') {
      if (!hasPermission(mp, playerId, 'staff')) {
        sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
        return;
      }
      const propertyId = args[1];
      const price = parseInt(args[2] ?? '', 10);
      if (!propertyId || isNaN(price) || price < 0) {
        sendFeedback(mp, playerId, 'Usage: /property setprice [id] [amount]', false);
        return;
      }
      const ok = setPropertyPrice(mp, propertyId, price);
      sendFeedback(mp, playerId, ok ? `Price set to ${price} Septims.` : 'Property not found.', ok);

    } else if (sub === 'list') {
      const player = store.get(playerId);
      if (!player?.holdId) {
        sendFeedback(mp, playerId, 'Your hold is not assigned. Speak to a guard.', false);
        return;
      }
      const available = getPropertiesByHold(player.holdId).filter(p => !p.ownerId && !p.pendingRequestBy);
      if (available.length === 0) {
        sendFeedback(mp, playerId, 'No available properties in this hold.');
        return;
      }
      sendFeedback(mp, playerId, available.map(p => `${p.id} (${p.type})`).join('\n'));

    } else if (sub === 'request') {
      const propertyId = args[1];
      if (!propertyId) {
        sendFeedback(mp, playerId, 'Usage: /property request [id]', false);
        return;
      }
      const ok = requestProperty(mp, store, bus, playerId, propertyId, 0);
      sendFeedback(mp, playerId, ok ? 'Request submitted. The Steward has been notified.' : 'That property is unavailable.', ok);

    } else {
      sendFeedback(mp, playerId, 'Usage: /property list | /property request [id]', false);
    }
  });
}
