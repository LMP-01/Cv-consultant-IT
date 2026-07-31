/** §4.1 — what the graph knows about you, without asking you anything. */
import { useMemo, type ReactNode } from 'react';
import {
  forgottenTechniques,
  graphHealth,
  mainWeapons,
  minutesByDiscipline,
  objectiveProgress,
  recentBouts,
  recentlyEdited,
  trainingTotals,
} from '../db/analytics';
import { entityDef, section } from '../domain/schema';
import { useDb } from './DbProvider';
import { BarList, formatMinutes, StatTile } from './charts';
import { Dot, useTheme, sectionHue } from './common';
import { href } from './router';

export function DashboardView(): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const data = useMemo(
    () => ({
      health: graphHealth(db),
      totals: trainingTotals(db),
      minutes: minutesByDiscipline(db),
      weapons: mainWeapons(db, 6),
      forgotten: forgottenTechniques(db, 6),
      objectives: objectiveProgress(db).slice(0, 5),
      bouts: recentBouts(db, 5),
      edited: recentlyEdited(db, 6),
    }),
    [db, revision],
  );

  const arsenalHue = sectionHue(section('arsenal'), theme);
  const progressHue = sectionHue(section('progress'), theme);

  return (
    <div className="main-inner">
      <div className="page-head">
        <div className="grow">
          <p className="sub">Tableau de bord</p>
          <h1>Ton style, en l’état</h1>
        </div>
      </div>

      <div className="grid">
        <StatTile label="Fiches" value={data.health.entities} hint={`${data.health.links} relations`} />
        <StatTile
          label="Temps enregistré"
          value={formatMinutes(data.totals.minutes)}
          hint={`${data.totals.bouts} séance${data.totals.bouts > 1 ? 's' : ''}`}
        />
        <StatTile
          label="Hypothèses ouvertes"
          value={data.health.hypothesesOpen}
          hint="en attente de vérification"
        />
        <StatTile
          label="Fiches isolées"
          value={data.health.orphans}
          hint={data.health.orphans === 0 ? 'tout est relié' : 'à relier au graphe'}
        />
      </div>

      {data.health.orphans > 0 && (
        <p className="banner warn" style={{ marginTop: 16 }}>
          <span>
            {data.health.orphans} fiche{data.health.orphans > 1 ? 's' : ''} ne sont reliées à rien.
            Une fiche isolée est une note de carnet — c’est précisément ce que ce système n’est pas
            censé être (§1).
          </span>
        </p>
      )}

      <h2>Armes principales</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Techniques que tes sparrings et combats mentionnent le plus.
      </p>
      <BarList
        hue={arsenalHue}
        data={data.weapons.map((w) => ({
          label: `${w.code} · ${w.title}`,
          value: w.uses,
          display: `${w.uses}×`,
          href: href({ name: 'detail', id: w.id }),
        }))}
        empty="Relie des techniques à tes sparrings pour voir tes armes ressortir."
      />

      {data.forgotten.length > 0 && (
        <>
          <h2>Techniques oubliées</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            Fichées mais jamais mentionnées dans une séance.
          </p>
          <div className="chips">
            {data.forgotten.map((t) => (
              <a key={t.id} className="chip" href={href({ name: 'detail', id: t.id })}>
                <span className="t">
                  {t.code} · {t.title}
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      <h2>Temps par discipline</h2>
      <BarList
        hue={arsenalHue}
        data={data.minutes.map((m) => ({
          label: m.label,
          value: m.minutes,
          display: formatMinutes(m.minutes),
        }))}
        empty="Renseigne la durée de tes séances pour voir la répartition."
      />

      <h2>Objectifs</h2>
      {data.objectives.length === 0 ? (
        <div className="empty">Aucun objectif défini.</div>
      ) : (
        <BarList
          hue={progressHue}
          max={100}
          data={data.objectives.map((o) => ({
            label: o.title,
            value: o.progress,
            display: `${o.progress} %`,
            href: href({ name: 'detail', id: o.id }),
          }))}
        />
      )}

      <h2>Dernières séances</h2>
      {data.bouts.length === 0 ? (
        <div className="empty">Aucun sparring ni combat enregistré.</div>
      ) : (
        <div className="rows">
          {data.bouts.map((b) => (
            <a key={b.id} className="row" href={href({ name: 'detail', id: b.id })}>
              <Dot section={section(entityDef(b.type).section)} theme={theme} />
              <span className="title">{b.title}</span>
              <span className="meta">
                {b.discipline && <span className="tag">{b.discipline}</span>}
                {b.result && <span className="tag">{b.result}</span>}
                <span className="tag">{b.date ?? '—'}</span>
              </span>
            </a>
          ))}
        </div>
      )}

      <h2>Modifié récemment</h2>
      <div className="chips">
        {data.edited.map((e) => (
          <a key={e.id} className="chip" href={href({ name: 'detail', id: e.id })}>
            <Dot section={section(entityDef(e.type).section)} theme={theme} />
            <span className="t">
              {e.code} · {e.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
