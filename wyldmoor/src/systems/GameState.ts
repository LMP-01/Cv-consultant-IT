import { CreatureInstance } from './CreatureInstance.ts';

export interface BagContents {
  [itemId: string]: number;
}

export const STARTER_TOWN_MAP_ID = 'birchwood_hollow';

export class GameState {
  playerName = 'Kestrel';
  playerTeam: CreatureInstance[] = [];
  boxedCreatures: CreatureInstance[] = [];
  bag: BagContents = { snare_orb: 5, greater_snare_orb: 0, master_snare_orb: 0, herb_potion: 3, revival_root: 1 };
  flags = new Set<string>();
  wyldexSeen = new Set<number>();
  wyldexCaught = new Set<number>();
  currentMapId = STARTER_TOWN_MAP_ID;
  playerX = 8;
  playerY = 8;
  badges: string[] = [];
  playtimeSeconds = 0;

  get hasStarter(): boolean {
    return this.playerTeam.length > 0;
  }

  markSeen(speciesId: number): void {
    this.wyldexSeen.add(speciesId);
  }

  markCaught(speciesId: number): void {
    this.wyldexCaught.add(speciesId);
    this.wyldexSeen.add(speciesId);
  }

  addToParty(creature: CreatureInstance): boolean {
    if (this.playerTeam.length < 6) {
      this.playerTeam.push(creature);
      return true;
    }
    this.boxedCreatures.push(creature);
    return false;
  }

  useItem(itemId: string, amount = 1): boolean {
    if ((this.bag[itemId] ?? 0) < amount) return false;
    this.bag[itemId] -= amount;
    return true;
  }

  addItem(itemId: string, amount = 1): void {
    this.bag[itemId] = (this.bag[itemId] ?? 0) + amount;
  }

  healParty(): void {
    for (const creature of this.playerTeam) creature.fullHeal();
  }

  get partyWiped(): boolean {
    return this.playerTeam.length > 0 && this.playerTeam.every((c) => c.isFainted);
  }
}
