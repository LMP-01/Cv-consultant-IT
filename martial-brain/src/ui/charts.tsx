/**
 * Chart primitives.
 *
 * Only two forms are used in this app, chosen from the data's job rather than
 * from variety:
 *   · StatTile — a single headline magnitude, where a chart would be noise.
 *   · BarList  — ranked categories (minutes per discipline, most-used
 *                techniques, error frequency). Horizontal because the labels
 *                are words, and words read left-to-right without rotating.
 *
 * There are no pie charts and no dual axes here on purpose. Each BarList is a
 * single series, so it needs no legend — the heading names it — and every bar
 * is directly labelled with its value instead of relying on an axis.
 */
import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
}): ReactNode {
  return (
    <div className="card">
      <div className="field-label">{label}</div>
      <div style={{ fontSize: 27, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 4 }}>{unit}</span>
        )}
      </div>
      {hint && (
        <div className="sub" style={{ marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Rendered instead of the raw number when set (e.g. "1 h 15"). */
  display?: string;
  href?: string;
}

export function BarList({
  data,
  hue = 'var(--accent)',
  max,
  empty = 'Pas encore de données.',
}: {
  data: readonly BarDatum[];
  hue?: string;
  max?: number;
  empty?: string;
}): ReactNode {
  if (data.length === 0) return <div className="empty">{empty}</div>;

  const ceiling = max ?? Math.max(...data.map((d) => d.value), 1);

  return (
    // `minWidth: 0` casse un piège classique de Grid/Flexbox : sans lui, une
    // ligne flex dont les enfants ne rétrécissent pas (le libellé et la valeur
    // sont `flex: none`) impose sa largeur de contenu à la colonne de grille
    // qui l'accueille, laquelle grandit alors au-delà de l'espace disponible
    // plutôt que de s'y tenir — un débordement de quelques pixels, invisible
    // en largeur confortable, net dans une carte étroite.
    <div style={{ display: 'grid', gap: 7, minWidth: 0 }}>
      {data.map((d) => {
        const pct = ceiling > 0 ? (d.value / ceiling) * 100 : 0;
        const row = (
          <>
            <span
              style={{
                width: 'clamp(90px, 30%, 190px)',
                flex: 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13.5,
                color: 'var(--ink-2)',
              }}
              title={d.label}
            >
              {d.label}
            </span>
            <span
              style={{
                flex: 1,
                height: 10,
                background: 'var(--plane)',
                borderRadius: 2,
                overflow: 'hidden',
                minWidth: 40,
              }}
            >
              {/* thin mark, rounded data-end, anchored to the baseline */}
              <span
                style={{
                  display: 'block',
                  width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                  height: '100%',
                  background: hue,
                  borderRadius: '2px 4px 4px 2px',
                }}
              />
            </span>
            <span
              style={{
                width: 58,
                flex: 'none',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 13,
                color: 'var(--ink-2)',
              }}
            >
              {d.display ?? d.value}
            </span>
          </>
        );

        return d.href ? (
          <a
            key={d.label}
            href={d.href}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
            title={`${d.label} — ${d.display ?? d.value}`}
          >
            {row}
          </a>
        ) : (
          <div
            key={d.label}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}
            title={`${d.label} — ${d.display ?? d.value}`}
          >
            {row}
          </div>
        );
      })}
    </div>
  );
}

/** "84" → "1 h 24". Minutes alone stop being readable past an hour or two. */
export function formatMinutes(total: number): string {
  if (total <= 0) return '0 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}
