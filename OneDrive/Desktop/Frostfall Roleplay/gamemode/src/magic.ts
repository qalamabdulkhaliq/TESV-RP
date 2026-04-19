import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId, SkillId } from './types';
import { sendPacket } from './skymp';
import { addSkillXp, getSkillXp, getSkillLevel } from './skills';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCHOOLS: SkillId[] = [
  'destruction', 'restoration', 'alteration', 'illusion', 'conjuration',
];

const XP_ON_CAST = 3;
const XP_ON_ROLL = 5;

const DETECT_LIFE_RANGE = 3000; // game units

// ---------------------------------------------------------------------------
// Spell formId → school map (base-game spells only)
// ---------------------------------------------------------------------------

function _buildSpellSchoolMap(): Map<number, SkillId> {
  const map = new Map<number, SkillId>();
  const bySchool: Partial<Record<SkillId, number[]>> = {
    destruction: [
      0x00012FD0, 0x00012FD1, 0x00012FD2, 0x0001C789, 0x0001CDEC, 0x0001CEDF,
      0x0001C88B, 0x000211EE, 0x0007E8DC, 0x0007E8DD, 0x0007E8DE, 0x0007E8DF,
      0x0007E8E0, 0x0002DD29, 0x0002DD2B,
    ],
    restoration: [
      0x00012FD3, 0x0003CDA6, 0x0003CDA7, 0x0003CDA8, 0x00012FD4, 0x0002F3B8,
      0x00042FAA, 0x0004E940, 0x000B62EF, 0x000B62F0, 0x000B62F1, 0x000A879D,
    ],
    alteration: [
      0x00012FD5, 0x0005AD5C, 0x0005AD5E, 0x0005AD5F, 0x0005AD60, 0x0001A4CC,
      0x00043324, 0x0001A4CD, 0x0002ACD3, 0x00021143, 0x0007E8E1, 0x000211F1,
      0x00045F96,
    ],
    illusion: [
      0x00021192, 0x00021193, 0x00021194, 0x0002FF24, 0x00021195, 0x000211AD,
      0x000211AE, 0x000211AF, 0x000211B1, 0x0004DEED, 0x0004DEEE, 0x00031666,
      0x00031668, 0x00021198,
    ],
    conjuration: [
      0x000204C3, 0x0001DAD4, 0x0001DAD5, 0x0001DAD6, 0x000204BB, 0x000B62DC,
      0x000B45F5, 0x000B45F6, 0x000B45F7, 0x00045F99, 0x00045F9A, 0x00045F9B,
      0x000204C4, 0x000640B6, 0x000A26E0,
    ],
  };
  for (const [school, ids] of Object.entries(bySchool)) {
    for (const id of ids!) map.set(id, school as SkillId);
  }
  return map;
}

export const SPELL_SCHOOL = _buildSpellSchoolMap();

// Detect Life / Detect Dead — Alteration, but also trigger a special response
const DETECT_LIFE_SPELLS = new Set([0x0001A4CD, 0x0002ACD3]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _dist3d(a: number[], b: number[]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function _holdBroadcast(mp: Mp, store: PlayerStore, userId: PlayerId, text: string): void {
  const player = store.get(userId);
  if (!player) return;
  const targets = store.getAll().filter(p => !player.holdId || p.holdId === player.holdId);
  for (const t of targets) sendPacket(mp, t.id, 'chatMessage', { text });
}

function _handleDetectLife(mp: Mp, store: PlayerStore, userId: PlayerId): void {
  const caster = store.get(userId);
  if (!caster) return;
  const casterPos = mp.get(caster.actorId, 'pos') as number[] | null;
  if (!casterPos) return;

  const nearby = store.getAll()
    .filter(p => {
      if (p.id === userId) return false;
      const pos = mp.get(p.actorId, 'pos') as number[] | null;
      return pos && _dist3d(casterPos, pos) <= DETECT_LIFE_RANGE;
    })
    .map(p => ({ name: p.name }));

  sendPacket(mp, userId, 'detectLifeResult', { nearby });
}

// ---------------------------------------------------------------------------
// /skill-dice command handler
// ---------------------------------------------------------------------------

export function handleSkillDice(
  mp: Mp,
  store: PlayerStore,
  _bus: EventBus,
  userId: PlayerId,
  args: string[],
): void {
  const action = (args[0] ?? '').toLowerCase();
  if (!action) return;
  const player = store.get(userId);
  if (!player) return;

  if (action === 'init') {
    const skillData: Partial<Record<SkillId, { level: number }>> = {};
    for (const school of SCHOOLS) {
      const xp = getSkillXp(mp, userId, school);
      skillData[school] = { level: getSkillLevel(xp) };
    }
    sendPacket(mp, userId, 'skillDiceInit', { skills: skillData, weapons: [], armor: null });
    return;
  }

  if (action === 'wolf' || action === 'vampus') {
    const on = args[1] === 'on';
    const form = action === 'wolf' ? 'werewolf' : 'vampire lord';
    _holdBroadcast(mp, store, userId,
      `★ ${player.name} ${on ? 'shifts into' : 'reverts from'} ${form} form`);
    return;
  }

  if (action === 'heal' || action === 'self-attack') {
    const hp = parseInt(args[1] ?? '', 10) || 0;
    const msg = action === 'heal'
      ? `★ ${player.name} tends their wounds [HP: ${hp}/5]`
      : `★ ${player.name} takes a wound [HP: ${hp}/5]`;
    _holdBroadcast(mp, store, userId, msg);
    return;
  }

  // initiative / weapon / magic / defence rolls
  const type  = args[1] ?? null;
  const value = parseInt(args[2] ?? '', 10) || 0;
  const buff  = parseInt(args[3] ?? '', 10) || 0;
  const buffStr = buff !== 0 ? ` (${buff > 0 ? '+' : ''}${buff})` : '';
  const label   = type ?? action;
  _holdBroadcast(mp, store, userId, `★ ${player.name} — ${label}: ${value}${buffStr}`);

  if (action === 'magic' && type && (SCHOOLS as string[]).includes(type)) {
    addSkillXp(mp, store, userId, type as SkillId, XP_ON_ROLL);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initMagic(mp: Mp, store: PlayerStore, _bus: EventBus): void {
  console.log('[Magic] Initializing');

  // Papyrus event — property assignment verified against ScampServerListener.cpp.
  // spellArg arrives as { type, desc }; use mp.getIdFromDesc to get the numeric formId.
  (mp as unknown as Record<string, unknown>)['onPapyrusEvent:OnSpellCast'] =
    (casterActorId: number, spellArg: { desc?: string } | null) => {
      const userId = mp.getUserByActor(casterActorId);
      if (!userId || !store.get(userId)) return; // NPC cast

      const spellFormId = spellArg?.desc
        ? (mp as unknown as { getIdFromDesc(d: string): number }).getIdFromDesc(spellArg.desc)
        : null;
      if (spellFormId === null) return;

      if (DETECT_LIFE_SPELLS.has(spellFormId)) {
        _handleDetectLife(mp, store, userId);
      }

      const school = SPELL_SCHOOL.get(spellFormId);
      if (school) addSkillXp(mp, store, userId, school, XP_ON_CAST);
    };

  console.log('[Magic] Ready');
}
