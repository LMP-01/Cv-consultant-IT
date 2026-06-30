'use strict';

const { getBuild } = require('./builds');

// Résout un nom d'item -> { id, name, icon, components:[{name,icon}] } (icône/composants
// seulement si Data Dragon est dispo ; sinon on garde le texte).
function resolveItem(name, ddragon) {
  if (!name) return null;
  const r = ddragon ? ddragon.resolveItemByName(name) : null;
  if (!r) return { id: null, name, icon: null, components: [] };
  const components = ddragon.itemComponents(r.id).map((c) => ({ name: c.name, icon: c.icon }));
  return { id: r.id, name: r.name, icon: r.icon, components };
}

// Hints de runes selon la composition adverse (réutilisé pour le tableau de bord).
function compRuneHints(enemyComp) {
  const out = [];
  if (!enemyComp) return out;
  if (enemyComp.ccCount >= 3) out.push('CC élevé : Ténacité (bottes de Mercure) et/ou sort Nettoyage.');
  if (enemyComp.burstCount >= 2) out.push('Burst élevé : runes de survie (Seconde Souffle / Garde-Ange / Sablier).');
  if (enemyComp.profile === 'à dominante AD') out.push('Comp AD : runes d’armure (Os Démoniaque), chaussons en plaques.');
  if (enemyComp.profile === 'à dominante AP') out.push('Comp AP : runes de RM (Cuirasse de Vandale), bottes de Mercure.');
  return out;
}

// Choisit l'ordre des objets situationnels selon la menace adverse dominante.
function orderSituational(situational, enemyComp, ddragon) {
  const items = situational.map((n) => resolveItem(n, ddragon)).filter(Boolean);
  if (!enemyComp) return items;
  // Priorise les objets défensifs pertinents (heuristique simple par mots-clés).
  const apThreat = enemyComp.profile === 'à dominante AP' || enemyComp.burstCount >= 2;
  const score = (it) => {
    const n = (it.name || '').toLowerCase();
    let s = 0;
    if (apThreat && /(banshee|wit|mercure|maw|cuirasse|force of nature|rm|magique|hourglass|zhonya|sablier)/.test(n)) s += 2;
    if (!apThreat && /(armure|plated|randuin|thornmail|cuirasse épineuse|frozen|tabis|steelcaps|dominik|mortal)/.test(n)) s += 2;
    return s;
  };
  return items.slice().sort((a, b) => score(b) - score(a));
}

/**
 * Construit le plan d'objets en jeu :
 *  - next : 3 prochains achats (objets finis non possédés) avec leurs composants (mini-items) ;
 *  - full : build complet conseillé jusqu'à la fin, ordonné (start → bottes → core → situationnel) ;
 *  - runes / summoners / note : rappel du setup conseillé ;
 *  - runeHints / strategy : ajustements selon la composition adverse (évolutif).
 */
function buildItemPlan(result, ddragon) {
  const me = result && result.scoreboard ? result.scoreboard.me : null;
  if (!me || !me.championId) return null;
  const build = getBuild(me.championId, me.position || null);
  if (!build) return null;

  const enemyComp = result.summary ? result.summary.enemyComp : null;

  const start = build.start ? [resolveItem(build.start, ddragon)] : [];
  const boots = build.boots ? [resolveItem(build.boots, ddragon)] : [];
  const core = (build.core || []).map((n) => resolveItem(n, ddragon)).filter(Boolean);
  const situational = orderSituational(build.situational || [], enemyComp, ddragon);

  // Build complet ordonné. On marque le rôle de chaque objet pour l'affichage.
  const full = [
    ...start.map((it) => ({ ...it, slot: 'Départ' })),
    ...boots.map((it) => ({ ...it, slot: 'Bottes' })),
    ...core.map((it, i) => ({ ...it, slot: `Core ${i + 1}` })),
    ...situational.map((it) => ({ ...it, slot: 'Situationnel' })),
  ].filter(Boolean);

  // Prochains achats : objets finis (core puis bottes/situationnel) non encore possédés.
  const owned = new Set(me.itemIds || []);
  const priorityOrder = [...core, ...boots, ...situational].filter(Boolean);
  const next = [];
  for (const it of priorityOrder) {
    if (next.length >= 3) break;
    if (it.id && owned.has(it.id)) continue;
    if (next.some((n) => n.id && n.id === it.id)) continue;
    next.push(it);
  }

  // Stratégie évolutive synthétique selon la compo adverse.
  let strategy = 'Suis ton core, puis adapte le situationnel selon la partie.';
  if (enemyComp) {
    if (enemyComp.profile === 'à dominante AP') strategy = 'Comp adverse AP : intègre une résistance magique après ton 2e objet.';
    else if (enemyComp.profile === 'à dominante AD') strategy = 'Comp adverse AD : pense armure/plaques après ton 2e objet.';
    if (enemyComp.burstCount >= 2) strategy += ' Burst élevé : un objet de survie (Sablier/Garde-Ange) peut passer avant le dernier item.';
  }

  return {
    champion: me.championDisplay || me.champion,
    runes: build.runes || null,
    summoners: build.summoners || null,
    skillOrder: build.skillOrder || null,
    note: build.note || null,
    source: build.source || null,
    next,
    full,
    runeHints: compRuneHints(enemyComp),
    strategy,
  };
}

module.exports = { buildItemPlan, compRuneHints };
