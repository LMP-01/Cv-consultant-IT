'use strict';

const fs = require('fs');
const path = require('path');
const { analyzeComp, defensiveSuggestions, classifyDamage, dataset } = require('./profile');
const { getBuild } = require('./builds');
const { kbTraits, playstyleTip } = require('./championsKb');

// Suivi du dragon soul à partir des events (type + équipe ayant tué).
function analyzeDragons(events, scoreboard) {
  const teamByName = {};
  for (const p of scoreboard.allies) teamByName[p.summoner] = 'ally';
  for (const p of scoreboard.enemies) teamByName[p.summoner] = 'enemy';
  const dragons = { ally: [], enemy: [] };
  for (const e of events) {
    if (e.EventName !== 'DragonKill') continue;
    const side = teamByName[e.KillerName];
    const type = String(e.DragonType || '').replace(/Dragon$/i, '');
    if (side === 'ally') dragons.ally.push(type);
    else if (side === 'enemy') dragons.enemy.push(type);
  }
  const soulTeam = dragons.ally.length >= 4 ? 'ally' : dragons.enemy.length >= 4 ? 'enemy' : null;
  const soulPointTeam = !soulTeam && dragons.ally.length === 3 ? 'ally' : !soulTeam && dragons.enemy.length === 3 ? 'enemy' : null;
  return { ally: dragons.ally, enemy: dragons.enemy, soulTeam, soulPointTeam };
}

// Conseil de counter-build à partir des OBJETS RÉELS de l'équipe adverse.
function counterBuildAdvice(scoreboard, ddragon, meChamp) {
  if (!ddragon) return null;
  let armor = 0;
  let mr = 0;
  let thornmail = false;
  for (const e of scoreboard.enemies) {
    for (const id of e.itemIds || []) {
      const info = ddragon.itemInfo(id);
      if (!info) continue;
      const tags = info.tags || [];
      if (tags.includes('Armor')) armor++;
      if (tags.includes('SpellBlock')) mr++;
      if (id === 3075 || /thornmail|cuirasse épineuse/i.test(info.name)) thornmail = true;
    }
  }
  const dmg = meChamp ? classifyDamage(meChamp) : null;
  if ((dmg === 'AD' || dmg === 'MIXED') && armor >= 2) {
    return { id: 'cb-armorpen', priority: 'medium', category: 'Build', title: 'Adverses qui montent armure', message: `Au moins ${armor} objets d'armure en face — prends de la pénétration d'armure (Lord Dominik / Serylda) pour rester efficace.` };
  }
  if (dmg === 'AP' && mr >= 2) {
    return { id: 'cb-magicpen', priority: 'medium', category: 'Build', title: 'Adverses qui montent RM', message: `Au moins ${mr} objets de RM en face — Bâton du Vide est obligatoire pour percer leur résistance magique.` };
  }
  if (thornmail) {
    return { id: 'cb-thornmail', priority: 'low', category: 'Build', title: 'Cuirasse épineuse en face', message: 'Anti-soin (Fléau) sur toi : ton lifesteal/soin est réduit de 40%. Évite les trades prolongés contre ce porteur.' };
  }
  return null;
}

// Choisit l'OBJET DÉFENSIF prioritaire à acheter selon la menace dominante,
// ancré sur le situationnel du build joué (nom + icône garantis). Renvoie
// { item, id, icon, reason, urgency, when } ou null. Sert de source unique :
// le conseil ET la mise à jour des prochains achats en découlent.
function choosePriorityDefensive(scoreboard, enemyComp, meChamp, me, ddragon) {
  if (!me || !me.championId || !ddragon || !enemyComp) return null;
  const build = getBuild(me.championId, me.position || null);
  if (!build || !Array.isArray(build.situational) || !build.situational.length) return null;
  const owned = new Set(me.itemIds || []);
  const myTags = meChamp ? meChamp.tags || [] : [];
  const squishy = ['Mage', 'Marksman', 'Assassin'].some((t) => myTags.includes(t));
  const burst = enemyComp.burstCount >= 2;
  const apThreat = enemyComp.profile === 'à dominante AP';
  const adThreat = enemyComp.profile === 'à dominante AD';
  const heavyCC = enemyComp.ccCount >= 3;

  let want = null, reason = null, urgency = 'medium', when = 'dans tes 1-2 prochains objets';
  if (squishy && burst) {
    want = /(sablier|zhonya|garde.?ange|angel|banshee|maw)/i;
    reason = `burst adverse élevé (${enemyComp.burstCount}) — de quoi survivre à leur combo d'engage`;
    urgency = 'high';
    when = 'ton prochain retour (en priorité)';
  } else if (apThreat && squishy) {
    want = /(banshee|maw|mercure|adaptativ|vandale|abysse|force of nature|magique)/i;
    reason = 'comp majoritairement AP — prends de la résistance magique';
  } else if (adThreat) {
    want = /(armure|plated|randuin|thornmail|épineuse|acier|frozen|tabis|steelcaps|zhonya|sablier|gardien)/i;
    reason = 'comp majoritairement AD — prends de l’armure';
  } else if (heavyCC) {
    want = /(mercure|silvermere|quicksilver|argent|ténacité|mercurial)/i;
    reason = `beaucoup de CC (${enemyComp.ccCount}) — un objet qui purge/tenacité aide`;
  }
  if (!want) return null;

  for (const name of build.situational) {
    if (!want.test(String(name || ''))) continue;
    const r = ddragon.resolveItemByName(name);
    if (r && r.id) {
      if (owned.has(r.id)) return null; // déjà l'objet -> plus besoin du conseil
      return { item: r.name, id: r.id, icon: r.icon, reason, urgency, when };
    }
    // Data Dragon indisponible (hors-ligne) : on renvoie au moins le nom.
    if (!r) return { item: name, id: null, icon: null, reason, urgency, when };
  }
  return null;
}

// ── Timings des objectifs neutres (Faille de l'invocateur) ────────────────
// Valeurs vérifiées pour le patch 26.13 (juin 2026). Elles évoluent à chaque
// saison : ajuste-les ici si le patch change.
const OBJ = {
  DRAGON_FIRST: 300, // 5:00
  DRAGON_RESPAWN: 300, // 5:00 après un kill
  VOIDGRUBS_SPAWN: 360, // 6:00 (despawn ~14:45, max 2 apparitions)
  HERALD_SPAWN: 900, // 15:00 (pas de respawn, despawn ~19:45)
  BARON_SPAWN: 1200, // 20:00
  BARON_RESPAWN: 360, // 6:00 après un kill
};

function mmss(seconds) {
  if (seconds == null) return '--:--';
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function pct(n) {
  return Math.round(n * 100);
}

// Prochain objet conseillé non encore possédé + son coût total (pour le recall).
function nextRecommendedItem(me, ddragon) {
  if (!me || !me.championId || !ddragon) return null;
  const build = getBuild(me.championId, me.position || null);
  if (!build) return null;
  const owned = new Set(me.itemIds || []);
  const order = [...(build.core || []), build.boots, ...(build.situational || [])].filter(Boolean);
  for (const name of order) {
    const r = ddragon.resolveItemByName(name);
    if (r && r.id && !owned.has(r.id)) {
      const info = ddragon.itemInfo(r.id);
      if (info && info.gold) return { name: r.name, id: r.id, cost: info.gold };
    }
  }
  return null;
}

// Identifie l'entrée de allPlayers correspondant au joueur actif.
function findActivePlayerEntry(all, active) {
  if (!active) return null;
  const keys = [active.riotId, active.riotIdGameName, active.summonerName].filter(Boolean);
  return (
    all.find((p) => keys.includes(p.riotId)) ||
    all.find((p) => keys.includes(p.riotIdGameName)) ||
    all.find((p) => keys.includes(p.summonerName)) ||
    null
  );
}

// Construit un tableau de bord normalisé à partir de allgamedata.
function buildScoreboard(data, ddragon) {
  const all = data.allPlayers || [];
  const active = data.activePlayer || {};
  const me = findActivePlayerEntry(all, active);
  const myTeam = me ? me.team : 'ORDER';

  const mapPlayer = (p) => {
    const champ = ddragon ? ddragon.resolveChampionByName(p.championName) : null;
    return {
      champion: p.championName,
      championDisplay: champ ? champ.displayName : p.championName,
      championId: champ ? champ.id : null,
      championKey: champ ? champ.key : null,
      portrait: champ && ddragon ? ddragon.squarePortraitUrl(champ.id) : null,
      tags: champ ? champ.tags : [],
      summoner: p.riotIdGameName || p.summonerName || '',
      team: p.team,
      level: p.level,
      kills: p.scores ? p.scores.kills : 0,
      deaths: p.scores ? p.scores.deaths : 0,
      assists: p.scores ? p.scores.assists : 0,
      cs: p.scores ? p.scores.creepScore : 0,
      wardScore: p.scores ? Math.round(p.scores.wardScore || 0) : 0,
      isDead: !!p.isDead,
      respawnTimer: Math.round(p.respawnTimer || 0),
      position: p.position || '',
      isYou: me ? p === me : false,
      items: (p.items || []).map((it) => (ddragon ? ddragon.itemName(it.itemID) || `#${it.itemID}` : `#${it.itemID}`)),
      itemIds: (p.items || []).map((it) => it.itemID),
      itemGold: (p.items || []).reduce((s, it) => s + (ddragon ? ((ddragon.itemInfo(it.itemID) || {}).gold || 0) : 0), 0),
      summonerSpells: [p.summonerSpells && p.summonerSpells.summonerSpellOne, p.summonerSpells && p.summonerSpells.summonerSpellTwo]
        .map((s) => (s && s.displayName) || null)
        .filter(Boolean),
      keystone: (p.runes && p.runes.keystone && p.runes.keystone.displayName) || null,
    };
  };

  // Valeur nette estimée (or) d'un joueur : valeur des objets (réelle) + farm/kills.
  // Approximation — l'API live n'expose pas l'or des autres joueurs.
  const netWorthOf = (p) => (p.itemGold || 0) + (p.cs || 0) * 9 + (p.kills || 0) * 240 + (p.assists || 0) * 110 + 500;

  const withNet = (pl) => ({ ...pl, netWorth: netWorthOf(pl) });
  const allies = all.filter((p) => p.team === myTeam).map(mapPlayer).map(withNet);
  const enemies = all.filter((p) => p.team !== myTeam).map(mapPlayer).map(withNet);
  return { me: me ? withNet(mapPlayer(me)) : null, allies, enemies, myTeam };
}

// Calcule les ETA des objectifs à partir du temps de jeu et des events.
function computeObjectives(gameTime, events) {
  let lastDragon = null;
  let lastBaron = null;
  let heraldDead = false;
  let grubsDone = false;
  for (const e of events) {
    if (e.EventName === 'DragonKill') lastDragon = e.EventTime;
    else if (e.EventName === 'BaronKill') lastBaron = e.EventTime;
    else if (e.EventName === 'HeraldKill') heraldDead = true;
    // Les Voidgrubs (« Horde » en interne) n'ont pas de respawn une fois pris.
    else if (e.EventName === 'HordeKill' || e.EventName === 'VoidgrubKill') grubsDone = true;
  }

  const objectives = [];
  // `spawnAt` = instant (temps de jeu) où l'objectif (re)devient disponible :
  // sert à n'annoncer « disponible » que peu après l'apparition (anti-spam).
  const add = (name, icon, spawnAt) =>
    objectives.push({ name, icon, spawnAt, etaSeconds: Math.max(0, Math.round(spawnAt - gameTime)) });

  // Icônes gérées côté UI (SVG) ; on ne stocke pas d'emoji ici.
  // Dragon (respawn 5:00 après un kill).
  add('Dragon', '', lastDragon != null ? lastDragon + OBJ.DRAGON_RESPAWN : OBJ.DRAGON_FIRST);

  // Voidgrubs : apparition 6:00, pas de respawn. Affiché jusqu'à un peu après
  // l'apparition (ou jusqu'à ce qu'ils soient pris), pas pendant tout l'early.
  if (!grubsDone && gameTime < OBJ.VOIDGRUBS_SPAWN + 90) {
    add('Voidgrubs', '', OBJ.VOIDGRUBS_SPAWN);
  }

  // Rift Herald (15:00, sans respawn, despawn ~19:45).
  if (!heraldDead && gameTime < 1185) {
    add('Héraut', '', OBJ.HERALD_SPAWN);
  }

  // Baron Nashor (20:00, respawn 6:00).
  const baronSpawnAt = lastBaron != null ? lastBaron + OBJ.BARON_RESPAWN : OBJ.BARON_SPAWN;
  if (gameTime >= OBJ.HERALD_SPAWN - 120 || baronSpawnAt - gameTime <= 180) {
    add('Baron', '', baronSpawnAt);
  }

  return objectives;
}

// Timing des vagues de sbires (déterministe à partir de l'horloge).
// 1re vague à 1:05, puis toutes les 30 s. Sbire de siège (canon) : toutes les
// 3 vagues avant 15:00, toutes les 2 de 15:00 à 25:00, puis chaque vague.
function isCannonWave(waveNum, spawnTime) {
  if (spawnTime >= 1500) return true;
  if (spawnTime >= 900) return waveNum % 2 === 0;
  return waveNum % 3 === 0;
}
function computeWaves(gameTime) {
  const FIRST = 65;
  const period = 30;
  if (gameTime < FIRST) return { nextWaveSeconds: Math.round(FIRST - gameTime), nextCannonSeconds: null };
  const curWave = Math.floor((gameTime - FIRST) / period) + 1;
  const nextWaveTime = FIRST + curWave * period; // prochaine vague à venir
  let nextCannonSeconds = null;
  for (let n = curWave; n < curWave + 24; n++) {
    const t = FIRST + (n - 1) * period;
    if (t < gameTime) continue;
    if (isCannonWave(n, t)) { nextCannonSeconds = Math.round(t - gameTime); break; }
  }
  return { nextWaveSeconds: Math.round(nextWaveTime - gameTime), nextCannonSeconds };
}

/**
 * Moteur de conseils en jeu basé sur des règles.
 * @returns {{summary, objectives, scoreboard, advice}}
 */
// Évalue le risque d'un engagement/positionnement à partir des seuls signaux
// exposés par l'API live (pas de coordonnées). Renvoie null si rien d'alarmant,
// sinon { level, title, message, reasons[] } — le plus grave d'abord.
function computeRisk({ me, scoreboard, stats, active, objectives, dragons, gameTime }) {
  if (!me || me.isDead || gameTime < 90) return null;
  const alliesAliveCount = 1 + scoreboard.allies.filter((p) => !p.isYou && !p.isDead).length; // toi + alliés vivants
  const enemiesAlive = scoreboard.enemies.filter((p) => !p.isDead);
  const enemiesAliveCount = enemiesAlive.length;
  const hpPct = stats.maxHealth ? stats.currentHealth / stats.maxHealth : 1;
  const gold = active.currentGold != null ? active.currentGold : 0;

  // Objectif majeur disponible maintenant (fenêtre de contest = zone chaude).
  const hotObjective = (objectives || []).find(
    (o) => o.etaSeconds === 0 && (o.name === 'Baron' || o.name === 'Dragon')
  );
  const soulOnLine = dragons && dragons.soulPointTeam; // le prochain drake donne le soul

  // 1) Infériorité numérique nette (2 morts d'écart) — le pire.
  if (enemiesAliveCount - alliesAliveCount >= 2) {
    return {
      level: 'danger',
      title: 'Infériorité numérique',
      message: `${enemiesAliveCount} ennemis vivants pour ${alliesAliveCount} des vôtres — NE force PAS. Recule, temporise et attends le respawn de tes alliés avant tout fight/objectif.`,
      reasons: [`${alliesAliveCount}v${enemiesAliveCount}`],
    };
  }

  // 2) Objectif chaud alors que des alliés sont morts : contest suicide.
  const alliesDead = scoreboard.allies.filter((p) => !p.isYou && p.isDead).length;
  if ((hotObjective || soulOnLine) && alliesDead >= 2 && enemiesAliveCount >= alliesAliveCount) {
    const what = hotObjective ? hotObjective.name : 'drake du Soul';
    return {
      level: 'danger',
      title: `Ne conteste pas le ${what} seul`,
      message: `${alliesDead} alliés morts et l'ennemi est au complet autour du ${what}. Le contest est perdu — pose la vision, décroche et cède l'objectif plutôt qu'un ace.`,
      reasons: [`${alliesDead} alliés morts`, what],
    };
  }

  // 3) PV bas + or non dépensé : tu joues avec de l'or sur toi.
  if (hpPct < 0.35 && gold >= 1300 && enemiesAliveCount >= 1) {
    return {
      level: 'warn',
      title: 'PV bas avec de l’or sur toi',
      message: `Tu es à ${pct(hpPct)}% PV avec ${Math.round(gold)} or non dépensé. Recall et achète — ne meurs pas en donnant à la fois le kill ET ton or.`,
      reasons: [`${pct(hpPct)}% PV`, `${Math.round(gold)} or`],
    };
  }

  // 4) PV très bas, ennemis vivants, sans avantage numérique : décroche.
  if (hpPct < 0.25 && enemiesAliveCount >= alliesAliveCount) {
    return {
      level: 'warn',
      title: 'PV critiques',
      message: `À ${pct(hpPct)}% PV, un seul engage adverse te tue. Sors de portée de sort, reset ou colle-toi à ta tour.`,
      reasons: [`${pct(hpPct)}% PV`],
    };
  }
  return null;
}

// Champions à fort heal/shield notable (pour l'anti-soin + les odds de duel).
const SUSTAIN_CHAMPS = new Set([
  'aatrox', 'soraka', 'yuumi', 'sylas', 'vladimir', 'swain', 'nami', 'senna', 'sona',
  'warwick', 'drmundo', 'olaf', 'aphelios', 'sett', 'irelia', 'fiora', 'ramus', 'ramus',
  'mordekaiser', 'kayn', 'nautilus', 'renekton', 'gwen', 'briar', 'bel', 'seraphine', 'taric',
  'kled', 'volibear', 'zac', 'yasuo', 'yone', 'samira', 'nilah',
]);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Traits d'un ennemi (pour le calcul de duel + l'anti-soin).
function enemyTraits(enemy, ds, ddragon) {
  const spells = (enemy.summonerSpells || []).map((s) => norm(s));
  const tags = enemy.tags || [];
  const nid = norm(enemy.championId || enemy.champion);
  const ccSet = new Set((ds.ccHeavy || []).map(norm));
  // Sustain : champion connu OU objets de vol de vie/omnivamp/soin.
  let itemSustain = false;
  for (const id of enemy.itemIds || []) {
    const info = ddragon && ddragon.itemInfo(id);
    if (!info) continue;
    const t = info.tags || [];
    if (t.includes('LifeSteal') || t.includes('SpellVamp')) itemSustain = true;
    if (/gourdin|bloodthirster|soif-de-sang|sterak|goredrinker|avidité|death.?s dance|danse de la mort/i.test(info.name || '')) itemSustain = true;
  }
  const itemGold = enemy.itemGold || 0;
  // Base tous-champions : classe d'archétype → burst/CC/tank même hors listes curées.
  const kb = kbTraits(enemy.championId || enemy.champion);
  return {
    sustain: SUSTAIN_CHAMPS.has(nid) || itemSustain,
    exhaust: spells.some((s) => /fatigue|exhaust/.test(s)),
    ignite: spells.some((s) => /embrasement|ignite|dot/.test(s)),
    hardCC: ccSet.has(nid) || tags.includes('Tank') || Boolean(kb && kb.hardCC),
    tank: tags.includes('Tank') || Boolean(kb && kb.tanky && kb.cls === 'tank'),
    burst: Boolean(kb && kb.burst),
    cls: kb ? kb.cls : null,
    hasSpike: itemGold >= 3000, // ~1 objet complet et plus
    itemGold,
  };
}

// Combo d'engage/trade selon le champion joué (data/combos.json), avec repli par classe.
let COMBOS = undefined;
function loadCombos() {
  if (COMBOS !== undefined) return COMBOS;
  try {
    COMBOS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'combos.json'), 'utf8'));
  } catch {
    COMBOS = { champions: {}, byClass: {} };
  }
  return COMBOS;
}
function comboFor(meChamp) {
  if (!meChamp) return null;
  const c = loadCombos();
  if (c.champions && c.champions[meChamp.id]) return c.champions[meChamp.id];
  const cls = (meChamp.tags || []).find((t) => c.byClass && c.byClass[t]);
  return cls ? c.byClass[cls] : null;
}

function analyzeInGame(data, ddragon) {
  const advice = [];
  const gameTime = data.gameData ? data.gameData.gameTime : 0;
  const active = data.activePlayer || {};
  const events = (data.events && data.events.Events) || [];
  const scoreboard = buildScoreboard(data, ddragon);
  const me = scoreboard.me;
  const stats = active.championStats || {};

  const objectives = computeObjectives(gameTime, events);

  // Profil de dégâts adverse (pour conseil défensif unique).
  const enemyChamps = scoreboard.enemies
    .map((e) => (ddragon ? ddragon.resolveChampionByName(e.champion) : null))
    .filter(Boolean);
  const enemyComp = enemyChamps.length ? analyzeComp(enemyChamps) : null;
  const meChamp = me && ddragon ? ddragon.resolveChampionByName(me.champion) : null;

  // Traits de chaque ennemi (sustain/exhaust/ignite/CC/spike) pour le calcul de
  // duel et l'anti-soin. On les attache directement au scoreboard pour le client.
  const ds = dataset();
  for (const e of scoreboard.enemies) e.traits = enemyTraits(e, ds, ddragon);
  const enemySustain = scoreboard.enemies.filter((e) => e.traits && e.traits.sustain);

  // Données live enrichies : dragons/soul, structures, vision.
  const dragons = analyzeDragons(events, scoreboard);
  const towers = {
    ally: events.filter((e) => e.EventName === 'TurretKilled' && scoreboard.allies.some((p) => p.summoner === e.KillerName)).length,
    enemy: events.filter((e) => e.EventName === 'TurretKilled' && scoreboard.enemies.some((p) => p.summoner === e.KillerName)).length,
  };
  const myWard = me ? me.wardScore || 0 : 0;
  const allyWardAvg = scoreboard.allies.length ? scoreboard.allies.reduce((s, p) => s + (p.wardScore || 0), 0) / scoreboard.allies.length : 0;

  // ── Règles ──────────────────────────────────────────────────────────────

  // 1. Début de partie
  if (gameTime < 75) {
    advice.push({
      id: 'game-start',
      priority: 'info',
      category: 'Macro',
      title: 'Bonne partie !',
      message: 'Surveille les invades vers 1:00-1:30, prépare le 1er dragon (5:00) et les Voidgrubs (6:00).',
    });
    // Plan de jeu de TON champion (base tous-champions) : comment le jouer.
    const tip = playstyleTip(me && me.championId, meChamp);
    if (tip) {
      advice.push({
        id: 'champ-gameplan',
        priority: 'info',
        category: 'Macro',
        title: `Plan de jeu — ${me.champion}`,
        message: tip,
      });
    }
  }

  // 2. Objectifs imminents / disponibles
  for (const obj of objectives) {
    // On n'annonce « disponible » que dans la fenêtre suivant l'apparition,
    // pour ne pas répéter le conseil tant que l'objectif reste up.
    const freshlyAvailable = obj.spawnAt == null || gameTime - obj.spawnAt <= 75;
    if (obj.etaSeconds === 0 && freshlyAvailable) {
      advice.push({
        id: `obj-now-${obj.name}`,
        priority: obj.name === 'Baron' || obj.name === 'Dragon' ? 'high' : 'medium',
        category: 'Objectif',
        title: `${obj.name} disponible`,
        message: `${obj.name} est apparu — prends la vision autour et regroupe pour le contester.`,
      });
    } else if (obj.etaSeconds > 0 && obj.etaSeconds <= 45) {
      advice.push({
        id: `obj-soon-${obj.name}`,
        priority: 'medium',
        category: 'Objectif',
        title: `${obj.name} dans ${mmss(obj.etaSeconds)}`,
        message: `Place la vision et positionne-toi ${obj.etaSeconds <= 25 ? 'maintenant' : 'tôt'} pour le ${obj.name.toLowerCase()}.`,
      });
    }
  }

  // 3. PV bas
  if (stats.maxHealth > 0 && !me?.isDead) {
    const hpPct = stats.currentHealth / stats.maxHealth;
    if (hpPct < 0.30) {
      advice.push({
        id: 'low-hp',
        priority: 'high',
        category: 'Survie',
        title: `PV bas (${pct(hpPct)}%)`,
        message: 'Recule hors de portée, recall ou récupère un buff. Ne donne pas de kill gratuit.',
      });
    }
  }

  // 4. Recall / spike d'or — optimisé avec le coût du prochain objet conseillé.
  if (active.currentGold != null && !me?.isDead) {
    const gold = active.currentGold;
    const nextItem = nextRecommendedItem(me, ddragon);
    if (nextItem && gold >= nextItem.cost) {
      advice.push({
        id: 'recall-item',
        priority: 'medium',
        category: 'Économie',
        title: `Recall : tu peux acheter ${nextItem.name}`,
        message: `Tu as ${Math.round(gold)} or (≥ ${nextItem.cost} pour ${nextItem.name}). Recall sur une vague poussée pour prendre ton spike puis reviens.`,
      });
    } else if (nextItem && gold >= nextItem.cost - 450) {
      advice.push({
        id: 'recall-soon',
        priority: 'low',
        category: 'Économie',
        title: `Bientôt ${nextItem.name} (${Math.round(gold)}/${nextItem.cost} or)`,
        message: `Il te manque ${Math.max(0, nextItem.cost - Math.round(gold))} or pour ${nextItem.name}. Sécurise une vague puis recall — ne meurs pas avec l'or sur toi.`,
      });
    } else if (gold >= 2200) {
      advice.push({
        id: 'recall-big',
        priority: 'medium',
        category: 'Économie',
        title: `Recall conseillé (${Math.round(gold)} or)`,
        message: 'Tu peux compléter un objet majeur — recall sur une vague poussée pour ton power spike.',
      });
    } else if (gold >= 1300) {
      advice.push({
        id: 'recall-spike',
        priority: 'low',
        category: 'Économie',
        title: `Pense au recall (${Math.round(gold)} or)`,
        message: 'Assez d’or pour un composant important. Recall au bon moment plutôt que de mourir avec l’or sur toi.',
      });
    }
  }

  // 4b. Avantage économique d'équipe (estimé) -> tempo de groupe.
  if (me && gameTime > 240) {
    const allyNet = scoreboard.allies.reduce((s, p) => s + (p.netWorth || 0), 0) + (active.currentGold || 0);
    const enemyNet = scoreboard.enemies.reduce((s, p) => s + (p.netWorth || 0), 0);
    const diff = allyNet - enemyNet;
    if (diff >= 3000) {
      advice.push({
        id: 'team-ahead',
        priority: 'medium',
        category: 'Tempo',
        title: `Avantage d'équipe (~+${Math.round(diff / 1000)}k or)`,
        message: 'Ton équipe est en avance — force la vision et les objectifs (dragon/héraut/baron) pendant la fenêtre.',
      });
    } else if (diff <= -3000) {
      advice.push({
        id: 'team-behind',
        priority: 'medium',
        category: 'Tempo',
        title: `Déficit d'équipe (~${Math.round(diff / 1000)}k or)`,
        message: 'Ton équipe est en retard — évite les fights 50/50, sécurise le farm et joue la défense/scaling jusqu’à un meilleur timing.',
      });
    }
  }

  // 5. CS / minute
  if (me && gameTime > 240) {
    const cspm = me.cs / (gameTime / 60);
    if (cspm < 6 && me.position !== 'JUNGLE') {
      advice.push({
        id: 'low-cs',
        priority: 'low',
        category: 'Farm',
        title: `CS/min faible (${cspm.toFixed(1)})`,
        message: 'Ne néglige pas le farm : récupère tes vagues entre les rotations, vise 7+ CS/min.',
      });
    }
  }

  // 6. Mortalité élevée
  if (me) {
    const contrib = me.kills + me.assists;
    if (me.deaths >= 3 && me.deaths - contrib >= 2) {
      advice.push({
        id: 'dying-much',
        priority: 'high',
        category: 'Macro',
        title: 'Tu meurs trop',
        message: 'Joue plus prudemment : reste avec ton équipe, respecte les fog of war et demande des ganks.',
      });
    }
  }

  // 7. Niveau 6 (spike d'ultime)
  if (me && me.level === 6) {
    advice.push({
      id: 'level-6',
      priority: 'info',
      category: 'Spike',
      title: 'Niveau 6',
      message: 'Ton ultime débloque un power spike — cherche un trade ou un play si l’adversaire est vulnérable.',
    });
  }

  // 8. Réponse à un objectif adverse récent
  for (const e of events) {
    if (e.EventName === 'DragonKill' && gameTime - e.EventTime < 30) {
      advice.push({
        id: 'enemy-dragon',
        priority: 'medium',
        category: 'Macro',
        title: 'Dragon pris',
        message: 'Un dragon vient de tomber — réponds par un autre objectif (tour, héraut, plats) ou un repli propre.',
      });
    }
    if (e.EventName === 'BaronKill' && gameTime - e.EventTime < 40) {
      advice.push({
        id: 'enemy-baron',
        priority: 'high',
        category: 'Macro',
        title: 'Baron pris',
        message: 'Baron actif sur la map — joue ultra groupé, sécurise la vision et évite les pick isolés.',
      });
    }
  }

  // Adversaire direct de lane (réutilisé par plusieurs règles).
  const laneOpp = me && me.position ? scoreboard.enemies.find((e) => e.position === me.position) : null;
  const oppName = laneOpp ? laneOpp.championDisplay || laneOpp.champion : null;

  // 8b. Tempo : force relative vs l'adversaire de lane (niveau + or d'objets).
  if (me && gameTime > 120 && !me.isDead && laneOpp) {
    const lvlDiff = (me.level || 0) - (laneOpp.level || 0);
    const goldDiff = (me.itemGold || 0) - (laneOpp.itemGold || 0);
    if (goldDiff >= 450 || lvlDiff >= 2) {
      const bits = [];
      if (lvlDiff >= 1) bits.push(`+${lvlDiff} niveau${lvlDiff > 1 ? 'x' : ''}`);
      if (goldDiff >= 450) bits.push(`+${goldDiff} or d'objets`);
      advice.push({
        id: 'tempo-ahead',
        priority: 'medium',
        category: 'Tempo',
        title: 'Fenêtre de force',
        message: `Tu es plus fort que ${oppName} (${bits.join(', ')}). Cherche un trade/all-in ou un play sur la map avant qu'il rattrape.`,
      });
    } else if (goldDiff <= -550 || lvlDiff <= -2) {
      advice.push({
        id: 'tempo-behind',
        priority: 'medium',
        category: 'Tempo',
        title: 'Adversaire en avance',
        message: `${oppName} a un spike d'avance — temporise, farm en sécurité, et évite les trades prolongés jusqu'à ton prochain objet.`,
      });
    }
  }

  // 8b-bis. Spike d'objet de l'adversaire de lane (estimé sur son or d'objets).
  // Paliers d'objets complets ≈ 3000 / 6100 / 9200 or. S'il passe un palier
  // avant toi, il a une fenêtre de force à respecter.
  if (me && !me.isDead && gameTime > 300 && laneOpp) {
    const SPIKES = [3000, 6100, 9200];
    const itemTier = (g) => SPIKES.filter((t) => (g || 0) >= t).length; // 0..3
    const oppTier = itemTier(laneOpp.itemGold);
    const myTier = itemTier(me.itemGold);
    if (oppTier >= 1 && oppTier > myTier) {
      advice.push({
        id: 'opp-spike',
        priority: 'medium',
        category: 'Tempo',
        title: `Spike objet de ${oppName}`,
        message: `${oppName} a ~${oppTier} objet(s) complet(s) contre ~${myTier} pour toi — il a un pic de puissance. Respecte ses trades/all-ins et farme jusqu'à compléter le tien.`,
      });
    }
  }

  // 8b-ter. Plaques de tour : fenêtre avant leur chute à 14:00 (840 s).
  if (me && !me.isDead && gameTime > 150 && gameTime < 840 && ['TOP', 'MIDDLE', 'BOTTOM'].includes(me.position)) {
    const left = 840 - gameTime;
    if (left <= 90) {
      advice.push({
        id: 'plates-ending',
        priority: 'medium',
        category: 'Économie',
        title: 'Plaques bientôt terminées',
        message: `Les plaques de tour tombent à 14:00 (dans ${mmss(left)}). Pousse la vague pour en gratter un maximum avant qu'elles disparaissent (~160 or/plaque).`,
      });
    }
  }

  // 8c. Dragon soul : point de soul à contester/sécuriser.
  if (dragons.soulTeam) {
    advice.push({
      id: 'dragon-soul',
      priority: 'high',
      category: 'Macro',
      title: dragons.soulTeam === 'ally' ? 'Vous avez le Dragon Soul' : 'L’ennemi a le Dragon Soul',
      message: dragons.soulTeam === 'ally' ? 'Avantage de teamfight majeur — force les objectifs et les fights groupés.' : 'Désavantage en teamfight prolongé — privilégie les pick et les objectifs rapides, évite les 5v5 à rallonge.',
    });
  } else if (dragons.soulPointTeam) {
    advice.push({
      id: 'dragon-soulpoint',
      priority: 'high',
      category: 'Macro',
      title: 'Prochain dragon = SOUL',
      message: dragons.soulPointTeam === 'ally'
        ? 'Vous êtes à 3 drakes : le prochain donne le Soul. Prends la vision tôt et regroupe pour le sécuriser.'
        : 'L’ennemi est à 3 drakes : le prochain leur donne le Soul. Vision + contest obligatoire, ou refuse-le proprement.',
    });
  }

  // 8d. Counter-build sur les objets réels de l'équipe adverse.
  const cb = counterBuildAdvice(scoreboard, ddragon, meChamp);
  if (cb && gameTime > 600) advice.push(cb);

  // 8e-bis. Jungler adverse « pas vu » : proxy via les events (il apparaît dans
  // les ganks/objectifs). Pas de positions dans l'API -> heuristique honnête.
  if (me && gameTime > 240) {
    const ejg = scoreboard.enemies.find((e) => e.position === 'JUNGLE');
    if (ejg && !ejg.isDead) {
      let lastSeen = null;
      for (const e of events) {
        if (e.EventName !== 'ChampionKill') continue;
        const involved = [e.KillerName, e.VictimName].concat(e.Assisters || []);
        if (involved.includes(ejg.summoner)) lastSeen = Math.max(lastSeen || 0, e.EventTime || 0);
      }
      const since = lastSeen != null ? gameTime - lastSeen : gameTime;
      if (since > 75) {
        advice.push({
          id: 'jungler-mia',
          priority: 'medium',
          category: 'Vision',
          title: 'Jungler adverse discret',
          message: `${ejg.championDisplay || ejg.champion} n'est pas apparu dans un combat depuis ${Math.round(since)}s — pose une ward et respecte un gank possible, surtout si tu es poussé. Recule d'un cran si tu n'as pas de vision.`,
        });
      }
    }
  }

  // 8e. Vision : si tu es sous la moyenne de ton équipe.
  if (me && gameTime > 360 && allyWardAvg > 0 && myWard < allyWardAvg * 0.6) {
    advice.push({
      id: 'low-vision',
      priority: 'low',
      category: 'Vision',
      title: 'Ta vision est faible',
      message: 'Tu es sous la moyenne de vision de ton équipe — achète une pink, pose tes wards avant les objectifs et balaie avec le balayeur.',
    });
  }

  // 9. Objet défensif prioritaire (source unique) : conseil AVEC timing + met à
  // jour les prochains achats (via summary.priorityBuy, lu par buildItemPlan).
  const priorityBuy = choosePriorityDefensive(scoreboard, enemyComp, meChamp, me, ddragon);
  if (priorityBuy && gameTime > 120) {
    advice.push({
      id: 'priority-buy',
      priority: priorityBuy.urgency === 'high' ? 'high' : 'medium',
      category: 'Build',
      title: `Achète ${priorityBuy.item} — ${priorityBuy.when}`,
      message: `${priorityBuy.reason}. Je l'ai placé en tête de tes prochains achats — prends-le ${priorityBuy.urgency === 'high' ? 'dès ton prochain retour, avant de continuer ton core' : 'dans tes 1-2 prochains objets'}.`,
    });
  } else if (enemyComp && gameTime > 60 && gameTime < 900) {
    // Repli : conseil défensif générique si aucun objet prioritaire n'est identifié.
    const sugg = defensiveSuggestions(enemyComp)[0];
    if (sugg) {
      advice.push({
        id: 'defensive-build',
        priority: 'low',
        category: 'Build',
        title: `Build vs comp ${enemyComp.profile}`,
        message: `${sugg.item} — ${sugg.reason}.`,
      });
    }
  }

  // 9b. Anti-soin : si l'équipe adverse heal/shield notablement et que tu fais
  // des dégâts, recommande l'anti-soin (Fléau/Grievous) — à ajouter à tes achats.
  const iDealDamage = meChamp && classifyDamage(meChamp) !== null && !(meChamp.tags || []).includes('Support');
  if (gameTime > 480 && iDealDamage && enemySustain.length >= 2) {
    const names = enemySustain.slice(0, 2).map((e) => e.championDisplay || e.champion).join(', ');
    advice.push({
      id: 'anti-heal',
      priority: 'high',
      category: 'Build',
      title: 'Anti-soin nécessaire (heal/shield en face)',
      message: `${names} et d'autres soignent/bouclient fort. Prends un objet d'anti-soin (Fléau / Blessures graves) à ton prochain achat — sans ça, tu ne les tueras pas en fight prolongé.`,
    });
  }

  // Contexte de combat : combo conseillé + cible par défaut (adversaire de lane).
  const laneOppCombat = me && me.position ? scoreboard.enemies.find((e) => e.position === me.position) : null;
  const combat = {
    combo: comboFor(meChamp),
    defaultTargetKey: laneOppCombat ? laneOppCombat.championKey : null,
    antiHeal: enemySustain.length >= 2,
  };

  // Avance économique estimée (équipe + lane) pour l'indicateur du tableau de bord.
  const allyNet = scoreboard.allies.reduce((s, p) => s + (p.netWorth || 0), 0) + (active.currentGold || 0);
  const enemyNet = scoreboard.enemies.reduce((s, p) => s + (p.netWorth || 0), 0);
  const laneOppForGold = me && me.position ? scoreboard.enemies.find((e) => e.position === me.position) : null;
  const teamGold = { allies: Math.round(allyNet), enemies: Math.round(enemyNet), diff: Math.round(allyNet - enemyNet) };
  const laneGold = me && laneOppForGold
    ? { you: Math.round((me.netWorth || 0) + (active.currentGold || 0)), opp: Math.round(laneOppForGold.netWorth || 0), diff: Math.round((me.netWorth || 0) + (active.currentGold || 0) - (laneOppForGold.netWorth || 0)) }
    : null;

  // ── Détecteur de move risqué (« ATTENTION ») ──────────────────────────────
  // L'API live n'expose PAS les coordonnées : on ne peut pas voir un overextend
  // sur la map. On s'appuie donc sur des signaux fiables et disponibles :
  // infériorité numérique (morts), tes PV, ton or non dépensé, objectif contesté.
  const risk = computeRisk({ me, scoreboard, stats, active, objectives, dragons, gameTime });
  if (risk) {
    advice.push({
      id: 'risk-alert',
      priority: 'high',
      category: 'ATTENTION',
      alert: true,
      cue: { kind: 'beep', freq: 300, ms: 260 },
      title: `ATTENTION — ${risk.title}`,
      message: risk.message,
    });
  }

  // Participation aux kills (KP%) : (tes kills + assists) / kills de l'équipe.
  const teamKills = scoreboard.allies.reduce((s, p) => s + (p.kills || 0), 0);
  const kp = me && teamKills > 0 ? Math.round(((me.kills + me.assists) / teamKills) * 100) : me ? 0 : null;
  // Barons pris (par équipe) via les events.
  const baron = {
    ally: events.filter((e) => e.EventName === 'BaronKill' && scoreboard.allies.some((p) => p.summoner === e.KillerName)).length,
    enemy: events.filter((e) => e.EventName === 'BaronKill' && scoreboard.enemies.some((p) => p.summoner === e.KillerName)).length,
  };
  // Plaques de tour : encore actives jusqu'à 14:00.
  const plates = { active: gameTime < 840, secondsLeft: Math.max(0, Math.round(840 - gameTime)) };

  // KP faible pour un rôle de combat (hors support/jungle) → alerte douce.
  if (me && kp != null && gameTime > 600 && teamKills >= 5 && kp < 45 && !['UTILITY', 'JUNGLE'].includes(me.position)) {
    advice.push({
      id: 'low-kp',
      priority: 'low',
      category: 'Macro',
      title: `Participation aux kills faible (${kp}%)`,
      message: 'Tu manques des combats de ton équipe — rote avec eux sur les objectifs et les fenêtres de pick au lieu de farmer isolé.',
    });
  }

  // Mort juste avant un objectif majeur : tu vas le rater (death timer perdu).
  if (me && me.isDead && me.respawnTimer > 0) {
    const obj = (objectives || [])
      .filter((o) => o.etaSeconds > 0 && ['Dragon', 'Baron', 'Héraut'].includes(o.name) && o.etaSeconds <= me.respawnTimer + 8)
      .sort((a, b) => a.etaSeconds - b.etaSeconds)[0];
    if (obj) {
      advice.push({
        id: 'dead-before-obj',
        priority: 'high',
        category: 'ATTENTION',
        title: `Mort avant ${obj.name}`,
        message: `Tu ressuscites dans ${me.respawnTimer}s et ${obj.name} arrive dans ${mmss(obj.etaSeconds)} — tu risques de le rater. Dis à ton équipe de temporiser ou de ne pas le prendre en infériorité.`,
      });
    }
  }

  // ── Planificateur de recall + timing des vagues ───────────────────────────
  const waves = computeWaves(gameTime);
  let recall = null;
  const nextItemForRecall = nextRecommendedItem(me, ddragon);
  if (me && !me.isDead && active.currentGold != null && nextItemForRecall) {
    const gold = active.currentGold;
    const missing = Math.max(0, nextItemForRecall.cost - Math.round(gold));
    const affordable = gold >= nextItemForRecall.cost;
    // Objectif majeur imminent : conseille de reset MAINTENANT pour être présent.
    const nextObj = (objectives || [])
      .filter((o) => o.etaSeconds > 0 && ['Dragon', 'Baron', 'Héraut'].includes(o.name))
      .sort((a, b) => a.etaSeconds - b.etaSeconds)[0];
    let objectiveReset = null;
    if (nextObj && nextObj.etaSeconds >= 15 && nextObj.etaSeconds <= 55) {
      objectiveReset = `${nextObj.name} dans ${mmss(nextObj.etaSeconds)} — reset MAINTENANT (achat + retour à temps).`;
    }
    const tip = affordable
      ? `Achat dispo : pousse ta vague${waves.nextCannonSeconds != null && waves.nextCannonSeconds <= 25 ? ' (canon dans ' + waves.nextCannonSeconds + 's)' : ''} puis recall pour prendre ton spike.`
      : `Encore ${missing} or pour ${nextItemForRecall.name} — farme ${missing > 600 ? 'une vague ou deux' : 'une vague'} avant de reset.`;
    recall = {
      gold: Math.round(gold),
      item: { name: nextItemForRecall.name, cost: nextItemForRecall.cost, id: nextItemForRecall.id },
      missing,
      affordable,
      pct: Math.min(100, Math.round((gold / nextItemForRecall.cost) * 100)),
      objectiveReset,
      tip,
    };
  }

  const minutes = gameTime / 60;
  const summary = {
    gameTime,
    gameTimeText: mmss(gameTime),
    risk,
    waves,
    recall,
    priorityBuy,
    me: me
      ? {
          champion: me.champion,
          level: me.level,
          kda: `${me.kills}/${me.deaths}/${me.assists}`,
          kp,
          cs: me.cs,
          csPerMin: gameTime > 0 ? +(me.cs / (gameTime / 60)).toFixed(1) : 0,
          csTarget: 10,
          csExpected: minutes > 0 ? Math.round(10 * minutes) : 0,
          csIsJungle: me.position === 'JUNGLE',
          gold: active.currentGold != null ? Math.round(active.currentGold) : null,
          netWorth: me.itemGold || 0,
          hasUlt: (active.abilities && active.abilities.R && active.abilities.R.abilityLevel > 0) || me.level >= 6,
          hasSpike: (me.itemGold || 0) >= 3000,
          hpPct: stats.maxHealth ? pct(stats.currentHealth / stats.maxHealth) : null,
          stats: {
            armor: Math.round(stats.armor || 0),
            mr: Math.round(stats.magicResist || 0),
            ad: Math.round(stats.attackDamage || 0),
            ap: Math.round(stats.abilityPower || 0),
            haste: Math.round(stats.abilityHaste || 0),
          },
        }
      : null,
    enemyComp,
    combat,
    teamGold,
    laneGold,
    dragons,
    towers,
    baron,
    plates,
    objectivesTaken: {
      dragons: { ally: (dragons.ally || []).length, enemy: (dragons.enemy || []).length },
      towers: { ally: towers.ally || 0, enemy: towers.enemy || 0 },
      baron,
    },
    enemyKeystones: scoreboard.enemies.map((e) => ({ champion: e.championDisplay || e.champion, keystone: e.keystone })).filter((x) => x.keystone),
    enemySpells: scoreboard.enemies.map((e) => ({ champion: e.championDisplay || e.champion, spells: e.summonerSpells })),
  };

  return { summary, objectives, scoreboard, advice };
}

// Patch pour lequel les timings OBJ ci-dessus ont été vérifiés.
const OBJ_PATCH = '26.13';

module.exports = { analyzeInGame, computeWaves, mmss, OBJ, OBJ_PATCH };
