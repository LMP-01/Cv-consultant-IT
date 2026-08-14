/**
 * Recherche globale et barre de commandes — Ctrl/Cmd + K.
 *
 * Deux exigences du cahier des charges tiennent dans une seule fenêtre :
 * « recherche inspirée de Spotlight » et « barre de commandes comme Raycast ».
 * Les séparer aurait donné deux raccourcis à retenir pour un seul geste
 * mental — « je veux aller quelque part ou faire quelque chose, tout de
 * suite ». La frappe filtre les deux à la fois.
 *
 * « Ouverture instantanée, aucun délai perceptible » : c'est possible ici
 * parce que SQLite tourne dans la page. Il n'y a aucun aller-retour réseau à
 * masquer, donc aucune temporisation — chaque frappe relance la requête.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { recentlyEdited } from '../db/analytics';
import { getEntity, getEntityByCode, searchEntities, type EntityRecord } from '../db/queries';
import { parseCode } from '../domain/ids';
import { ENTITY_DEFS, entityDef, section } from '../domain/schema';
import { useDb } from './DbProvider';
import { Dot, useTheme } from './common';
import { Icon, moduleIcon, type IconName } from './icons';
import { getPrefs, setPrefs, FONT_SCALES, resolvedTheme } from './prefs';
import { navigate, type Route } from './router';

interface Item {
  id: string;
  group: string;
  icon: IconName;
  label: string;
  /** Rendu à droite : le type de fiche, ou rien pour une commande. */
  kind?: string;
  record?: EntityRecord;
  run: () => void;
}

/** Les commandes fixes. Le libellé est ce qui est cherché — pas une clé. */
function commands(close: () => void): Item[] {
  const go = (label: string, icon: IconName, route: Route): Item => ({
    id: `go:${label}`,
    group: 'Aller à',
    icon,
    label,
    run: () => {
      navigate(route);
      close();
    },
  });

  const create = ENTITY_DEFS.map(
    (def): Item => ({
      id: `new:${def.key}`,
      group: 'Créer',
      icon: moduleIcon(def.key),
      label: `Créer ${def.label.toLowerCase()}`,
      kind: def.plural,
      run: () => {
        navigate({ name: 'create', type: def.key });
        close();
      },
    }),
  );

  return [
    ...create,
    {
      id: 'new:video',
      group: 'Créer',
      icon: 'video',
      label: 'Importer une vidéo',
      kind: 'Bibliothèque',
      run: () => {
        navigate({ name: 'create', type: 'resource', preset: { field: 'kind', value: 'Vidéo' } });
        close();
      },
    },
    go('Tableau de bord', 'dashboard', { name: 'dashboard' }),
    go('Graphe de connaissances', 'graph', { name: 'graph' }),
    go('Recherche avancée', 'search', { name: 'search' }),
    go('Statistiques', 'analytics', { name: 'analytics' }),
    go('Timeline', 'timeline', { name: 'timeline' }),
    go('Calendrier', 'calendar', { name: 'calendar' }),
    go('Paramètres', 'settings', { name: 'settings' }),
    {
      id: 'pref:theme',
      group: 'Affichage',
      icon: resolvedTheme() === 'dark' ? 'sun' : 'moon',
      label: resolvedTheme() === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre',
      run: () => {
        setPrefs({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' });
        close();
      },
    },
    {
      id: 'pref:contrast',
      group: 'Affichage',
      icon: 'contrast',
      label:
        getPrefs().contrast === 'high' ? 'Désactiver le contraste élevé' : 'Activer le contraste élevé',
      run: () => {
        setPrefs({ contrast: getPrefs().contrast === 'high' ? 'normal' : 'high' });
        close();
      },
    },
    {
      id: 'pref:font',
      group: 'Affichage',
      icon: 'text',
      label: 'Agrandir le texte',
      run: () => {
        const at = FONT_SCALES.indexOf(getPrefs().fontScale as (typeof FONT_SCALES)[number]);
        setPrefs({ fontScale: FONT_SCALES[(at + 1) % FONT_SCALES.length] ?? 1 });
        close();
      },
    },
  ];
}

/** Sans accents ni casse : « decision » doit trouver « Créer décision ». */
const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function CommandPalette({ onClose }: { onClose: () => void }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo((): Item[] => {
    const open = (record: EntityRecord): Item => ({
      id: `e:${record.id}`,
      group: 'Fiches',
      icon: moduleIcon(record.type),
      label: record.title,
      kind: entityDef(record.type).label,
      record,
      run: () => {
        navigate({ name: 'detail', id: record.id });
        onClose();
      },
    });

    const all = commands(onClose);
    const q = query.trim();

    if (!q) {
      // Fenêtre vide : ce qu'on vient de toucher, puis de quoi partir ailleurs.
      const recent = recentlyEdited(db, 5)
        .map((r) => getEntity(db, r.id))
        .filter((r): r is EntityRecord => Boolean(r))
        .map((r) => ({ ...open(r), group: 'Récent' }));
      return [...recent, ...all.filter((i) => i.group !== 'Créer').slice(0, 8), ...all.filter((i) => i.group === 'Créer').slice(0, 5)];
    }

    // Un identifiant exact est une adresse, pas une recherche : il passe devant.
    const direct = parseCode(q) ? getEntityByCode(db, q.toUpperCase()) : undefined;
    const found = searchEntities(db, q, { limit: 12 }).filter((r) => r.id !== direct?.id);
    const needle = fold(q);

    return [
      ...(direct ? [open(direct)] : []),
      ...found.map(open),
      ...all.filter((i) => fold(i.label).includes(needle)),
    ];
  }, [db, query, revision, onClose]);

  useEffect(() => setCursor(0), [query]);

  // Garder la ligne sélectionnée visible quand on descend au clavier.
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, items]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (items.length ? (c + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (items.length ? (c - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[cursor]?.run();
    }
  };

  let lastGroup = '';

  return (
    <div
      className="cmdk-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Recherche et commandes">
        <input
          type="text"
          autoFocus
          value={query}
          placeholder="Chercher une fiche, un identifiant, une commande…"
          aria-label="Recherche globale"
          aria-controls="cmdk-list"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {items.length === 0 && (
            <div className="cmdk-item" aria-disabled="true">
              <Icon name="info" />
              <span className="t">Rien pour « {query} ».</span>
            </div>
          )}

          {items.map((item, i) => {
            const header = item.group === lastGroup ? null : item.group;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="cmdk-group">{header}</div>}
                <div
                  className="cmdk-item"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseMove={() => setCursor(i)}
                  onClick={item.run}
                >
                  {item.record ? (
                    <Dot section={section(entityDef(item.record.type).section)} theme={theme} />
                  ) : (
                    <Icon name={item.icon} />
                  )}
                  {item.record && <span className="code">{item.record.code}</span>}
                  <span className="t">{item.label}</span>
                  {item.kind && <span className="kind">{item.kind}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> naviguer
          </span>
          <span>
            <span className="kbd">↵</span> ouvrir
          </span>
          <span>
            <span className="kbd">Échap</span> fermer
          </span>
        </div>
      </div>
    </div>
  );
}
