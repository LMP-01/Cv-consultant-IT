export type ItemCategory = 'snare' | 'healing' | 'key';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** For snare items: multiplier applied to the capture roll. */
  snareMultiplier?: number;
  /** For healing items: HP restored (fraction of max if `healFraction`, else flat amount). */
  healAmount?: number;
  healFraction?: number;
  /** Cures status ailments when used. */
  curesStatus?: boolean;
  /** Revives a fainted creature to this HP fraction instead of healing a conscious one. */
  revives?: boolean;
  buyPrice: number;
}

export const ITEMS: Record<string, ItemDef> = {
  snare_orb: { id: 'snare_orb', name: 'Orbe de Capture', category: 'snare', description: 'Un orbe basique pour tenter de capturer un Wylde sauvage.', snareMultiplier: 1, buyPrice: 200 },
  greater_snare_orb: { id: 'greater_snare_orb', name: 'Orbe de Capture+', category: 'snare', description: 'Un orbe amélioré, plus efficace que le modèle basique.', snareMultiplier: 1.8, buyPrice: 600 },
  master_snare_orb: { id: 'master_snare_orb', name: 'Orbe Suprême', category: 'snare', description: 'Un orbe rarissime qui capture à coup sûr.', snareMultiplier: 255, buyPrice: 0 },
  herb_potion: { id: 'herb_potion', name: 'Potion d’Herbes', category: 'healing', description: 'Restaure 20 PV à un Wylde.', healAmount: 20, buyPrice: 300 },
  greater_herb_potion: { id: 'greater_herb_potion', name: 'Potion d’Herbes+', category: 'healing', description: 'Restaure 60 PV à un Wylde.', healAmount: 60, buyPrice: 700 },
  full_bloom_potion: { id: 'full_bloom_potion', name: 'Potion Pleine Fleur', category: 'healing', description: 'Restaure tous les PV d’un Wylde.', healFraction: 1, buyPrice: 1500 },
  purifying_leaf: { id: 'purifying_leaf', name: 'Feuille Purifiante', category: 'healing', description: 'Soigne tous les problèmes de statut d’un Wylde.', curesStatus: true, buyPrice: 400 },
  revival_root: { id: 'revival_root', name: 'Racine de Réveil', category: 'healing', description: 'Ranime un Wylde hors de combat avec la moitié de ses PV.', revives: true, healFraction: 0.5, buyPrice: 2000 },
};

export function getItem(id: string): ItemDef {
  const item = ITEMS[id];
  if (!item) throw new Error(`Unknown item id: ${id}`);
  return item;
}
