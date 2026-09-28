/** A module's index, with the filter chips its descriptor implies. */
import { useMemo, useState, type ReactNode } from 'react';
import { distinctFieldValues, searchEntities } from '../../db/queries';
import { entityDef, type EntityKey } from '../../domain/schema';
import { useDb } from '../DbProvider';
import { Dot, Empty, EntityRow, Screen, useTheme } from '../common';
import { href } from '../router';
import { section } from '../../domain/schema';

export function EntityListView({ type }: { type: EntityKey }): ReactNode {
  const { db, revision } = useDb();
  const def = entityDef(type);
  const theme = useTheme();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});

  // Only fields marked inList and backed by a fixed vocabulary make useful
  // chips; free text would produce a chip per fiche.
  const chipFields = def.fields.filter((f) => f.inList && f.type === 'select');

  const records = useMemo(
    () => searchEntities(db, query, { types: [type], fields: filters }),
    [db, query, type, filters, revision],
  );

  const toggle = (field: string, value: string): void =>
    setFilters((prev) => {
      const current = prev[field] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      const out = { ...prev };
      if (next.length) out[field] = next;
      else delete out[field];
      return out;
    });

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Dot section={section(def.section)} theme={theme} />
            {def.spec}
          </p>
          <h1>{def.plural}</h1>
        </div>
        <a className="btn primary" href={href({ name: 'create', type })}>
          + Nouvelle fiche
        </a>
      </div>

      <input
        type="search"
        value={query}
        placeholder={`Rechercher dans ${def.plural.toLowerCase()}…`}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {chipFields.map((field) => {
        const values = distinctFieldValues(db, type, field.name);
        if (values.length < 2) return null;
        return (
          <div key={field.name} style={{ marginBottom: 10 }}>
            <div className="field-label">{field.label}</div>
            <div className="chips">
              {values.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`chip${(filters[field.name] ?? []).includes(v) ? ' on' : ''}`}
                  onClick={() => toggle(field.name, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <p className="sub" style={{ margin: '14px 0 8px' }}>
        {records.length} fiche{records.length > 1 ? 's' : ''}
      </p>

      {records.length === 0 ? (
        <Empty>
          {query || Object.keys(filters).length
            ? 'Rien ne correspond à ce filtre.'
            : `Aucune fiche ${def.label.toLowerCase()} pour l’instant.`}
        </Empty>
      ) : (
        <div className="rows">
          {records.map((r) => (
            <EntityRow key={r.id} record={r} />
          ))}
        </div>
      )}
    </Screen>
  );
}
