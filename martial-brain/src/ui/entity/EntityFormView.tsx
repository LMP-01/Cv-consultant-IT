/** Create / edit, rendered from the descriptor. Serves all 15 modules. */
import { useMemo, useState, type ReactNode } from 'react';
import {
  createEntity,
  getEntity,
  updateEntity,
  type EntityRecord,
} from '../../db/queries';
import { neighboursByType, setLinksOfType } from '../../domain/links';
import { entityDef, type EntityKey } from '../../domain/schema';
import { useDb } from '../DbProvider';
import { navigate } from '../router';
import { FieldInput } from './FieldInput';
import { RelationPicker } from './RelationPicker';

interface Props {
  type: EntityKey;
  id?: string;
}

export function EntityFormView({ type, id }: Props): ReactNode {
  const { db, write } = useDb();
  const def = entityDef(type);

  const existing = useMemo(() => (id ? getEntity(db, id) : undefined), [db, id]);
  const initialLinks = useMemo(() => {
    if (!id) return new Map<EntityKey, EntityRecord[]>();
    return neighboursByType(db, id);
  }, [db, id]);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [data, setData] = useState<Record<string, unknown>>(existing?.data ?? {});
  const [links, setLinks] = useState<Map<EntityKey, EntityRecord[]>>(
    () => new Map(initialLinks),
  );
  const [error, setError] = useState<string | null>(null);

  if (id && !existing) {
    return <div className="empty">Cette fiche n’existe plus.</div>;
  }

  const toggle = (target: EntityKey, record: EntityRecord): void => {
    setLinks((prev) => {
      const next = new Map(prev);
      const current = next.get(target) ?? [];
      next.set(
        target,
        current.some((r) => r.id === record.id)
          ? current.filter((r) => r.id !== record.id)
          : [...current, record],
      );
      return next;
    });
  };

  const submit = (): void => {
    if (!title.trim()) {
      setError(`${def.titleLabel} est obligatoire.`);
      return;
    }

    const saved = write((d) =>
      d.tx(() => {
        const record = existing
          ? updateEntity(d, existing.id, { title, data })
          : createEntity(d, type, { title, data });

        // Reconcile each relation group against what it was on load.
        for (const target of def.relations) {
          setLinksOfType(
            d,
            record.id,
            (links.get(target) ?? []).map((r) => r.id),
            (initialLinks.get(target) ?? []).map((r) => r.id),
          );
        }
        return record;
      }),
    );

    navigate({ name: 'detail', id: saved.id });
  };

  return (
    <div className="main-inner">
      <div className="page-head">
        <div className="grow">
          <p className="sub">
            {def.plural} · {def.spec}
          </p>
          <h1>{existing ? `Modifier ${existing.code}` : `Nouvelle fiche ${def.label}`}</h1>
        </div>
      </div>

      <div className="card">
        <div className="fields">
          <div>
            <label className="field-label" htmlFor="f-title">
              {def.titleLabel}
            </label>
            <input
              id="f-title"
              type="text"
              value={title}
              autoFocus
              placeholder={def.titlePlaceholder ?? ''}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
            />
          </div>

          {def.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={data[field.name]}
              onChange={(value) => setData((prev) => ({ ...prev, [field.name]: value }))}
            />
          ))}
        </div>
      </div>

      {def.relations.length > 0 && (
        <>
          <h2>Relations</h2>
          <div className="card">
            {def.relations.map((target) => (
              <RelationPicker
                key={target}
                target={target}
                selected={links.get(target) ?? []}
                exclude={existing?.id ?? ''}
                onToggle={(record) => toggle(target, record)}
              />
            ))}
          </div>
        </>
      )}

      {error && (
        <p className="banner warn" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button type="button" className="btn primary" onClick={submit}>
          Enregistrer
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            existing ? navigate({ name: 'detail', id: existing.id }) : navigate({ name: 'list', type })
          }
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
