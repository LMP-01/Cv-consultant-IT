import type { MapDef } from '../mapSchema.ts';
import { BIRCHWOOD_HOLLOW } from './birchwoodHollow.ts';

export const MAPS: Record<string, MapDef> = {
  [BIRCHWOOD_HOLLOW.id]: BIRCHWOOD_HOLLOW,
};

export function getMapDef(id: string): MapDef {
  const found = MAPS[id];
  if (!found) throw new Error(`Unknown map id: ${id}`);
  return found;
}
