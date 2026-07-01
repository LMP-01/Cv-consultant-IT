export type TileCode =
  | '.' // path, walkable, no encounters
  | ',' // short grass, walkable, low encounter rate
  | '"' // tall grass, walkable, high encounter rate
  | '~' // water, impassable without a future surf ability
  | '#' // tree, impassable
  | '^' // rock, impassable
  | 'B' // building wall, impassable
  | 'D' // door / building entrance, walkable, triggers warp if a Warp is registered at this cell
  | 'F' // fence, impassable
  | 'S' // sand, walkable, no encounters
  | 'b' // bridge over water, walkable
  | 'G' // gym entrance, walkable, triggers gym warp
  | ' '; // void, impassable (outside playable area)

export interface Warp {
  x: number;
  y: number;
  toMapId: string;
  spawnX: number;
  spawnY: number;
  spawnFacing?: Facing;
}

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface EncounterEntry {
  speciesId: number;
  minLevel: number;
  maxLevel: number;
  /** Relative weight for random selection within this map's encounter table. */
  weight: number;
}

export interface NpcTeamMember {
  speciesId: number;
  level: number;
}

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  facing: Facing;
  name: string;
  sprite: 'youth' | 'hiker' | 'lass' | 'fisher' | 'scientist' | 'elder' | 'ranger' | 'gymLeader' | 'rival' | 'villain' | 'professor';
  dialogue: string[];
  /** If present, talking to this NPC triggers a trainer battle once (per save) using this team. */
  team?: NpcTeamMember[];
  /** Dialogue shown after the battle is won, if `team` is present. */
  postBattleDialogue?: string[];
  /** Story flag required for this NPC to appear/be active at all. */
  requiresFlag?: string;
  /** Story flag required for this NPC to be considered already defeated/done. */
  doneFlag?: string;
  /** Story flag set once this NPC's dialogue/battle has been completed. */
  setFlagOnComplete?: string;
  givesItem?: string;
}

export interface GymDef {
  leaderName: string;
  leaderNpcId: string;
  badgeName: string;
  team: NpcTeamMember[];
  flagOnDefeat: string;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Array of row-strings, each exactly `width` TileCode characters long, top row first (y=0). */
  tiles: string[];
  warps: Warp[];
  encounters: EncounterEntry[];
  npcs: NpcDef[];
  gym?: GymDef;
  /** Ambient light/fog tint for this map's mood, as a hex string. */
  skyColor: string;
  groundColor: string;
}
