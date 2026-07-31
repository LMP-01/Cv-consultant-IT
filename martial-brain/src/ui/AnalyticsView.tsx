/** §5.3 — the statistical read of your practice. Every figure comes from SQL. */
import { useMemo, type ReactNode } from 'react';
import {
  boutFieldDistribution,
  errorFrequency,
  fieldDistribution,
  fightRecord,
  minutesByDiscipline,
  recurringSituations,
  successRates,
  trainingTotals,
  usageRanking,
} from '../db/analytics';
import { section } from '../domain/schema';
import { useDb } from './DbProvider';
import { BarList, formatMinutes, StatTile } from './charts';
import { sectionHue, useTheme } from './common';
import { href } from './router';

export function AnalyticsView(): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const d = useMemo(
    () => ({
      totals: trainingTotals(db),
      record: fightRecord(db),
      minutes: minutesByDiscipline(db),
      combos: successRates(db, 'combo'),
      counters: successRates(db, 'counter'),
      situations: recurringSituations(db),
      errors: errorFrequency(db),
      techniques: usageRanking(db, 'technique').filter((r) => r.uses > 0).slice(0, 10),
      guards: fieldDistribution(db, 'technique', 'garde'),
      distances: fieldDistribution(db, 'technique', 'distance'),
      families: fieldDistribution(db, 'technique', 'famille'),
      boutDisciplines: boutFieldDistribution(db, 'discipline'),
    }),
    [db, revision],
  );

  const arsenal = sectionHue(section('arsenal'), theme);
  const strategy = sectionHue(section('strategy'), theme);
  const journal = sectionHue(section('journal'), theme);

  const wins = d.record.find((r) => r.label === 'Victoire')?.count ?? 0;
  const officialBouts = d.record.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="main-inner">
      <div className="page-head">
        <div className="grow">
          <p className="sub">Analytics · §5.3</p>
          <h1>Lecture statistique</h1>
        </div>
      </div>

      <p className="banner" style={{ marginBottom: 20 }}>
        <span>
          Tous ces chiffres sont calculés en SQL à partir de tes fiches et de leurs relations —
          aucun n’est produit par un modèle de langage. Un taux de réussite doit être juste,
          pas vraisemblable.
        </span>
      </p>

      <div className="grid">
        <StatTile
          label="Volume enregistré"
          value={formatMinutes(d.totals.minutes)}
          hint={`${d.totals.bouts} séance${d.totals.bouts > 1 ? 's' : ''}`}
        />
        <StatTile
          label="Combats officiels"
          value={officialBouts}
          hint={officialBouts > 0 ? `${wins} victoire${wins > 1 ? 's' : ''}` : 'aucun enregistré'}
        />
        <StatTile
          label="Combinaisons notées"
          value={d.combos.length}
          hint={
            d.combos.length
              ? `réussite médiane ${median(d.combos.map((c) => c.rate))} %`
              : 'aucune probabilité renseignée'
          }
        />
        <StatTile
          label="Contres notés"
          value={d.counters.length}
          hint={
            d.counters.length
              ? `réussite médiane ${median(d.counters.map((c) => c.rate))} %`
              : 'aucun taux renseigné'
          }
        />
      </div>

      <h2>Techniques les plus utilisées</h2>
      <BarList
        hue={arsenal}
        data={d.techniques.map((t) => ({
          label: `${t.code} · ${t.title}`,
          value: t.uses,
          display: `${t.uses}×`,
          href: href({ name: 'detail', id: t.id }),
        }))}
        empty="Relie tes techniques à tes sparrings pour alimenter ce classement."
      />

      <h2>Taux de réussite des combinaisons</h2>
      <BarList
        hue={arsenal}
        max={100}
        data={d.combos.map((c) => ({
          label: `${c.code} · ${c.title}`,
          value: c.rate,
          display: `${c.rate} %`,
          href: href({ name: 'detail', id: c.id }),
        }))}
        empty="Renseigne la probabilité de réussite de tes combinaisons (§4.3)."
      />

      <h2>Efficacité des contres</h2>
      <BarList
        hue={arsenal}
        max={100}
        data={d.counters.map((c) => ({
          label: `${c.code} · ${c.title}`,
          value: c.rate,
          display: `${c.rate} %`,
          href: href({ name: 'detail', id: c.id }),
        }))}
        empty="Renseigne le taux de réussite de tes contres (§4.4)."
      />

      <h2>Situations récurrentes</h2>
      <BarList
        hue={strategy}
        data={d.situations.map((s) => ({
          label: `${s.code} · ${s.title}`,
          value: s.uses,
          display: `${s.uses}×`,
          href: href({ name: 'detail', id: s.id }),
        }))}
        empty="Relie des situations à tes séances pour voir lesquelles reviennent."
      />

      <h2>Fréquence des erreurs</h2>
      <BarList
        hue={journal}
        data={d.errors.map((e) => ({
          label: `${e.code} · ${e.title}`,
          value: e.uses,
          display: `${e.uses}×`,
          href: href({ name: 'detail', id: e.id }),
        }))}
        empty="Relie tes erreurs aux séances où tu les as constatées."
      />

      <h2>Répartition du temps par discipline</h2>
      <BarList
        hue={arsenal}
        data={d.minutes.map((m) => ({
          label: m.label,
          value: m.minutes,
          display: formatMinutes(m.minutes),
        }))}
        empty="Renseigne la durée de tes séances."
      />

      <h2>Séances par discipline</h2>
      <BarList
        hue={journal}
        data={d.boutDisciplines.map((b) => ({ label: b.label, value: b.count }))}
        empty="Renseigne la discipline de tes séances."
      />

      <h2>Arsenal par distance</h2>
      <BarList
        hue={arsenal}
        data={d.distances.map((x) => ({ label: x.label, value: x.count }))}
        empty="Renseigne la distance de tes techniques."
      />

      <h2>Arsenal par garde</h2>
      <BarList
        hue={arsenal}
        data={d.guards.map((x) => ({ label: x.label, value: x.count }))}
        empty="Renseigne la garde de tes techniques."
      />

      <h2>Arsenal par famille</h2>
      <BarList
        hue={arsenal}
        data={d.families.map((x) => ({ label: x.label, value: x.count }))}
        empty="Renseigne la famille de tes techniques."
      />
    </div>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}
