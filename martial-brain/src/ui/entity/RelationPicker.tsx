/**
 * Attach a fiche to other fiches (§2.3).
 *
 * Deliberately one picker per target module rather than one global picker: the
 * descriptor already says which modules a technique is normally related to, and
 * showing those groups is what teaches the structure to whoever is filling it in.
 */
import { useState, type ReactNode } from 'react';
import { searchEntities, type EntityRecord } from '../../db/queries';
import { entityDef, type EntityKey } from '../../domain/schema';
import { useDb } from '../DbProvider';
import { Code, EntityChip } from '../common';

interface Props {
  target: EntityKey;
  selected: EntityRecord[];
  exclude: string;
  onToggle: (record: EntityRecord) => void;
}

export function RelationPicker({ target, selected, exclude, onToggle }: Props): ReactNode {
  const { db } = useDb();
  const def = entityDef(target);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const chosen = new Set(selected.map((r) => r.id));
  const candidates = (open || query ? searchEntities(db, query, { types: [target], limit: 40 }) : [])
    .filter((r) => r.id !== exclude && !chosen.has(r.id));

  return (
    <div className="rel-group">
      <div className="field-label">{def.plural}</div>

      <div className="chips" style={{ marginBottom: 8 }}>
        {selected.map((r) => (
          <EntityChip key={r.id} record={r} onRemove={() => onToggle(r)} />
        ))}
        {selected.length === 0 && (
          <span className="sub">Aucun lien</span>
        )}
      </div>

      <input
        type="search"
        value={query}
        placeholder={`Lier une fiche ${def.label.toLowerCase()}…`}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />

      {candidates.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }}>
          {candidates.slice(0, 12).map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onToggle(r);
                setQuery('');
              }}
            >
              <Code record={r} />
              <span className="t">{r.title}</span>
              <span aria-hidden="true">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
