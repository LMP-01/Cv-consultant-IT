// Données du salon de démonstration « Hamed Coiffeur » (fictif).

export interface Barber {
  id: string;
  name: string;
  role: string;
  quote: string;
  photo: string;
}

export const BARBERS: Barber[] = [
  {
    id: 'hamed',
    name: 'Hamed',
    role: 'Fondateur · dégradés',
    quote: 'Un dégradé propre, c’est une question de patience. Je prends le temps qu’il faut.',
    photo: 'hamed.jpg'
  },
  {
    id: 'sofiane',
    name: 'Sofiane',
    role: 'Barbe & rasoir',
    quote: 'Une barbe bien taillée change tout un visage. Ça, c’est mon terrain.',
    photo: 'sofiane.jpg'
  },
  {
    id: 'lucas',
    name: 'Lucas',
    role: 'Coupes aux ciseaux',
    quote: 'Dites-moi comment vous vous coiffez le matin, je m’occupe du reste.',
    photo: 'lucas.jpg'
  },
  {
    id: 'ines',
    name: 'Inès',
    role: 'Cheveux texturés & enfants',
    quote: 'Boucles, frisés, crépus : chaque cheveu a sa méthode. Et les petits repartent fiers.',
    photo: 'ines.jpg'
  }
];

export const PRICE_ANY = 10;
export const PRICE_CHOSEN = 15;

/** Horaires par jour de la semaine (0 = dimanche). null = fermé. Minutes depuis minuit. */
export const HOURS: ([number, number] | null)[] = [
  null,
  null,
  [10 * 60, 19 * 60 + 30],
  [10 * 60, 19 * 60 + 30],
  [10 * 60, 19 * 60 + 30],
  [10 * 60, 19 * 60 + 30],
  [9 * 60, 19 * 60]
];

export const SLOT_MINUTES = 30;
export const DAYS_AHEAD = 14;

/**
 * Branchement Cal.com : renseignez le lien de l'événement de chaque coiffeur
 * (ex. 'hamed-coiffeur/hamed'). S'il est rempli, « Confirmer » ouvre Cal.com.
 * La clé 'any' sert pour la coupe à 10 € (premier coiffeur disponible).
 */
export const CAL_LINKS: Record<string, string> = {};
