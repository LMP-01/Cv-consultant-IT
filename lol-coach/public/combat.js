/**
 * Moteur d'estimation d'issue de duel/teamfight (trade court vs all-in).
 * Pur et sans dépendance : utilisé côté navigateur (panneau Combat interactif)
 * ET côté Node (tests). Heuristique volontairement lisible — c'est une ESTIMATION
 * indicative, pas une vérité (l'API live n'expose ni PV adverses ni cooldowns).
 *
 * input = {
 *   me: { level, hpPct, netWorth, hasUlt, hasSpike, damage },
 *   targets: [ { name, level, netWorth, sustain, exhaust, ignite, hardCC, hasSpike, tank } ],
 *   alliesNearby: number   // alliés proches EN PLUS de toi (0..4)
 * }
 * -> { trade, allIn, numbers, verdict, factors:[{label, delta}] }
 */
(function (root) {
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function clampProb(v) { return clamp(v, 5, 95); }

  function computeDuel(input) {
    const me = (input && input.me) || {};
    const targets = (input && input.targets) || [];
    if (!targets.length) return null;
    const n = targets.length;
    const alliesNearby = Math.max(0, Math.min(4, (input && input.alliesNearby) || 0));

    const avgTNet = targets.reduce((s, t) => s + (t.netWorth || 0), 0) / n;
    const avgTLvl = targets.reduce((s, t) => s + (t.level || 0), 0) / n;
    const anySustain = targets.some((t) => t.sustain);
    const anyExhaust = targets.some((t) => t.exhaust);
    const anyIgnite = targets.some((t) => t.ignite);
    const anyHardCC = targets.some((t) => t.hardCC);
    const anySpike = targets.some((t) => t.hasSpike);
    const anyTank = targets.some((t) => t.tank);

    const yourSide = 1 + alliesNearby;
    const numAdv = yourSide - n; // >0 : tu es en supériorité numérique

    const goldDiff = (me.netWorth || 0) - avgTNet;
    const lvlDiff = (me.level || 0) - avgTLvl;

    // ── Trade court (échange rapide, sans tout donner) ──
    const tf = [];
    let trade = 50;
    const gT = clamp(goldDiff / 220, -18, 18); trade += gT; tf.push({ label: 'Or/objets', delta: gT });
    const lT = clamp(lvlDiff * 3, -12, 12); trade += lT; if (Math.abs(lvlDiff) >= 1) tf.push({ label: 'Niveau', delta: lT });
    if (me.hpPct != null) { const h = clamp((me.hpPct - 60) / 5, -8, 6); trade += h; if (Math.abs(h) >= 2) tf.push({ label: 'Tes PV', delta: h }); }
    if (me.hasSpike) { trade += 6; tf.push({ label: 'Ton spike', delta: 6 }); }
    if (anySpike) { trade -= 6; tf.push({ label: 'Spike adverse', delta: -6 }); }
    if (anySustain) { trade -= 5; tf.push({ label: 'Sustain adverse', delta: -5 }); }
    if (numAdv !== 0) { const nn = numAdv * 10; trade += nn; tf.push({ label: 'Nombre', delta: nn }); }
    trade = clampProb(trade);

    // ── All-in (engagement total, on commit tout) ──
    const af = [];
    let allIn = 50;
    const gA = clamp(goldDiff / 200, -20, 20); allIn += gA; af.push({ label: 'Or/objets', delta: gA });
    const lA = clamp(lvlDiff * 3.5, -14, 14); allIn += lA; if (Math.abs(lvlDiff) >= 1) af.push({ label: 'Niveau', delta: lA });
    if (me.hasUlt) { allIn += 8; af.push({ label: 'Ton ultime prêt', delta: 8 }); } else { allIn -= 6; af.push({ label: 'Ultime absent', delta: -6 }); }
    if (me.hasSpike) { allIn += 8; af.push({ label: 'Ton spike', delta: 8 }); }
    if (anySpike) { allIn -= 8; af.push({ label: 'Spike adverse', delta: -8 }); }
    if (me.hpPct != null) { const h = clamp((me.hpPct - 70) / 4, -12, 6); allIn += h; if (Math.abs(h) >= 2) af.push({ label: 'Tes PV', delta: h }); }
    if (anyExhaust) { allIn -= 12; af.push({ label: 'Fatigue en face', delta: -12 }); }
    if (anySustain) { allIn -= 6; af.push({ label: 'Sustain adverse', delta: -6 }); }
    if (anyHardCC) { allIn -= 6; af.push({ label: 'CC dur en face', delta: -6 }); }
    if (anyIgnite) { allIn -= 4; af.push({ label: 'Embrasement en face', delta: -4 }); }
    if (anyTank && !me.hasSpike) { allIn -= 5; af.push({ label: 'Tank à percer', delta: -5 }); }
    if (numAdv !== 0) { const nn = numAdv * 13; allIn += nn; af.push({ label: 'Nombre', delta: nn }); }
    allIn = clampProb(allIn);

    const best = Math.max(trade, allIn);
    const verdict = best >= 62 ? 'favorable' : best <= 42 ? 'défavorable' : 'équilibré';

    return {
      trade: Math.round(trade),
      allIn: Math.round(allIn),
      numbers: `${yourSide}v${n}`,
      verdict,
      factors: { trade: tf, allIn: af },
    };
  }

  const api = { computeDuel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Combat = api;
})(typeof window !== 'undefined' ? window : globalThis);
