// Données du restaurant de démonstration « Trattoria Nonna Rosa » (fictif).

export type Tag = 'veg' | 'gf';

export interface Dish {
  id: string;
  name: string;
  desc: string;
  price: number;
  tags?: Tag[];
  /** false = non disponible à emporter (vins au verre, etc.) */
  takeaway?: boolean;
}

export interface Category {
  id: string;
  name: string;
  dishes: Dish[];
}

export const MENU: Category[] = [
  {
    id: 'antipasti',
    name: 'Antipasti',
    dishes: [
      { id: 'burrata', name: 'Burrata des Pouilles', desc: 'Tomates anciennes, basilic, huile d’olive de Sicile', price: 13, tags: ['veg', 'gf'] },
      { id: 'vitello', name: 'Vitello tonnato', desc: 'Veau rosé, sauce au thon, câpres', price: 14, tags: ['gf'] },
      { id: 'arancini', name: 'Arancini', desc: 'Trois boulettes de risotto, cœur de mozzarella', price: 9, tags: ['veg'] },
      { id: 'tagliere', name: 'Tagliere misto', desc: 'Charcuteries et fromages italiens, pour deux', price: 19 }
    ]
  },
  {
    id: 'pizze',
    name: 'Pizze',
    dishes: [
      { id: 'margherita', name: 'Margherita', desc: 'Tomate San Marzano, fior di latte, basilic', price: 12, tags: ['veg'] },
      { id: 'diavola', name: 'Diavola', desc: 'Tomate, mozzarella, salame piquant', price: 14 },
      { id: 'quattro', name: 'Quattro formaggi', desc: 'Mozzarella, gorgonzola, taleggio, parmesan', price: 15, tags: ['veg'] },
      { id: 'rosa', name: 'La Nonna', desc: 'Crème de truffe, champignons, jambon de Parme, roquette', price: 16 },
      { id: 'ortolana', name: 'Ortolana', desc: 'Légumes grillés, mozzarella, pesto', price: 14, tags: ['veg'] }
    ]
  },
  {
    id: 'pasta',
    name: 'Pasta fresca',
    dishes: [
      { id: 'carbonara', name: 'Spaghetti alla carbonara', desc: 'Guanciale, jaune d’œuf, pecorino, poivre', price: 16 },
      { id: 'ragu', name: 'Pappardelle al ragù', desc: 'Ragoût de bœuf mijoté 6 heures', price: 17 },
      { id: 'cacio', name: 'Tonnarelli cacio e pepe', desc: 'Pecorino romano, poivre noir', price: 15, tags: ['veg'] },
      { id: 'vongole', name: 'Linguine alle vongole', desc: 'Palourdes, ail, persil, vin blanc', price: 19 },
      { id: 'ravioli', name: 'Ravioli ricotta e spinaci', desc: 'Beurre de sauge, parmesan', price: 16, tags: ['veg'] },
      { id: 'risotto', name: 'Risotto ai funghi', desc: 'Cèpes, parmesan 24 mois', price: 18, tags: ['veg', 'gf'] }
    ]
  },
  {
    id: 'secondi',
    name: 'Secondi',
    dishes: [
      { id: 'saltimbocca', name: 'Saltimbocca alla romana', desc: 'Veau, jambon de Parme, sauge, pommes rôties', price: 22, tags: ['gf'] },
      { id: 'branzino', name: 'Branzino al forno', desc: 'Bar rôti, citron, légumes du marché', price: 24, tags: ['gf'] },
      { id: 'parmigiana', name: 'Parmigiana di melanzane', desc: 'Aubergines, tomate, mozzarella, parmesan', price: 17, tags: ['veg', 'gf'] }
    ]
  },
  {
    id: 'dolci',
    name: 'Dolci',
    dishes: [
      { id: 'tiramisu', name: 'Tiramisù de la Nonna', desc: 'La recette de famille, depuis 1998', price: 8, tags: ['veg'] },
      { id: 'pannacotta', name: 'Panna cotta', desc: 'Coulis de fruits rouges', price: 7, tags: ['veg', 'gf'] },
      { id: 'cannoli', name: 'Cannoli siciliens', desc: 'Ricotta, pistache, écorces d’orange', price: 8, tags: ['veg'] },
      { id: 'affogato', name: 'Affogato', desc: 'Glace vanille, espresso', price: 6, tags: ['veg', 'gf'], takeaway: false }
    ]
  },
  {
    id: 'vini',
    name: 'Vini',
    dishes: [
      { id: 'chianti', name: 'Chianti Classico', desc: 'Toscane · le verre', price: 7, takeaway: false },
      { id: 'primitivo', name: 'Primitivo di Manduria', desc: 'Pouilles · le verre', price: 8, takeaway: false },
      { id: 'vermentino', name: 'Vermentino', desc: 'Sardaigne · le verre', price: 7, takeaway: false },
      { id: 'spritz', name: 'Spritz', desc: 'Apérol, prosecco, orange', price: 9, takeaway: false }
    ]
  }
];

export const TAG_LABEL: Record<Tag, string> = { veg: 'Végétarien', gf: 'Sans gluten' };

/** Services par jour de la semaine (0 = dimanche). Minutes depuis minuit. Lundi fermé. */
export interface Service {
  id: 'midi' | 'soir';
  label: string;
  start: number;
  end: number;
}
const MIDI: Service = { id: 'midi', label: 'Midi', start: 12 * 60, end: 14 * 60 };
const SOIR: Service = { id: 'soir', label: 'Soir', start: 19 * 60, end: 22 * 60 + 30 };
export const SERVICES: Service[][] = [[MIDI, SOIR], [], [MIDI, SOIR], [MIDI, SOIR], [MIDI, SOIR], [MIDI, SOIR], [MIDI, SOIR]];

/** Horaires de retrait à emporter (cuisine ouverte). */
export const PICKUP: [number, number][][] = [
  [[12 * 60, 14 * 60 + 30], [19 * 60, 22 * 60 + 30]],
  [],
  [[12 * 60, 14 * 60 + 30], [19 * 60, 22 * 60 + 30]],
  [[12 * 60, 14 * 60 + 30], [19 * 60, 22 * 60 + 30]],
  [[12 * 60, 14 * 60 + 30], [19 * 60, 22 * 60 + 30]],
  [[12 * 60, 14 * 60 + 30], [19 * 60, 23 * 60]],
  [[12 * 60, 14 * 60 + 30], [19 * 60, 23 * 60]]
];

export const CAPACITY = 40;
export const MAX_COVERS = 8;
export const DAYS_AHEAD = 21;

/** Brancher Cal.com : lien d'événement (ex. 'nonna-rosa/table'). Vide = démo intégrée. */
export const CAL_LINK = '';

export const eur = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0 });
