/**
 * Une fiche, disposée comme le demande le cahier des charges :
 *
 *   Nom + ID + Tags
 *   ├── médias ──┬── contenu principal ──┬── liens & propriétés
 *   Notes
 *
 * La répartition n'est pas arbitraire, elle suit la nature des champs. Ce qui
 * est long et se lit en continu (description, analyse, applications) va au
 * centre ; ce qui est court et se compare d'un coup d'œil (distance, garde,
 * date, statut) va à droite avec les relations ; les commentaires libres
 * ferment la fiche en pleine largeur, parce qu'ils s'écrivent après coup.
 *
 * §2.3 : « l'affichage de n'importe quelle fiche récapitule automatiquement
 * l'ensemble des éléments source et cible qui y font référence. » La colonne
 * de droite montre donc TOUS les voisins, pas seulement les modules que le
 * descripteur suggère — un lien fait depuis l'autre côté est tout aussi réel.
 *
 * « Historique » est dérivé plutôt que stocké : l'historique d'une technique,
 * ce sont les sparrings et combats qui la mentionnent, du plus récent au plus
 * ancien. Le saisir à la main dupliquerait ce que le graphe sait déjà.
 */
import { useMemo, type ReactNode } from 'react';
import { deleteEntity, getEntity, type EntityRecord } from '../../db/queries';
import { neighboursByType } from '../../domain/links';
import { entityDef, section, type EntityKey, type FieldDef } from '../../domain/schema';
import { useDb } from '../DbProvider';
import { Code, Dot, EntityChip, Screen, Status, useTheme } from '../common';
import { Icon, moduleIcon } from '../icons';
import { href, navigate } from '../router';
import { AiAssist } from './AiAssist';
import { MediaColumn } from './MediaColumn';

const isEmpty = (v: unknown): boolean =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Le centre porte la prose ; la droite porte ce qui se lit en un coup d'œil. */
const isProse = (f: FieldDef): boolean => f.type === 'longtext' || f.type === 'sequence';

/** Les commentaires ferment la fiche, en pleine largeur. */
const isNote = (f: FieldDef): boolean => f.name === 'notes';

export function EntityDetailView({ id }: { id: string }): ReactNode {
  const { db, write, flush, revision } = useDb();
  const theme = useTheme();

  const record = useMemo(() => getEntity(db, id), [db, id, revision]);
  const neighbours = useMemo(
    (): Map<EntityKey, EntityRecord[]> =>
      record ? neighboursByType(db, id) : new Map<EntityKey, EntityRecord[]>(),
    [db, id, record, revision],
  );

  if (!record) {
    return (
      <Screen>
        <div className="empty">Cette fiche n’existe pas (ou a été supprimée).</div>
      </Screen>
    );
  }

  const def = entityDef(record.type);
  const sec = section(def.section);
  const tags = Array.isArray(record.data.tags) ? (record.data.tags as string[]) : [];

  const filled = def.fields.filter((f) => !isEmpty(record.data[f.name]) && f.name !== 'tags');
  const prose = filled.filter((f) => isProse(f) && !isNote(f));
  const props = filled.filter((f) => !isProse(f));
  const notes = filled.filter(isNote);

  // L'historique dérivé : les rencontres qui citent cette fiche, récentes d'abord.
  const bouts = [
    ...(neighbours.get('sparring' as EntityKey) ?? []),
    ...(neighbours.get('fight' as EntityKey) ?? []),
  ].sort((a, b) => String(b.data.date ?? '').localeCompare(String(a.data.date ?? '')));

  const linkCount = [...neighbours.values()].reduce((n, list) => n + list.length, 0);

  const remove = async (): Promise<void> => {
    if (!confirm(`Supprimer ${record.code} — ${record.title} ?`)) return;
    write((d) => deleteEntity(d, record.id));
    await flush();
    navigate({ name: 'list', type: record.type });
  };

  return (
    <div className="split screen">
      <div className="pane">
        {/* Nom + ID + Tags */}
        <div className="page-head">
          <div className="grow">
            <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Dot section={sec} theme={theme} />
              <Icon name={moduleIcon(record.type)} size={13} />
              {def.plural} · {def.spec}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
              <Code record={record} />
              <h1 style={{ margin: 0 }}>{record.title}</h1>
            </div>
            {tags.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {tags.map((t) => (
                  <a key={t} className="chip" href={href({ name: 'search', q: t })}>
                    <span className="t">#{t}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a className="btn" href={href({ name: 'graph', focus: record.id })}>
              <Icon name="graph" size={14} />
              Graphe
            </a>
            <a className="btn" href={href({ name: 'edit', id: record.id })}>
              <Icon name="edit" size={14} />
              Modifier
            </a>
            <button type="button" className="btn danger" onClick={() => void remove()}>
              <Icon name="trash" size={14} />
              Supprimer
            </button>
          </div>
        </div>

        {/* Médias à gauche, contenu principal au centre */}
        <div className="fiche">
          <MediaColumn record={record} />

          <div className="fiche-main">
            {prose.length === 0 ? (
              <div className="empty">
                Cette fiche n’a pas encore de contenu.{' '}
                <a href={href({ name: 'edit', id: record.id })} style={{ color: 'var(--accent)' }}>
                  L’écrire
                </a>
                .
              </div>
            ) : (
              prose.map((field) => (
                <section key={field.name} className="block">
                  <h2>{field.label}</h2>
                  {field.type === 'sequence' && Array.isArray(record.data[field.name]) ? (
                    <ol className="seq">
                      {(record.data[field.name] as unknown[]).map((step, i) => (
                        <li key={`${String(step)}-${i}`}>{String(step)}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="field-value">{String(record.data[field.name])}</div>
                  )}
                </section>
              ))
            )}

            {bouts.length > 0 && record.type !== 'sparring' && record.type !== 'fight' && (
              <section className="block">
                <h2>Historique</h2>
                <p className="sub" style={{ marginBottom: 8 }}>
                  Dérivé des sparrings et combats qui mentionnent cette fiche.
                </p>
                <div className="rows">
                  {bouts.map((b) => (
                    <a key={b.id} className="row" href={href({ name: 'detail', id: b.id })}>
                      <Code record={b} />
                      <span className="title">{b.title}</span>
                      <span className="meta">
                        {b.data.resultat ? <span className="tag">{String(b.data.resultat)}</span> : null}
                        <span className="tag">{String(b.data.date ?? '—')}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Notes, en pleine largeur */}
        {notes.map((field) => (
          <section key={field.name} className="block">
            <h2>{field.label}</h2>
            <div className="card">
              <div className="field-value">{String(record.data[field.name])}</div>
            </div>
          </section>
        ))}

        <AiAssist record={record} />
      </div>

      {/* Colonne de droite : propriétés puis relations */}
      <aside className="aside" aria-label="Propriétés et relations">
        {props.length > 0 && (
          <div className="group">
            <h4>Propriétés</h4>
            <dl className="props">
              {props.map((field) => (
                <div key={field.name}>
                  <dt>{field.label}</dt>
                  <dd>
                    <PropValue field={field} value={record.data[field.name]} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="group">
          <h4>Relations · {linkCount}</h4>
          {neighbours.size === 0 ? (
            <p className="sub">
              Aucune relation. Une fiche isolée n’apporte rien au graphe —{' '}
              <a href={href({ name: 'edit', id: record.id })} style={{ color: 'var(--accent)' }}>
                reliez-la
              </a>{' '}
              à une technique, un principe ou une situation.
            </p>
          ) : (
            [...neighbours.entries()].map(([type, records]) => (
              <div key={type} className="rel-group">
                <div className="field-label">{entityDef(type).plural}</div>
                <div className="chips">
                  {records.map((r) => (
                    <EntityChip key={r.id} record={r} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

/** Une valeur courte : jauge, statut, lien ou texte — selon le type du champ. */
function PropValue({ field, value }: { field: FieldDef; value: unknown }): ReactNode {
  if (field.type === 'percent') return <Meter value={Number(value)} />;

  if (field.type === 'url') {
    return (
      <a href={String(value)} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent)' }}>
        {String(value)}
      </a>
    );
  }

  if (field.type === 'tags' && Array.isArray(value)) {
    return (
      <div className="chips">
        {value.map((t) => (
          <span key={String(t)} className="tag">
            #{String(t)}
          </span>
        ))}
      </div>
    );
  }

  const level = statusLevel(String(value));
  if (field.type === 'select' && level) return <Status level={level}>{String(value)}</Status>;

  return <>{String(value)}</>;
}

/**
 * Le sens d'une valeur de vocabulaire fermé.
 *
 * Seules les valeurs qui portent réellement un jugement sont colorées.
 * « Moyenne » pour une distance n'est ni bon ni mauvais, et le teinter
 * inventerait une information que la fiche ne contient pas.
 */
function statusLevel(value: string): 'good' | 'warn' | 'bad' | undefined {
  if (['Victoire', 'Atteint', 'Validée', 'Confirmée', 'Appliquée'].includes(value)) return 'good';
  if (['En cours', 'En cours de test', 'Partiellement validée', 'À revoir', 'À faire'].includes(value))
    return 'warn';
  if (['Défaite', 'Invalidée', 'Abandonné', 'Annulée'].includes(value)) return 'bad';
  return undefined;
}

function Meter({ value }: { value: number }): ReactNode {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{pct} %</span>
    </div>
  );
}
