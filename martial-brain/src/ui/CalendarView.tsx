/**
 * Vue calendrier — sparrings, compétitions, objectifs.
 *
 * La timeline répond à « qu'est-ce qui s'est passé » ; le calendrier répond à
 * « à quel rythme ». Ce n'est pas la même question : un mois à deux sparrings
 * et un mois à douze racontent la même liste dans la timeline, et deux choses
 * très différentes dans une grille.
 *
 * Aucune date n'est fabriquée ici. Une case vide est une semaine sans séance,
 * et c'est une information — pas un trou à combler.
 */
import { useMemo, type ReactNode } from 'react';
import { eventsInMonth, type DatedEvent } from '../db/timeline';
import { entityDef, section } from '../domain/schema';
import { useDb } from './DbProvider';
import { Empty, Screen, sectionHue, useTheme } from './common';
import { Icon, moduleIcon } from './icons';
import { href, navigate } from './router';

const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

/** Semaine commençant le lundi : c'est la convention française. */
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const pad = (n: number): string => String(n).padStart(2, '0');
const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function shiftMonth(month: string, by: number): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return monthKey(d);
}

export function CalendarView({ month }: { month?: string }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const today = new Date();
  const current = month ?? monthKey(today);
  const [year = today.getFullYear(), monthNum = today.getMonth() + 1] = current.split('-').map(Number);

  const events = useMemo(() => eventsInMonth(db, current), [db, current, revision]);

  const byDay = useMemo(() => {
    const map = new Map<string, DatedEvent[]>();
    for (const e of events) {
      const list = map.get(e.date);
      if (list) list.push(e);
      else map.set(e.date, [e]);
    }
    return map;
  }, [events]);

  // La grille commence au lundi qui précède le 1er, de sorte que chaque colonne
  // soit toujours le même jour de la semaine — sinon on ne peut pas lire « je
  // m'entraîne le mardi » dans la forme du mois.
  const first = new Date(year, monthNum - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthNum - 1, 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      day: d.getDate(),
      inMonth: d.getMonth() === monthNum - 1,
    };
  });

  // Six lignes ne servent que si le mois déborde vraiment ; sinon on en coupe une.
  const lastUseful = cells.findLastIndex((c) => c.inMonth);
  const grid = cells.slice(0, Math.ceil((lastUseful + 1) / 7) * 7);

  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Calendrier</p>
          <h1>
            {MONTH_NAMES[monthNum - 1]} {year}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a
            className="btn"
            href={href({ name: 'calendar', month: shiftMonth(current, -1) })}
            aria-label="Mois précédent"
          >
            <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
          </a>
          <a className="btn" href={href({ name: 'calendar', month: monthKey(today) })}>
            Aujourd’hui
          </a>
          <a
            className="btn"
            href={href({ name: 'calendar', month: shiftMonth(current, 1) })}
            aria-label="Mois suivant"
          >
            <Icon name="chevron" size={14} />
          </a>
        </div>
      </div>

      <div className="cal" role="grid" aria-label={`${MONTH_NAMES[monthNum - 1]} ${year}`}>
        {DAY_NAMES.map((d) => (
          <div key={d} className="cal-h" role="columnheader">
            {d}
          </div>
        ))}

        {grid.map((cell) => {
          const dayEvents = byDay.get(cell.iso) ?? [];
          const classes = [
            'cal-day',
            cell.inMonth ? '' : 'out',
            dayEvents.length ? 'has' : '',
            cell.iso === todayIso ? 'today' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={cell.iso}
              className={classes}
              role="gridcell"
              {...(dayEvents.length ? { tabIndex: 0 } : {})}
              aria-label={`${cell.day} — ${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''}`}
              title={dayEvents.map((e) => `${e.code} · ${e.title}`).join('\n')}
              onClick={() => {
                const first = dayEvents[0];
                if (first) navigate({ name: 'detail', id: first.id });
              }}
              onKeyDown={(e) => {
                const first = dayEvents[0];
                if (first && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  navigate({ name: 'detail', id: first.id });
                }
              }}
            >
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{cell.day}</span>
              {dayEvents.slice(0, 4).map((e) => (
                <span
                  key={`${e.id}-${e.when}`}
                  className="cal-dot"
                  style={{ background: sectionHue(section(entityDef(e.type).section), theme) }}
                />
              ))}
              {dayEvents.length > 4 && <span style={{ fontSize: 9 }}>+{dayEvents.length - 4}</span>}
            </div>
          );
        })}
      </div>

      <h2>{events.length === 0 ? 'Ce mois-ci' : `Ce mois-ci · ${events.length}`}</h2>

      {events.length === 0 ? (
        <Empty>Aucun sparring, combat, décision ni échéance ce mois-ci.</Empty>
      ) : (
        <div className="rows">
          {events.map((e) => (
            <a key={`${e.id}-${e.when}`} className="row" href={href({ name: 'detail', id: e.id })}>
              <Icon
                name={moduleIcon(e.type)}
                size={14}
                style={{
                  color: sectionHue(section(entityDef(e.type).section), theme),
                  flex: 'none',
                }}
              />
              <span className="code">{e.code}</span>
              <span className="title">{e.title}</span>
              <span className="meta">
                {e.note && <span className="tag">{e.note}</span>}
                {e.when === 'échéance' && <span className="tag">échéance</span>}
                <span className="tag">{e.date}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </Screen>
  );
}
