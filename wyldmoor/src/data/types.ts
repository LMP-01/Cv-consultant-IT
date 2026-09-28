export const ELEMENT_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting',
  'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

/** Multiplier applied when a move of `attacker` type hits a defender of `defender` type. */
const CHART: Partial<Record<ElementType, Partial<Record<ElementType, number>>>> = {
  normal: { rock: 0.5, ghost: 0 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, bug: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 2, flying: 0.5, psychic: 2, ghost: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2 },
  ghost: { normal: 0, psychic: 2, ghost: 2 },
  dragon: { dragon: 2 },
};

export function typeEffectiveness(attacker: ElementType, defenderTypes: readonly ElementType[]): number {
  return defenderTypes.reduce((mult, def) => {
    const table = CHART[attacker];
    const factor = table?.[def];
    return mult * (factor === undefined ? 1 : factor);
  }, 1);
}

export const TYPE_COLORS: Record<ElementType, string> = {
  normal: '#a4a68f',
  fire: '#e0704a',
  water: '#4a8fe0',
  electric: '#e8c93a',
  grass: '#5cb85c',
  ice: '#7fd6e0',
  fighting: '#b0463c',
  poison: '#9b5bc4',
  ground: '#c9a25c',
  flying: '#9db8e8',
  psychic: '#e05c96',
  bug: '#a3c04a',
  rock: '#a89066',
  ghost: '#6a5b9e',
  dragon: '#5a4ae0',
};
