/**
 * §5.1 — full text, direct code lookup, and multi-criteria filtering.
 *
 * This screen works with no API key at all. The natural-language box (§5.1
 * "recherche sémantique") is layered on top in the AI panel: it only ever
 * produces a filter, which is then executed here.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { allTags, getEntityByCode, searchEntities } from '../db/queries';
import { parseCode } from '../domain/ids';
import { defsInSection, entityDef, SECTIONS, type EntityKey } from '../domain/schema';
import { AskPanel } from './AskPanel';
import { useDb } from './DbProvider';
import { Dot, Empty, EntityRow, Screen, useTheme } from './common';
import { navigate, replace } from './router';

export function SearchView({ initialQuery }: { initialQuery: string }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();

  const [query, setQuery] = useState(initialQuery);
  const [types, setTypes] = useState<EntityKey[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Keep the URL shareable without pushing a history entry per keystroke.
  useEffect(() => {
    const t = setTimeout(() => replace(query ? { name: 'search', q: query } : { name: 'search' }), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Typing an exact code is a lookup, not a search — jump straight there.
  const directHit = useMemo(() => {
    const parsed = parseCode(query.trim());
    return parsed ? getEntityByCode(db, query.trim().toUpperCase()) : undefined;
  }, [db, query, revision]);

  const results = useMemo(
    () =>
      searchEntities(db, query, {
        ...(types.length ? { types } : {}),
        ...(tags.length ? { tags } : {}),
        limit: 300,
      }),
    [db, query, types, tags, revision],
  );

  const tagCloud = useMemo(() => allTags(db).slice(0, 24), [db, revision]);

  const toggleType = (t: EntityKey): void =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleTag = (t: string): void =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Recherche · §5.1</p>
          <h1>Chercher dans le graphe</h1>
        </div>
      </div>

      <input
        type="search"
        value={query}
        autoFocus
        placeholder="Texte libre, ou un identifiant : K003, PR001, ER012…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && directHit) navigate({ name: 'detail', id: directHit.id });
        }}
      />
      <p className="sub" style={{ marginTop: 6 }}>
        Les accents sont ignorés : « desequilibre » trouve « déséquilibre ».
      </p>

      {directHit && (
        <div
          className="banner"
          style={{ marginTop: 12, cursor: 'pointer' }}
          onClick={() => navigate({ name: 'detail', id: directHit.id })}
        >
          <span>
            <b>{directHit.code}</b> — {directHit.title} · Entrée pour ouvrir
          </span>
        </div>
      )}

      <AskPanel />

      <h2>Modules</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {SECTIONS.map((sec) => (
          <div key={sec.key} className="chips">
            {defsInSection(sec.key).map((def) => (
              <button
                key={def.key}
                type="button"
                className={`chip${types.includes(def.key) ? ' on' : ''}`}
                onClick={() => toggleType(def.key)}
              >
                <Dot section={sec} theme={theme} />
                <span className="t">{def.plural}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {tagCloud.length > 0 && (
        <>
          <h2>Tags</h2>
          <div className="chips">
            {tagCloud.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={`chip${tags.includes(tag) ? ' on' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                <span className="t">#{tag}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{count}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h2>
        {results.length} résultat{results.length > 1 ? 's' : ''}
      </h2>
      {results.length === 0 ? (
        <Empty>
          {query || types.length || tags.length
            ? 'Rien ne correspond.'
            : 'Commence à taper, ou filtre par module.'}
        </Empty>
      ) : (
        <div className="rows">
          {results.map((r) => (
            <EntityRow key={r.id} record={r} />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <p className="sub" style={{ marginTop: 10 }}>
          {countByType(results)}
        </p>
      )}
    </Screen>
  );
}

function countByType(records: { type: EntityKey }[]): string {
  const counts = new Map<EntityKey, number>();
  for (const r of records) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => `${entityDef(type).plural} ${n}`)
    .join(' · ');
}
