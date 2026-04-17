import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { HoldId, FactionId } from './types';
import { ALL_HOLDS } from './types';
import { registerCommand, sendFeedback, resolvePlayer } from './commands';
import { setPlayerRole, PlayerRole } from './permissions';
import { downPlayer, risePlayer } from './combat';
import { queueForSentencing, sentencePlayer, SentenceType } from './prison';
import { joinFaction, leaveFaction, setFactionRank } from './factions';
import { getTreasuryBalance, getAllTreasuryBalances, depositToTreasury, withdrawFromTreasury } from './treasury';

const VALID_ROLES: PlayerRole[] = ['player', 'leader', 'staff'];
const VALID_SENTENCE_TYPES: SentenceType[] = ['fine', 'release', 'banish'];
const VALID_FACTIONS: FactionId[] = [
  'imperialGarrison', 'fourthLegionAuxiliary', 'thalmor', 'companions',
  'collegeOfWinterhold', 'thievesGuild', 'bardsCollege', 'vigilants',
  'forsworn', 'stormcloakUnderground', 'eastEmpireCompany', 'confederationOfTemples',
];

export function initStaffCommands(mp: Mp, store: PlayerStore, bus: EventBus): void {

  // /arrest [name] [holdId] — leader
  registerCommand('arrest', 'leader', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const holdId = args[1] as HoldId;
    if (!ALL_HOLDS.includes(holdId)) {
      sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false);
      return;
    }
    const ok = queueForSentencing(mp, store, bus, targetId, holdId, playerId, playerId);
    const name = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `${name} arrested and queued for sentencing in ${holdId}.` : 'Could not arrest — player may already be queued.', ok);
  });

  // /sentence [name] [fine|release|banish] [amount?] — leader
  registerCommand('sentence', 'leader', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const type = args[1] as SentenceType;
    if (!VALID_SENTENCE_TYPES.includes(type)) {
      sendFeedback(mp, playerId, 'Usage: /sentence [name] [fine|release|banish] [amount?]', false);
      return;
    }
    let fineAmount: number | undefined;
    if (type === 'fine') {
      fineAmount = parseInt(args[2] ?? '', 10);
      if (isNaN(fineAmount) || fineAmount <= 0) {
        sendFeedback(mp, playerId, 'Specify a fine amount: /sentence [name] fine [amount]', false);
        return;
      }
    }
    const ok = sentencePlayer(mp, store, bus, targetId, playerId, { type, fineAmount });
    const name = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `${name} sentenced: ${type}.` : 'Player is not in the sentencing queue.', ok);
  });

  // /down [name] — leader
  registerCommand('down', 'leader', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const ok = downPlayer(mp, store, bus, targetId, playerId);
    const name = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `${name} has been downed.` : `${name} is already downed.`, ok);
  });

  // /rise [name] — leader
  registerCommand('rise', 'leader', ({ mp, store, bus, playerId, args }) => {
    const targetId = resolvePlayer(store, args[0] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const ok = risePlayer(mp, store, bus, targetId);
    const name = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, ok ? `${name} has risen.` : `${name} is not downed.`, ok);
  });

  // /role set [name] [role] — staff
  registerCommand('role', 'staff', ({ mp, store, bus, playerId, args }) => {
    if (args[0] !== 'set') {
      sendFeedback(mp, playerId, 'Usage: /role set [name] [player|leader|staff]', false);
      return;
    }
    const targetId = resolvePlayer(store, args[1] ?? '');
    if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
    const role = args[2] as PlayerRole;
    if (!VALID_ROLES.includes(role)) {
      sendFeedback(mp, playerId, 'Unknown role. Valid: player, leader, staff', false);
      return;
    }
    setPlayerRole(mp, targetId, role);
    bus.dispatch({
      type: 'roleChanged',
      payload: { targetId, role, changedBy: playerId },
      timestamp: Date.now(),
    });
    const name = store.get(targetId)?.name ?? 'Unknown';
    sendFeedback(mp, playerId, `${name}'s role set to ${role}.`);
  });

  // /faction add [name] [factionId]    — staff
  // /faction remove [name] [factionId] — staff
  // /faction rank [name] [factionId] [rank] — staff
  registerCommand('faction', 'staff', ({ mp, store, bus, playerId, args }) => {
    const sub = args[0];

    if (sub === 'add') {
      const targetId = resolvePlayer(store, args[1] ?? '');
      if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const factionId = args[2] as FactionId;
      if (!VALID_FACTIONS.includes(factionId)) {
        sendFeedback(mp, playerId, `Unknown faction. Valid: ${VALID_FACTIONS.join(', ')}`, false);
        return;
      }
      const ok = joinFaction(mp, store, bus, targetId, factionId);
      const name = store.get(targetId)?.name ?? 'Unknown';
      sendFeedback(mp, playerId, ok ? `${name} added to ${factionId}.` : `${name} is already a member.`, ok);

    } else if (sub === 'remove') {
      const targetId = resolvePlayer(store, args[1] ?? '');
      if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const factionId = args[2] as FactionId;
      if (!VALID_FACTIONS.includes(factionId)) {
        sendFeedback(mp, playerId, `Unknown faction. Valid: ${VALID_FACTIONS.join(', ')}`, false);
        return;
      }
      const ok = leaveFaction(mp, store, bus, targetId, factionId);
      const name = store.get(targetId)?.name ?? 'Unknown';
      sendFeedback(mp, playerId, ok ? `${name} removed from ${factionId}.` : `${name} is not a member.`, ok);

    } else if (sub === 'rank') {
      const targetId = resolvePlayer(store, args[1] ?? '');
      if (!targetId) { sendFeedback(mp, playerId, 'Player not found.', false); return; }
      const factionId = args[2] as FactionId;
      if (!VALID_FACTIONS.includes(factionId)) {
        sendFeedback(mp, playerId, `Unknown faction. Valid: ${VALID_FACTIONS.join(', ')}`, false);
        return;
      }
      const rank = parseInt(args[3] ?? '', 10);
      if (isNaN(rank) || rank < 0) {
        sendFeedback(mp, playerId, 'Usage: /faction rank [name] [factionId] [rank]', false);
        return;
      }
      const ok = setFactionRank(mp, store, bus, targetId, factionId, rank);
      const name = store.get(targetId)?.name ?? 'Unknown';
      sendFeedback(mp, playerId, ok ? `${name}'s rank in ${factionId} set to ${rank}.` : `${name} is not a member of ${factionId}.`, ok);

    } else {
      sendFeedback(mp, playerId, 'Usage: /faction add|remove|rank [name] [factionId] [rank?]', false);
    }
  });

  // /treasury view [holdId?]        — leader
  // /treasury deposit [holdId] [amount] — leader
  // /treasury withdraw [holdId] [amount] — leader
  registerCommand('treasury', 'leader', ({ mp, bus, playerId, args }) => {
    const sub = args[0];

    if (sub === 'view') {
      const holdId = args[1] as HoldId | undefined;
      if (holdId) {
        if (!ALL_HOLDS.includes(holdId)) {
          sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false);
          return;
        }
        const balance = getTreasuryBalance(mp, holdId);
        sendFeedback(mp, playerId, `${holdId} treasury: ${balance} Septims`);
      } else {
        const balances = getAllTreasuryBalances(mp);
        const lines = ALL_HOLDS.map(h => `${h}: ${balances[h]}`);
        sendFeedback(mp, playerId, 'Hold Treasuries:\n' + lines.join('\n'));
      }

    } else if (sub === 'deposit') {
      const holdId = args[1] as HoldId;
      if (!ALL_HOLDS.includes(holdId)) {
        sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false);
        return;
      }
      const amount = parseInt(args[2] ?? '', 10);
      if (isNaN(amount) || amount <= 0) {
        sendFeedback(mp, playerId, 'Amount must be a positive number.', false);
        return;
      }
      depositToTreasury(mp, bus, holdId, amount);
      sendFeedback(mp, playerId, `Deposited ${amount} Septims into ${holdId} treasury.`);

    } else if (sub === 'withdraw') {
      const holdId = args[1] as HoldId;
      if (!ALL_HOLDS.includes(holdId)) {
        sendFeedback(mp, playerId, `Unknown hold. Valid: ${ALL_HOLDS.join(', ')}`, false);
        return;
      }
      const amount = parseInt(args[2] ?? '', 10);
      if (isNaN(amount) || amount <= 0) {
        sendFeedback(mp, playerId, 'Amount must be a positive number.', false);
        return;
      }
      const ok = withdrawFromTreasury(mp, bus, holdId, amount);
      sendFeedback(mp, playerId, ok ? `Withdrew ${amount} Septims from ${holdId} treasury.` : 'Insufficient treasury funds.', ok);

    } else {
      sendFeedback(mp, playerId, 'Usage: /treasury view [hold?] | /treasury deposit [hold] [amount] | /treasury withdraw [hold] [amount]', false);
    }
  });
}
