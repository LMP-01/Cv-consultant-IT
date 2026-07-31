/** Small shared pieces: theme awareness, code chips, entity chips. */
import { useEffect, useState, type ReactNode } from 'react';
import type { EntityRecord } from '../db/queries';
import { entityDef, section, type SectionDef } from '../domain/schema';
import { href, navigate } from './router';

export type Theme = 'light' | 'dark';

/**
 * Which palette column applies right now.
 *
 * The section hues are two validated sets — one stepped for the light surface,
 * one for the dark — not a single set with a filter applied, so the app has to
 * know which mode it is in rather than letting CSS flip it.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      const stamped = document.documentElement.dataset.theme;
      if (stamped === 'light' || stamped === 'dark') setTheme(stamped);
      else setTheme(mq.matches ? 'dark' : 'light');
    };
    onChange();
    mq.addEventListener('change', onChange);
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', onChange);
      observer.disconnect();
    };
  }, []);

  return theme;
}

export function sectionHue(def: SectionDef, theme: Theme): string {
  return theme === 'dark' ? def.dark : def.light;
}

/** The shape that carries a section's identity when hue alone is not enough. */
export function Dot({ section: s, theme }: { section: SectionDef; theme: Theme }): ReactNode {
  return (
    <i
      className={`dot ${s.shape}`}
      style={{ color: sectionHue(s, theme) }}
      aria-hidden="true"
    />
  );
}

/** The K001 / PR003 handle, tinted by its section. */
export function Code({ record }: { record: EntityRecord }): ReactNode {
  const theme = useTheme();
  const hue = sectionHue(section(entityDef(record.type).section), theme);
  return (
    <span
      className="code"
      style={{
        // @ts-expect-error -- CSS custom properties are not in CSSProperties
        '--code-ink': hue,
        '--code-bg': `color-mix(in srgb, ${hue} 14%, transparent)`,
        '--code-line': `color-mix(in srgb, ${hue} 35%, transparent)`,
      }}
    >
      {record.code}
    </span>
  );
}

/** A clickable reference to another fiche. */
export function EntityChip({
  record,
  onRemove,
}: {
  record: EntityRecord;
  onRemove?: () => void;
}): ReactNode {
  return (
    <span className="chip">
      <a
        href={href({ name: 'detail', id: record.id })}
        className="t"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 0 }}
      >
        <Code record={record} />
        <span className="t">{record.title}</span>
      </a>
      {onRemove && (
        <button
          type="button"
          className="btn sm"
          style={{ border: 'none', background: 'none', padding: '0 2px', lineHeight: 1 }}
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          aria-label={`Retirer ${record.code}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Row in a list view. */
export function EntityRow({ record }: { record: EntityRecord }): ReactNode {
  const def = entityDef(record.type);
  const theme = useTheme();
  const tags = Array.isArray(record.data.tags) ? (record.data.tags as string[]) : [];

  const summary = def.fields
    .filter((f) => f.inList)
    .map((f) => {
      const raw = record.data[f.name];
      if (raw == null || raw === '') return undefined;
      return f.type === 'percent' ? `${String(raw)} %` : String(raw);
    })
    .filter(Boolean) as string[];

  return (
    <div
      className="row"
      role="link"
      tabIndex={0}
      onClick={() => navigate({ name: 'detail', id: record.id })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate({ name: 'detail', id: record.id });
        }
      }}
    >
      <Dot section={section(def.section)} theme={theme} />
      <Code record={record} />
      <span className="title">{record.title}</span>
      <span className="meta">
        {summary.slice(0, 3).map((s) => (
          <span key={s} className="tag">
            {s}
          </span>
        ))}
        {tags.slice(0, 2).map((t) => (
          <span key={t} className="tag">
            #{t}
          </span>
        ))}
      </span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <div className="empty">{children}</div>;
}
