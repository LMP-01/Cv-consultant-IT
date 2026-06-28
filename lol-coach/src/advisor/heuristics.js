'use strict';

const { analyzeComp, defensiveSuggestions } = require('./profile');

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
    };
  };

  const allies = all.filter((p) => p.team === myTeam).map(mapPlayer);
  const enemies = all.filter((p) => p.team !== myTeam).map(mapPlayer);
  return { me: me ? mapPlayer(me) : null, allies, enemies, myTeam };
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
  }

  const objectives = [];

  // Dragon
  let dragonEta;
  if (lastDragon != null) dragonEta = lastDragon + OBJ.DRAGON_RESPAWN - gameTime;
  else dragonEta = OBJ.DRAGON_FIRST - gameTime;
  objectives.push({ name: 'Dragon', icon: '🐉', etaSeconds: Math.max(0, dragonEta) });

  // Voidgrubs (avant 14:45, une à deux apparitions)
  if (gameTime < 885 && !grubsDone) {
    objectives.push({ name: 'Voidgrubs', icon: '🪲', etaSeconds: Math.max(0, OBJ.VOIDGRUBS_SPAWN - gameTime) });
  }

  // Rift Herald (15:00, sans respawn, despawn ~19:45)
  if (!heraldDead && gameTime < 1185) {
    objectives.push({ name: 'Héraut', icon: '👁️', etaSeconds: Math.max(0, OBJ.HERALD_SPAWN - gameTime) });
  }

  // Baron Nashor
  let baronEta;
  if (lastBaron != null) baronEta = lastBaron + OBJ.BARON_RESPAWN - gameTime;
  else baronEta = OBJ.BARON_SPAWN - gameTime;
  if (gameTime >= OBJ.HERALD_SPAWN - 120 || baronEta <= 180) {
    objectives.push({ name: 'Baron', icon: '🟣', etaSeconds: Math.max(0, baronEta) });
  }

  for (const o of objectives) o.etaSeconds = Math.max(0, Math.round(o.etaSeconds));
  return objectives;
}

/**
 * Moteur de conseils en jeu basé sur des règles.
 * @returns {{summary, objectives, scoreboard, advice}}
 */
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
  }

  // 2. Objectifs imminents / disponibles
  for (const obj of objectives) {
    if (obj.etaSeconds === 0) {
      advice.push({
        id: `obj-now-${obj.name}`,
        priority: obj.name === 'Baron' || obj.name === 'Dragon' ? 'high' : 'medium',
        category: 'Objectif',
        title: `${obj.icon} ${obj.name} disponible`,
        message: `${obj.name} est apparu — prends la vision autour et regroupe pour le contester.`,
      });
    } else if (obj.etaSeconds <= 45) {
      advice.push({
        id: `obj-soon-${obj.name}`,
        priority: 'medium',
        category: 'Objectif',
        title: `${obj.icon} ${obj.name} dans ${mmss(obj.etaSeconds)}`,
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

  // 4. Recall / spike d'or
  if (active.currentGold != null && !me?.isDead) {
    const gold = active.currentGold;
    if (gold >= 2200) {
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

  // 9. Conseil défensif unique selon la team adverse
  if (enemyComp && gameTime > 60 && gameTime < 900) {
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

  const summary = {
    gameTime,
    gameTimeText: mmss(gameTime),
    me: me
      ? {
          champion: me.champion,
          level: me.level,
          kda: `${me.kills}/${me.deaths}/${me.assists}`,
          cs: me.cs,
          csPerMin: gameTime > 0 ? +(me.cs / (gameTime / 60)).toFixed(1) : 0,
          gold: active.currentGold != null ? Math.round(active.currentGold) : null,
          hpPct: stats.maxHealth ? pct(stats.currentHealth / stats.maxHealth) : null,
        }
      : null,
    enemyComp,
  };

  return { summary, objectives, scoreboard, advice };
}

module.exports = { analyzeInGame, mmss, OBJ };
