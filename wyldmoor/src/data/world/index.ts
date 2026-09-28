import type { MapDef } from '../mapSchema.ts';
import { BIRCHWOOD_HOLLOW } from './birchwoodHollow.ts';
import { ROUTE_1 } from './route1.ts';
import { MOSSREED_VILLAGE } from './mossreedVillage.ts';
import { ROUTE_2 } from './route2.ts';
import { HARROW_RIDGE } from './harrowRidge.ts';
import { ROUTE_3 } from './route3.ts';
import { TIDALMERE_TOWN } from './tidalmereTown.ts';
import { ROUTE_4 } from './route4.ts';
import { WINDLE_HAMLET } from './windleHamlet.ts';
import { ROUTE_5 } from './route5.ts';
import { STONECRAG_CITY } from './stonecragCity.ts';
import { ROUTE_6 } from './route6.ts';
import { FENMOOR_CROSSING } from './fenmoorCrossing.ts';
import { ROUTE_7 } from './route7.ts';
import { FROSTGALE_PASS } from './frostgalePass.ts';
import { ROUTE_8 } from './route8.ts';
import { HOLLOWMERE_VILLAGE } from './hollowmereVillage.ts';
import { ROUTE_9 } from './route9.ts';
import { ALDENMOOR_ABBEY } from './aldenmoorAbbey.ts';
import { ROUTE_10 } from './route10.ts';
import { WYRMSPIRE_HEIGHTS } from './wyrmspireHeights.ts';
import { ROUTE_11 } from './route11.ts';
import { WYLDMOOR_PLATEAU } from './wyldmoorPlateau.ts';

export const MAPS: Record<string, MapDef> = {
  [BIRCHWOOD_HOLLOW.id]: BIRCHWOOD_HOLLOW,
  [ROUTE_1.id]: ROUTE_1,
  [MOSSREED_VILLAGE.id]: MOSSREED_VILLAGE,
  [ROUTE_2.id]: ROUTE_2,
  [HARROW_RIDGE.id]: HARROW_RIDGE,
  [ROUTE_3.id]: ROUTE_3,
  [TIDALMERE_TOWN.id]: TIDALMERE_TOWN,
  [ROUTE_4.id]: ROUTE_4,
  [WINDLE_HAMLET.id]: WINDLE_HAMLET,
  [ROUTE_5.id]: ROUTE_5,
  [STONECRAG_CITY.id]: STONECRAG_CITY,
  [ROUTE_6.id]: ROUTE_6,
  [FENMOOR_CROSSING.id]: FENMOOR_CROSSING,
  [ROUTE_7.id]: ROUTE_7,
  [FROSTGALE_PASS.id]: FROSTGALE_PASS,
  [ROUTE_8.id]: ROUTE_8,
  [HOLLOWMERE_VILLAGE.id]: HOLLOWMERE_VILLAGE,
  [ROUTE_9.id]: ROUTE_9,
  [ALDENMOOR_ABBEY.id]: ALDENMOOR_ABBEY,
  [ROUTE_10.id]: ROUTE_10,
  [WYRMSPIRE_HEIGHTS.id]: WYRMSPIRE_HEIGHTS,
  [ROUTE_11.id]: ROUTE_11,
  [WYLDMOOR_PLATEAU.id]: WYLDMOOR_PLATEAU,
};

export function getMapDef(id: string): MapDef {
  const found = MAPS[id];
  if (!found) throw new Error(`Unknown map id: ${id}`);
  return found;
}
