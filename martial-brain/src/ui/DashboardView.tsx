/**
 * Tableau de bord — ce que le graphe sait de toi, sans rien te demander.
 *
 * La disposition est celle du cahier des charges : objectifs, dernières
 * activités et statistiques côte à côte en haut, puis les graphiques, puis les
 * techniques récentes, puis les dernières hypothèses. C'est un ordre de
 * lecture, pas une grille arbitraire : d'abord où tu vas, puis d'où tu viens,
 * puis ce que tu cherches encore.
 *
 * Rien n'est saisi ici. Chaque chiffre est dérivé des fiches et de leurs
 * relations — un tableau de bord qu'il faudrait tenir à jour à la main serait
 * exactement le carnet d'entraînement que ce système refuse d'être.
 */
import { useMemo, type ReactNode } from 'react';
import {
  forgottenTechniques,
  graphHealth,
  mainWeapons,
  minutesByDiscipline,
  objectiveProgress,
  recentBouts,
  trainingTotals,
  type ObjectiveRow,
} from '../db/analytics';
import { listEntities } from '../db/queries';
import { entityDef, section } from '../domain/schema';
import { useDb } from './DbProvider';
import { BarList, formatMinutes } from './charts';
import { Code, Dot, Screen, Status, useTheme, sectionHue } from './common';
import { Icon, moduleIcon } from './icons';
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
      techniques: listEntities(db, 'technique', { orderBy: 'updated', limit: 6 }),
      hypotheses: listEntities(db, 'hypothesis', { orderBy: 'updated', limit: 4 }),
    }),
    [db, revision],
  );

  const arsenalHue = sectionHue(section('arsenal'), theme);
  const progressHue = sectionHue(section('progress'), theme);

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Tableau de bord</p>
          <h1>Ton style, en l’état</h1>
        </div>
      </div>

      {/* Objectifs · Dernières activités · Statistiques */}
      <div className="grid three">
        <div className="card">
          <h4>
            <Icon name="objective" size={12} /> Objectifs
          </h4>
          {data.objectives.length === 0 ? (
            <p className="sub">
              Aucun objectif.{' '}
              <a href={href({ name: 'create', type: 'objective' })} style={{ color: 'var(--accent)' }}>
                En définir un
              </a>
              .
            </p>
          ) : (
            <ObjectiveMiniList hue={progressHue} objectives={data.objectives} />
          )}
        </div>

        <div className="card">
          <h4>
            <Icon name="sparring" size={12} /> Dernières activités
          </h4>
          {data.bouts.length === 0 ? (
            <p className="sub">Aucun sparring ni combat enregistré.</p>
          ) : (
            <div className="mini">
              {data.bouts.map((b) => (
                <a key={b.id} className="mini-row" href={href({ name: 'detail', id: b.id })}>
                  <Dot section={section(entityDef(b.type).section)} theme={theme} />
                  <span className="t">{b.title}</span>
                  <span className="tag">{b.date ?? '—'}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h4>
            <Icon name="analytics" size={12} /> Statistiques
          </h4>
          <dl className="props">
            <div>
              <dt>Fiches</dt>
              <dd className="big">{data.health.entities}</dd>
            </div>
            <div>
              <dt>Relations</dt>
              <dd className="big">{data.health.links}</dd>
            </div>
            <div>
              <dt>Temps enregistré</dt>
              <dd className="big">{formatMinutes(data.totals.minutes)}</dd>
            </div>
            <div>
              <dt>Fiches isolées</dt>
              <dd>
                {data.health.orphans === 0 ? (
                  <Status level="good">tout est relié</Status>
                ) : (
                  <Status level="warn">
                    {data.health.orphans} à relier
                  </Status>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {data.health.orphans > 0 && (
        <p className="banner warn" style={{ marginTop: 14 }}>
          <Icon name="warn" size={15} />
          <span>
            {data.health.orphans} fiche{data.health.orphans > 1 ? 's' : ''} ne sont reliées à rien.
            Une fiche isolée est une note de carnet — c’est précisément ce que ce système n’est pas
            censé être (§1).{' '}
            <a href={href({ name: 'graph' })} style={{ color: 'var(--accent)' }}>
              Voir le graphe
            </a>
          </span>
        </p>
      )}

      {/* Graphiques principaux */}
      <div className="grid two">
        <div className="card">
          <h4>Armes principales</h4>
          <p className="sub" style={{ margin: '0 0 10px' }}>
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
        </div>

        <div className="card">
          <h4>Temps par discipline</h4>
          <p className="sub" style={{ margin: '0 0 10px' }}>
            {data.totals.bouts} séance{data.totals.bouts > 1 ? 's' : ''} enregistrée
            {data.totals.bouts > 1 ? 's' : ''}.
          </p>
          <BarList
            hue={arsenalHue}
            data={data.minutes.map((m) => ({
              label: m.label,
              value: m.minutes,
              display: formatMinutes(m.minutes),
            }))}
            empty="Renseigne la durée de tes séances pour voir la répartition."
          />
        </div>
      </div>

      {/* Techniques récentes */}
      <h2>Techniques récentes</h2>
      {data.techniques.length === 0 ? (
        <div className="empty">Aucune technique fichée.</div>
      ) : (
        <div className="rows">
          {data.techniques.map((t) => (
            <a key={t.id} className="row" href={href({ name: 'detail', id: t.id })}>
              <Icon name={moduleIcon('technique')} size={14} style={{ color: arsenalHue, flex: 'none' }} />
              <Code record={t} />
              <span className="title">{t.title}</span>
              <span className="meta">
                {t.data.famille ? <span className="tag">{String(t.data.famille)}</span> : null}
                {t.data.distance ? <span className="tag">{String(t.data.distance)}</span> : null}
              </span>
            </a>
          ))}
        </div>
      )}

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

      {/* Dernières hypothèses */}
      <h2>Dernières hypothèses</h2>
      {data.hypotheses.length === 0 ? (
        <div className="empty">
          Aucune hypothèse.{' '}
          <a href={href({ name: 'create', type: 'hypothesis' })} style={{ color: 'var(--accent)' }}>
            En formuler une
          </a>{' '}
          — c’est ce qui transforme une intuition en connaissance.
        </div>
      ) : (
        <div className="rows">
          {data.hypotheses.map((h) => {
            const validation = String(h.data.validation ?? 'Non testée');
            const level =
              validation === 'Validée'
                ? 'good'
                : validation === 'Invalidée'
                  ? 'bad'
                  : ('warn' as const);
            return (
              <a key={h.id} className="row" href={href({ name: 'detail', id: h.id })}>
                <Code record={h} />
                <span className="title">{h.title}</span>
                <span className="meta">
                  <Status level={level}>{validation}</Status>
                  <span className="tag">{String(h.data.date ?? '—')}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

/**
 * Les objectifs, en entier.
 *
 * `BarList` sert les classements courts — un nom de technique, une discipline
 * — dans une colonne de 90 à 190 px. Un objectif est une phrase complète
 * (« Améliorer la défense en garde basse ») : la forcer dans la même colonne
 * la tronque au caractère près et, pire, peut faire déborder la ligne — un
 * conteneur flex dont aucun enfant ne rétrécit impose sa largeur à la carte
 * qui l'accueille.
 *
 * Le titre s'affiche donc en entier, sans troncature ni limite de lignes : la
 * carte grandit avec lui plutôt que de le couper. Une phrase réellement
 * démesurée passe par `wordSafeSummary` — jamais par l'ellipsis CSS, qui
 * coupe au pixel près et donc parfois en plein mot (constaté : « pendant
 * l… » au milieu de « les »). Le mot entier reste toujours visible ; le
 * titre complet reste de toute façon lisible au survol.
 */
function ObjectiveMiniList({
  hue,
  objectives,
}: {
  hue: string;
  objectives: readonly ObjectiveRow[];
}): ReactNode {
  return (
    <div className="obj-list">
      {objectives.map((o) => (
        <a key={o.id} className="obj-row" href={href({ name: 'detail', id: o.id })} title={o.title}>
          <div className="obj-head">
            <span className="obj-title">{wordSafeSummary(o.title)}</span>
            <span className="obj-pct">{o.progress} %</span>
          </div>
          <div className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(o.progress, o.progress > 0 ? 2 : 0)}%`, background: hue }}
            />
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Un résumé, seulement si la phrase est vraiment démesurée — au-delà, la
 * carte Objectifs déborderait le reste du tableau de bord pour une seule
 * ligne. La coupe se fait au dernier espace avant la limite, jamais entre
 * deux lettres d'un même mot : c'est la garantie qu'un ellipsis CSS ne donne
 * pas.
 */
function wordSafeSummary(text: string, max = 170): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const cut = trimmed.slice(0, max);
  const at = cut.lastIndexOf(' ');
  // Un seul mot géant sans espace : rien à couper proprement, on tranche.
  return `${(at > max * 0.4 ? cut.slice(0, at) : cut).replace(/[,.;: ]+$/, '')}…`;
}
