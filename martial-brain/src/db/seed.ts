/**
 * Starter graph.
 *
 * Every example the cahier des charges names is present, and the records are
 * created in an order that reproduces its exact codes — K001 Jab, K003 Mae
 * Geri, K007 O Soto Gari, T003 Créer une réaction, S003 Très grande distance.
 * The point is not the content but the wiring: a new user opens the app on a
 * graph that already demonstrates what linking buys them.
 */
import { createEntity, type EntityRecord } from './queries';
import { link } from '../domain/links';
import type { EntityKey } from '../domain/schema';
import type { Db } from './sqlite';

export function isSeeded(db: Db): boolean {
  return (db.one<{ n: number }>(`SELECT count(*) AS n FROM entities`)?.n ?? 0) > 0;
}

export function seed(db: Db): void {
  const made = new Map<string, EntityRecord>();

  const add = (
    slug: string,
    type: EntityKey,
    title: string,
    data: Record<string, unknown> = {},
  ): EntityRecord => {
    const record = createEntity(db, type, { title, data });
    made.set(slug, record);
    return record;
  };
  const id = (slug: string): string => {
    const record = made.get(slug);
    if (!record) throw new Error(`seed: unknown slug ${slug}`);
    return record.id;
  };
  const wire = (a: string, ...others: string[]): void => {
    for (const other of others) link(db, id(a), id(other));
  };

  db.tx(() => {
    /* ── Principes (§4.11) ── */
    add('pr-simplicite', 'principle', 'La simplicité résiste mieux à la fatigue', {
      description:
        "Sous fatigue, la coordination fine tombe avant la force. Les armes qui survivent au 3e round sont celles qui demandent le moins de décisions : un direct, un low kick, un contrôle. Les séquences longues sont des armes de début de combat.",
      origine: 'Observation personnelle en sparring long',
      tags: ['fatigue', 'fondamental'],
    });
    add('pr-distance', 'principle', 'Celui qui contrôle la distance choisit les échanges', {
      description:
        "On ne gagne pas un échange, on décide s'il a lieu. Le travail d'appuis vaut plus que le travail de bras.",
      tags: ['distance', 'fondamental'],
    });

    /* ── Techniques (§4.2) — order matters: Jab=K001, Mae Geri=K003, O Soto Gari=K007 ── */
    add('k-jab', 'technique', 'Jab', {
      discipline: 'Boxe anglaise',
      famille: 'Poing',
      distance: 'Moyenne',
      garde: 'Orthodoxe',
      cote: 'Avant',
      type: 'Préparation',
      description: "Direct du bras avant, épaule qui monte protéger le menton, retour sur la ligne.",
      objectif: "Mesurer la distance, occuper la ligne médiane, ouvrir les séquences.",
      applications: "Prise de distance, interruption d'une avancée, mise en place du low kick.",
      tags: ['base', 'poing'],
    });
    add('k-cross', 'technique', 'Direct arrière (cross)', {
      discipline: 'Boxe anglaise',
      famille: 'Poing',
      distance: 'Moyenne',
      garde: 'Orthodoxe',
      cote: 'Arrière',
      type: 'Offensive',
      description: 'Direct du bras arrière, rotation hanche-épaule, appui sur le pied arrière.',
      objectif: 'Convertir une ouverture créée par le jab.',
      tags: ['base', 'poing'],
    });
    add('k-mae-geri', 'technique', 'Mae Geri', {
      discipline: 'Kyokushin',
      famille: 'Pied',
      distance: 'Longue',
      garde: 'Orthodoxe',
      cote: 'Arrière',
      type: 'Offensive',
      description:
        'Coup de pied frontal : armement du genou, extension, rappel sur la même trajectoire.',
      objectif: "Arrêter une avancée, casser le rythme, gérer la distance longue.",
      applications: "Stop-hit sur adversaire qui avance, ouverture sur garde fermée.",
      tags: ['jambe', 'base'],
    });
    add('k-low-kick', 'technique', 'Low kick', {
      discipline: 'Muay Thaï',
      famille: 'Pied',
      distance: 'Moyenne',
      cote: 'Arrière',
      type: 'Offensive',
      description: 'Coup de pied circulaire tibia sur la cuisse, rotation complète du corps.',
      objectif: "Détruire la mobilité de l'adversaire dans la durée.",
      tags: ['jambe', 'usure'],
    });
    add('k-genou', 'technique', 'Genou direct (Hiza Geri)', {
      discipline: 'Muay Thaï',
      famille: 'Genou',
      distance: 'Corps à corps / Clinch',
      type: 'Offensive',
      description: 'Remontée du genou vers le plexus, hanches poussées vers l’avant.',
      tags: ['clinch'],
    });
    add('k-crochet', 'technique', 'Crochet', {
      discipline: 'Boxe anglaise',
      famille: 'Poing',
      distance: 'Courte',
      cote: 'Avant',
      type: 'Offensive',
      description: 'Coup circulaire à courte distance, coude à 90°, rotation des appuis.',
      tags: ['poing'],
    });
    add('k-o-soto-gari', 'technique', 'O Soto Gari', {
      discipline: 'Judo',
      famille: 'Projection',
      distance: 'Corps à corps / Clinch',
      type: 'Offensive',
      description:
        "Grand fauchage extérieur : déséquilibre arrière, appui sur la jambe chargée, fauchage.",
      objectif: 'Convertir un déséquilibre arrière en projection.',
      tags: ['projection', 'base'],
    });

    /* ── Biomécanique (§4.7) ── */
    add('b-chaine-direct', 'biomechanics', 'Chaîne cinétique du direct', {
      description: "Comment la force part du sol et arrive au poing sans se perdre.",
      chaine: 'Pied arrière → cheville → hanche → tronc → épaule → coude → poing.',
      appuis: "Pression sur le gros orteil arrière, talon qui pivote vers l'extérieur.",
      rotation: 'Hanche avant la ligne des épaules ; le bras arrive en dernier.',
      equilibre: "Le centre de gravité reste entre les appuis, jamais devant le pied avant.",
      erreurs: "Partir du bras, épaule qui monte trop tôt, buste qui bascule vers l'avant.",
      corrections: 'Travail au mur pour la rotation de hanche ; frappe à vitesse lente.',
      tags: ['fondamental'],
    });

    /* ── Combinaisons (§4.3) ── */
    add('a-jab-low', 'combo', 'Jab → Low kick', {
      objectif: 'Occuper le haut pour frapper le bas.',
      declencheur: "Adversaire qui lève la garde en réaction au jab.",
      distance: 'Moyenne',
      sequence: ['Jab avant', 'Pas de côté extérieur', 'Low kick arrière'],
      branches: "S'il recule : répéter le jab. S'il contre-attaque : voir C001.",
      variantes: 'Double jab → low kick sur adversaire qui recule.',
      risques: "Low kick checké ; retour en direct arrière pendant l'appui.",
      reussite: 65,
      tags: ['usure'],
    });
    add('a-jab-cross', 'combo', 'Jab → Direct arrière', {
      objectif: 'La séquence la plus courte qui convertit une ouverture.',
      declencheur: 'Garde qui bouge sur le jab.',
      distance: 'Moyenne',
      sequence: ['Jab avant', 'Direct arrière'],
      reussite: 55,
      tags: ['base'],
    });

    /* ── Contres (§4.4) ── */
    add('c-check-mae-geri', 'counter', 'Check → Mae Geri', {
      attaque: 'Low kick adverse',
      reponse: 'Checker au tibia puis repartir immédiatement en Mae Geri sur la jambe restée en appui.',
      timing: "Sur la reprise d'appui adverse, avant qu'il ne remette sa garde.",
      distance: 'Longue',
      objectif: 'Punir le low kick et reprendre la distance dans le même temps.',
      risques: 'Mae Geri lu et saisi si le rappel de jambe est lent.',
      reussite: 45,
      tags: ['contre', 'jambe'],
    });

    /* ── Tactiques (§4.5) — Faire avancer = T001, Créer une réaction = T003 ── */
    add('t-faire-avancer', 'tactic', 'Faire avancer', {
      description: "Reculer volontairement pour amener l'adversaire à s'engager.",
      objectif: 'Choisir le moment de la rencontre plutôt que de le subir.',
      applications: "Stop-hit en Mae Geri, contre sur son entrée, sortie d'angle.",
      tags: ['initiative'],
    });
    add('t-fatiguer', 'tactic', 'Fatiguer', {
      description: "Cibler la mobilité et la respiration plutôt que la tête.",
      objectif: "Rendre le 3e round injouable pour lui.",
      applications: 'Low kicks répétés, clinch, rythme irrégulier.',
      tags: ['usure'],
    });
    add('t-creer-reaction', 'tactic', 'Créer une réaction', {
      description: "Provoquer un réflexe pour frapper l'ouverture qu'il laisse.",
      objectif: 'Ne pas frapper une cible fixe mais une cible qui bouge comme prévu.',
      applications: 'Jab haut pour ouvrir le low kick ; feinte de niveau.',
      tags: ['initiative'],
    });

    /* ── Situations (§4.6) — Adversaire agressif = S001, Très grande distance = S003 ── */
    add('s-agressif', 'situation', 'Adversaire très agressif', {
      description: "Avance en continu, pression constante, peu de retrait.",
      objectif: "Transformer son avancée en risque pour lui.",
      tags: ['pression'],
    });
    add('s-coin', 'situation', 'Coin du tatami', {
      description: "Dos proche de la limite, options de déplacement réduites.",
      objectif: 'Sortir en angle plutôt qu’en ligne droite.',
      tags: ['déplacement'],
    });
    add('s-grande-distance', 'situation', 'Très grande distance', {
      description: "Adversaire plus grand ou allonge supérieure ; il touche avant moi.",
      objectif: 'Traverser la distance sans se faire intercepter.',
      tags: ['distance'],
    });

    /* ── Lecture adverse (§4.8) ── */
    add('l-main-basse', 'read', 'Baisse la main avant de kicker', {
      hypothese: "Il utilise son bras avant comme balancier au moment d'armer sa jambe.",
      reponse: "Direct arrière dès que la main descend, ou Mae Geri en stop-hit.",
      confiance: 70,
      tags: ['tell'],
    });

    /* ── Erreurs (§4.15) ── */
    add('er-armement-genou', 'error', 'Armement trop lent du genou', {
      description: "Le genou monte mollement avant le Mae Geri, ce qui annonce le coup.",
      cause: "Manque de gainage et appui arrière mal chargé.",
      correction: 'Travail de montées de genou explosives ; frappe depuis un appui déjà chargé.',
      tags: ['jambe'],
    });

    /* ── Exercices (§4.14) ── */
    add('e-contre-jab', 'exercise', 'Thème : contre sur jab', {
      objectif: 'Automatiser la réponse au jab adverse.',
      materiel: 'Un partenaire, gants légers',
      description: "Le partenaire ne lance que des jabs ; réponse imposée, 3 × 3 min.",
      progression: "Passer de la réponse annoncée à la réponse libre, puis en déplacement.",
      tags: ['drill'],
    });

    /* ── Objectifs (§4.13) ── */
    add('o-garde-basse', 'objective', 'Améliorer la défense en garde basse', {
      horizon: 'Moyen terme',
      progression: 30,
      statut: 'En cours',
      notes: "La main arrière décroche dès que je fatigue.",
      tags: ['défense'],
    });

    /* ── Hypothèses (§4.10) ── */
    add('h-switch-mae-geri', 'hypothesis', 'Tester le switch avant Mae Geri', {
      pourquoi:
        "Le Mae Geri de la jambe arrière est lu. Un switch d'appui pourrait le rendre imprévisible au prix d'un temps de retard.",
      experience: '3 sparrings, alterner Mae Geri classique et Mae Geri après switch.',
      validation: 'En cours de test',
      tags: ['jambe'],
    });

    /* ── Sparrings (§4.9) ── */
    add('r-15-10', 'sparring', 'Séance du 15/10', {
      date: '2026-10-15',
      lieu: 'Dojo',
      discipline: 'Kyokushin',
      adversaire: 'Partenaire plus lourd (+8 kg)',
      poids: 82,
      duree: 30,
      resultat: 'Non comptabilisé',
      lecons:
        "Le jab passe tant que je bouge. Dès que je m'arrête, il rentre. Le Mae Geri l'a arrêté deux fois sur trois.",
      tags: ['sparring'],
    });

    /* ── Combats officiels (§4.9) ── */
    add('f-regional', 'fight', 'Championnat régional', {
      date: '2026-11-22',
      lieu: 'Gymnase municipal',
      discipline: 'Kyokushin',
      adversaire: 'Adversaire southpaw',
      poids: 80,
      duree: 9,
      resultat: 'Victoire',
      preparation: '6 semaines, 4 séances/semaine.',
      pesee: 'Passée à 79,4 kg sans coupe agressive.',
      echauffement: '20 min, montée progressive, pas de sparring avant.',
      stress: "Gérable jusqu'à l'appel ; le premier échange l'a fait tomber.",
      analyse:
        "Le plan « faire avancer » a fonctionné : il s'est engagé, le Mae Geri l'a cueilli deux fois.",
      arbitrage: 'Un avertissement pour sortie de tatami, justifié.',
      lecons: "Sous pression, je reviens à trois armes. Confirme PR001.",
      tags: ['compétition'],
    });

    /* ── Bibliothèque (§4.12) ── */
    add('v-analyse-mma', 'resource', 'Analyse vidéo MMA', {
      kind: 'Vidéo',
      auteur: 'Chaîne d’analyse technique',
      resume: "Décorticage du timing d'entrée sur adversaire qui avance.",
      aRetenir: "Le stop-hit ne marche que si l'appui arrière est déjà chargé.",
      tags: ['analyse'],
    });

    /* ── The wiring: this is what makes it a graph rather than 15 lists ── */
    wire('k-jab', 'a-jab-low', 'a-jab-cross', 'b-chaine-direct', 'pr-simplicite', 'e-contre-jab', 'r-15-10', 'l-main-basse');
    wire('k-cross', 'a-jab-cross', 'b-chaine-direct', 'l-main-basse');
    wire('k-mae-geri', 'c-check-mae-geri', 's-agressif', 's-grande-distance', 'er-armement-genou', 'h-switch-mae-geri', 't-faire-avancer', 'r-15-10', 'f-regional');
    wire('k-low-kick', 'a-jab-low', 'c-check-mae-geri', 't-fatiguer');
    wire('k-genou', 't-fatiguer', 's-coin');
    wire('k-crochet', 'b-chaine-direct', 's-coin', 't-creer-reaction');
    wire('k-o-soto-gari', 'pr-distance', 's-coin');
    wire('a-jab-low', 't-creer-reaction', 'pr-simplicite', 'v-analyse-mma');
    wire('a-jab-cross', 'pr-simplicite');
    wire('c-check-mae-geri', 's-agressif', 't-faire-avancer');
    wire('t-faire-avancer', 's-agressif', 'v-analyse-mma', 'f-regional');
    wire('t-fatiguer', 'pr-simplicite');
    wire('t-creer-reaction', 's-grande-distance');
    wire('s-coin', 'pr-distance');
    wire('s-grande-distance', 'pr-distance');
    wire('er-armement-genou', 'b-chaine-direct', 'e-contre-jab', 'r-15-10');
    wire('o-garde-basse', 'e-contre-jab', 'r-15-10', 'f-regional');
    wire('h-switch-mae-geri', 'r-15-10', 'f-regional');
    wire('r-15-10', 'pr-simplicite');
    wire('f-regional', 'pr-simplicite', 'pr-distance');
    wire('l-main-basse', 'f-regional');
  });
}
