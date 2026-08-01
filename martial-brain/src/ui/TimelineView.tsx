/**
 * Timeline — une page dédiée, navigation par année.
 *
 * Ce que le cahier des charges décrit est une lecture verticale : « 2026 →
 * premier combat → KO → début Kudo → nouvelle hypothèse → création PR012 ».
 * Autrement dit, une trajectoire, pas un journal de bord. Aucune donnée n'est
 * saisie ici : la page ne fait que relire les fiches qui portent une date.
 */
import { useMemo, type ReactNode } from 'react';
import { datedEvents, eventYears } from '../db/timeline';
import { entityDef, section } from '../domain/schema';
import { useDb } from './DbProvider';
import { Empty, Screen, sectionHue, useTheme } from './common';
import { Icon, moduleIcon } from './icons';
import { href, navigate } from './router';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2026-04-12 » → « 12 avril ». L'année est déjà le titre de la section. */
function humanDate(iso: string): string {
  const [, m = '', d = ''] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month}` : iso;
}

export function TimelineView({ year }: { year?: number }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const { events, years } = useMemo(
    () => ({ events: datedEvents(db), years: eventYears(db) }),
    [db, revision],
  );

  // Sans année demandée, on ouvre sur la plus récente : c'est celle qu'on
  // regarde dans 95 % des cas, et elle évite une page infinie au premier
  // chargement.
  const current = year ?? years[0];
  const shown = events.filter((e) => e.date.startsWith(String(current)));

  if (years.length === 0) {
    return (
      <Screen>
        <div className="page-head">
          <div className="grow">
            <p className="sub">Timeline</p>
            <h1>Ta trajectoire</h1>
          </div>
        </div>
        <Empty>
          Rien de daté pour l’instant. Un sparring, un combat, une hypothèse ou une décision
          apparaîtront ici dès qu’ils porteront une date.
        </Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Timeline</p>
          <h1>Ta trajectoire</h1>
        </div>
        <a className="btn" href={href({ name: 'calendar' })}>
          <Icon name="calendar" size={14} />
          Vue calendrier
        </a>
      </div>

      <div className="chips" role="tablist" aria-label="Année">
        {years.map((y) => (
          <a
            key={y}
            role="tab"
            aria-selected={y === current}
            className={`chip${y === current ? ' on' : ''}`}
            href={href({ name: 'timeline', year: y })}
          >
            <span className="t">{y}</span>
          </a>
        ))}
      </div>

      <h2>
        {current} · {shown.length} événement{shown.length > 1 ? 's' : ''}
      </h2>

      {shown.length === 0 ? (
        <Empty>Aucun événement daté en {current}.</Empty>
      ) : (
        <div className="timeline">
          {shown.map((event) => {
            const def = entityDef(event.type);
            const hue = sectionHue(section(def.section), theme);
            return (
              <div
                key={`${event.id}-${event.when}`}
                className="tl-item"
                role="link"
                tabIndex={0}
                // @ts-expect-error -- CSS custom properties are not in CSSProperties
                style={{ '--dot': hue }}
                onClick={() => navigate({ name: 'detail', id: event.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate({ name: 'detail', id: event.id });
                  }
                }}
              >
                <div className="tl-date">
                  {humanDate(event.date)}
                  {event.when === 'échéance' && ' · échéance'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <Icon name={moduleIcon(event.type)} size={14} style={{ color: hue, flex: 'none' }} />
                  <span className="code">{event.code}</span>
                  <span style={{ fontSize: 13.5 }}>{event.title}</span>
                  {event.note && <span className="tag">{event.note}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
