import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';
import type { PlayerRole } from './permissions';
import { hasPermission } from './permissions';
import { sendChatMessage } from './chat';
import { sendPacket } from './skymp';

export interface CommandContext {
  mp: Mp;
  store: PlayerStore;
  bus: EventBus;
  playerId: PlayerId;
  args: string[];
}

export type CommandHandler = (ctx: CommandContext) => void;

interface CommandEntry {
  permission: PlayerRole;
  handler: CommandHandler;
}

const registry = new Map<string, CommandEntry>();

export function registerCommand(
  name: string,
  permission: PlayerRole,
  handler: CommandHandler,
): void {
  registry.set(name.toLowerCase(), { permission, handler });
}

export function _clearRegistry(): void {
  registry.clear();
}

export function parseMessage(message: string): { command: string; args: string[] } | null {
  if (!message.startsWith('/')) return null;
  const parts = message.slice(1).trim().split(/\s+/);
  if (!parts[0]) return null;
  return { command: parts[0].toLowerCase(), args: parts.slice(1) };
}

export function resolvePlayer(store: PlayerStore, name: string): PlayerId | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const match = store.getAll().find(p => p.name.toLowerCase() === lower);
  return match ? match.id : null;
}

export function sendFeedback(mp: Mp, playerId: PlayerId, message: string, success = true): void {
  sendChatMessage(mp, playerId, message);
  sendPacket(mp, playerId, 'commandFeedback', { message, success });
}

export function getCommandNames(mp: Mp, playerId: PlayerId): string[] {
  return [...registry.entries()]
    .filter(([, entry]) => hasPermission(mp, playerId, entry.permission))
    .map(([name]) => `/${name}`)
    .sort();
}

export function dispatchCommand(
  mp: Mp,
  store: PlayerStore,
  bus: EventBus,
  playerId: PlayerId,
  message: string,
): void {
  const parsed = parseMessage(message);
  if (!parsed) return;

  const entry = registry.get(parsed.command);
  if (!entry) {
    sendFeedback(mp, playerId, `Unknown command: /${parsed.command}`, false);
    return;
  }

  if (!hasPermission(mp, playerId, entry.permission)) {
    sendFeedback(mp, playerId, 'You do not have permission to use this command.', false);
    return;
  }

  entry.handler({ mp, store, bus, playerId, args: parsed.args });
}
