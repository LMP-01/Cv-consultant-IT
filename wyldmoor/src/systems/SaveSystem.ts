import { GameState } from './GameState.ts';
import { CreatureInstance } from './CreatureInstance.ts';
import type { StatusAilment } from '../data/moves.ts';

const SAVE_KEY = 'wyldmoor.save.v1';

interface SerializedCreature {
  speciesId: number;
  nickname: string;
  level: number;
  xp: number;
  ivs: CreatureInstance['ivs'];
  currentHp: number;
  moves: CreatureInstance['moves'];
  status?: StatusAilment;
}

interface SerializedState {
  playerName: string;
  playerTeam: SerializedCreature[];
  boxedCreatures: SerializedCreature[];
  bag: Record<string, number>;
  flags: string[];
  wyldexSeen: number[];
  wyldexCaught: number[];
  currentMapId: string;
  playerX: number;
  playerY: number;
  badges: string[];
  playtimeSeconds: number;
}

function serializeCreature(c: CreatureInstance): SerializedCreature {
  return {
    speciesId: c.speciesId,
    nickname: c.nickname,
    level: c.level,
    xp: c.xp,
    ivs: c.ivs,
    currentHp: c.currentHp,
    moves: c.moves.map((m) => ({ ...m })),
    status: c.status,
  };
}

function deserializeCreature(s: SerializedCreature): CreatureInstance {
  const instance = new CreatureInstance(s.speciesId, s.level, { ivs: s.ivs });
  instance.nickname = s.nickname;
  instance.xp = s.xp;
  instance.currentHp = s.currentHp;
  instance.moves = s.moves.map((m) => ({ ...m }));
  instance.status = s.status;
  return instance;
}

export function saveGame(state: GameState): void {
  const data: SerializedState = {
    playerName: state.playerName,
    playerTeam: state.playerTeam.map(serializeCreature),
    boxedCreatures: state.boxedCreatures.map(serializeCreature),
    bag: state.bag,
    flags: Array.from(state.flags),
    wyldexSeen: Array.from(state.wyldexSeen),
    wyldexCaught: Array.from(state.wyldexCaught),
    currentMapId: state.currentMapId,
    playerX: state.playerX,
    playerY: state.playerY,
    badges: state.badges,
    playtimeSeconds: state.playtimeSeconds,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function hasSaveGame(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SerializedState;
    const state = new GameState();
    state.playerName = data.playerName;
    state.playerTeam = data.playerTeam.map(deserializeCreature);
    state.boxedCreatures = data.boxedCreatures.map(deserializeCreature);
    state.bag = data.bag;
    state.flags = new Set(data.flags);
    state.wyldexSeen = new Set(data.wyldexSeen);
    state.wyldexCaught = new Set(data.wyldexCaught);
    state.currentMapId = data.currentMapId;
    state.playerX = data.playerX;
    state.playerY = data.playerY;
    state.badges = data.badges;
    state.playtimeSeconds = data.playtimeSeconds;
    return state;
  } catch {
    return null;
  }
}

export function deleteSaveGame(): void {
  localStorage.removeItem(SAVE_KEY);
}
