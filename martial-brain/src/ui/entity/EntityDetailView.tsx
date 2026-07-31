/**
 * A fiche.
 *
 * §2.3: "L'affichage de n'importe quelle fiche récapitule automatiquement
 * l'ensemble des éléments source et cible qui y font référence." So the
 * relations block shows every neighbour grouped by module — not only the
 * modules the descriptor suggests — because a link made from the other side is
 * every bit as real.
 *
 * "Historique" is derived here rather than stored: a technique's history IS the
 * sparrings and fights that mention it, newest first. Typing it by hand would
 * be duplicating what the graph already knows.
 */
import { useMemo, type ReactNode } from 'react';
import { deleteEntity, getEntity, type EntityRecord } from '../../db/queries';
import { neighboursByType } from '../../domain/links';
import { entityDef, section, type EntityKey } from '../../domain/schema';
import { useDb } from '../DbProvider';
import { Code, Dot, EntityChip, useTheme } from '../common';
import { href, navigate } from '../router';

const isEmpty = (v: unknown): boolean =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0);

export function EntityDetailView({ id }: { id: string }): ReactNode {
  const { db, write, revision } = useDb();
  const theme = useTheme();

  const record = useMemo(() => getEntity(db, id), [db, id, revision]);
  const neighbours = useMemo(
    (): Map<EntityKey, EntityRecord[]> =>
      record ? neighboursByType(db, id) : new Map<EntityKey, EntityRecord[]>(),
    [db, id, record, revision],
  );

  if (!record) {
    return (
      <div className="main-inner">
        <div className="empty">Cette fiche n’existe pas (ou a été supprimée).</div>
      </div>
    );
  }

  const def = entityDef(record.type);
  const sec = section(def.section);

  // The derived history: bouts referencing this fiche, most recent first.
  const bouts = [
    ...(neighbours.get('sparring' as EntityKey) ?? []),
    ...(neighbours.get('fight' as EntityKey) ?? []),
  ].sort((a, b) => String(b.data.date ?? '').localeCompare(String(a.data.date ?? '')));

  const remove = (): void => {
    if (!confirm(`Supprimer ${record.code} — ${record.title} ?`)) return;
    write((d) => deleteEntity(d, record.id));
    navigate({ name: 'list', type: record.type });
  };

  return (
    <div className="main-inner">
      <div className="page-head">
        <div className="grow">
          <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Dot section={sec} theme={theme} />
            {def.plural} · {def.spec}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Code record={record} />
            <h1 style={{ margin: 0 }}>{record.title}</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn" href={href({ name: 'graph', focus: record.id })}>
            Voir dans le graphe
          </a>
          <a className="btn" href={href({ name: 'edit', id: record.id })}>
            Modifier
          </a>
          <button type="button" className="btn danger" onClick={remove}>
            Supprimer
          </button>
        </div>
      </div>

      {/* Descriptor fields, empty ones omitted so a sparse fiche stays readable */}
      {def.fields.some((f) => !isEmpty(record.data[f.name])) && (
        <div className="card">
          <div className="fields">
            {def.fields.map((field) => {
              const value = record.data[field.name];
              if (isEmpty(value)) return null;

              return (
                <div key={field.name}>
                  <div className="field-label">{field.label}</div>
                  {field.type === 'sequence' && Array.isArray(value) ? (
                    <ol className="seq">
                      {value.map((step, i) => (
                        <li key={`${String(step)}-${i}`}>{String(step)}</li>
                      ))}
                    </ol>
                  ) : field.type === 'tags' && Array.isArray(value) ? (
                    <div className="chips">
                      {value.map((t) => (
                        <span key={String(t)} className="tag">
                          #{String(t)}
                        </span>
                      ))}
                    </div>
                  ) : field.type === 'url' ? (
                    <a
                      className="field-value"
                      href={String(value)}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: 'var(--accent)' }}
                    >
                      {String(value)}
                    </a>
                  ) : field.type === 'percent' ? (
                    <Meter value={Number(value)} />
                  ) : (
                    <div className="field-value">{String(value)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* §2.3 — everything pointing here, in either direction */}
      <h2>Relations</h2>
      {neighbours.size === 0 ? (
        <div className="empty">
          Aucune relation. Une fiche isolée n’apporte rien au graphe —
          <a href={href({ name: 'edit', id: record.id })} style={{ color: 'var(--accent)' }}>
            {' '}
            reliez-la
          </a>{' '}
          à une technique, un principe ou une situation.
        </div>
      ) : (
        <div className="card">
          {[...neighbours.entries()].map(([type, records]) => (
            <div key={type} className="rel-group">
              <div className="field-label">{entityDef(type).plural}</div>
              <div className="chips">
                {records.map((r) => (
                  <EntityChip key={r.id} record={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {bouts.length > 0 && record.type !== 'sparring' && record.type !== 'fight' && (
        <>
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
        </>
      )}
    </div>
  );
}

function Meter({ value }: { value: number }): ReactNode {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          flex: 1,
          maxWidth: 240,
          height: 8,
          borderRadius: 999,
          background: 'var(--plane)',
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--accent)',
            borderRadius: 999,
          }}
        />
      </div>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>
    </div>
  );
}
