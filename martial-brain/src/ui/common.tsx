/** Petites pièces partagées : thème, identifiants, puces de fiche, écrans. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProviderId } from '../ai/providers';
import type { EntityRecord } from '../db/queries';
import { entityDef, section, type SectionDef } from '../domain/schema';
import { Icon, moduleIcon } from './icons';
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
  // `data-theme` est toujours posé — par le script d'amorçage puis par
  // `applyPrefs`. Le repli sombre ne sert donc qu'au cas où un test monte un
  // composant sans coquille : il correspond à ce que la feuille de style
  // peindrait alors.
  const read = (): Theme =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const onChange = (): void => setTheme(read());
    onChange();
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
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

/**
 * Un repère par fournisseur — pas le logo protégé de chacun, un badge
 * original dans sa teinte de marque. Trois clés valent la peine d'être
 * distinguées d'un coup d'œil dans les réglages et le sélecteur de modèle ;
 * reproduire les marques exactes d'entreprises tierces dans un dépôt public
 * demanderait des fichiers sous licence que ce projet n'a pas, alors que la
 * couleur seule identifie déjà sans ambiguïté.
 */
export function ProviderMark({ id, size = 18 }: { id: ProviderId; size?: number }): ReactNode {
  const style = { width: size, height: size, flex: 'none' } as const;

  if (id === 'gemini') {
    return (
      <svg viewBox="0 0 24 24" style={style} aria-hidden="true">
        <defs>
          <linearGradient id="pm-gemini" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4F8CFF" />
            <stop offset="55%" stopColor="#9B6BFF" />
            <stop offset="100%" stopColor="#FF6BB0" />
          </linearGradient>
        </defs>
        <path
          d="M12 2c0 4.5 2.9 8.5 8 9-5.1.5-8 4.5-8 9-.6-4.5-3.4-8.5-8-9 4.6-.5 7.4-4.5 8-9Z"
          fill="url(#pm-gemini)"
        />
      </svg>
    );
  }

  if (id === 'groq') {
    return (
      <svg viewBox="0 0 24 24" style={style} aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="#F55036" />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fontFamily="var(--sans)"
          fill="#0f1115"
        >
          Q
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" style={style} aria-hidden="true">
      <defs>
        <linearGradient id="pm-mistral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC53D" />
          <stop offset="55%" stopColor="#FF8A3D" />
          <stop offset="100%" stopColor="#E4442E" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#pm-mistral)" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="800"
        fontFamily="var(--sans)"
        fill="#20130a"
      >
        M
      </text>
    </svg>
  );
}

/**
 * Le plein cadre d'un écran.
 *
 * `screen` rejoue l'animation d'ouverture (glissement + fondu) à chaque
 * changement de route, `inner` borne la largeur du texte : au-delà d'une
 * centaine de caractères par ligne, la lecture décroche.
 */
export function Screen({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="pane screen">
      <div className="inner">{children}</div>
    </div>
  );
}

/**
 * L'identifiant K001 / PR003, teinté par sa section — et copiable d'un clic.
 *
 * Le cahier des charges veut que « les IDs ressortent immédiatement » et que
 * copier un identifiant déclenche une confirmation. Les deux vont ensemble :
 * un identifiant est fait pour être cité ailleurs, donc pour être pris.
 */
export function Code({ record }: { record: EntityRecord }): ReactNode {
  const theme = useTheme();
  const hue = sectionHue(section(entityDef(record.type).section), theme);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (event: React.MouseEvent): void => {
    // Le code est souvent posé dans un lien vers la fiche : copier ne doit pas
    // aussi naviguer, sinon on ne peut jamais faire l'un sans l'autre.
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard?.writeText(record.code).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  };

  if (copied) {
    return (
      <span className="copied" role="status">
        <Icon name="check" size={12} />
        {record.code} copié
      </span>
    );
  }

  return (
    <span
      className="code"
      title={`Copier ${record.code}`}
      role="button"
      tabIndex={0}
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') copy(e as unknown as React.MouseEvent);
      }}
      style={{
        // @ts-expect-error -- CSS custom properties are not in CSSProperties
        '--code-ink': hue,
        '--code-bg': `color-mix(in srgb, ${hue} 14%, transparent)`,
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
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 0 }}
      >
        <Code record={record} />
        <span className="t">{record.title}</span>
      </a>
      {onRemove && (
        <button
          type="button"
          className="icon-btn"
          style={{ width: 18, height: 18 }}
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          aria-label={`Retirer ${record.code}`}
        >
          <Icon name="close" size={11} />
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

/**
 * Un statut : couleur ET icône ET libellé.
 *
 * Ce n'est pas une précaution de principe. Les couleurs de statut du cahier
 * des charges — #FFCC00 et #30D158 — ne sont séparées que de ΔE 5,4 sous
 * protanopie, très en dessous du seuil utilisable. Sans l'icône et le mot,
 * un daltonien ne distinguerait pas « atteint » de « en retard ». C'est donc
 * cette fonction, et pas la couleur, qui porte l'information.
 */
export function Status({
  level,
  children,
}: {
  level: 'good' | 'warn' | 'bad' | 'info';
  children: ReactNode;
}): ReactNode {
  const icon = level === 'good' ? 'ok' : level === 'warn' ? 'warn' : level === 'bad' ? 'bad' : 'info';
  return (
    <span className={`status ${level}`}>
      <Icon name={icon} size={13} />
      {children}
    </span>
  );
}

/** L'icône du module d'une fiche, teintée par sa section. */
export function TypeIcon({ record, size = 15 }: { record: EntityRecord; size?: number }): ReactNode {
  const theme = useTheme();
  return (
    <Icon
      name={moduleIcon(record.type)}
      size={size}
      style={{ color: sectionHue(section(entityDef(record.type).section), theme) }}
    />
  );
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <div className="empty">{children}</div>;
}
