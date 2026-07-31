/** Navigation — the arborescence of §3, which the source document left blank. */
import type { ReactNode } from 'react';
import { countEntities } from '../db/queries';
import { defsInSection, SECTIONS } from '../domain/schema';
import { useDb } from './DbProvider';
import { Dot, useTheme } from './common';
import { href, type Route } from './router';

interface Props {
  route: Route;
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({ route, open, onNavigate }: Props): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();
  void revision; // counts re-read on every write

  const isActive = (r: Route): boolean => {
    if (r.name === 'list' && route.name === 'list') return r.type === route.type;
    return r.name === route.name;
  };

  const Item = ({ to, children }: { to: Route; children: ReactNode }): ReactNode => (
    <a
      className={`nav-item${isActive(to) ? ' active' : ''}`}
      href={href(to)}
      onClick={onNavigate}
    >
      {children}
    </a>
  );

  return (
    <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Navigation principale">
      <div className="brand">
        <b>Waza</b>
        <span>second cerveau martial</span>
      </div>

      <div className="nav-group">
        <Item to={{ name: 'dashboard' }}>Tableau de bord</Item>
        <Item to={{ name: 'graph' }}>Graphe</Item>
        <Item to={{ name: 'search' }}>Recherche</Item>
        <Item to={{ name: 'analytics' }}>Analytics</Item>
      </div>

      {SECTIONS.map((sec) => (
        <div className="nav-group" key={sec.key}>
          <h3>{sec.label}</h3>
          {defsInSection(sec.key).map((def) => (
            <a
              key={def.key}
              className={`nav-item${isActive({ name: 'list', type: def.key }) ? ' active' : ''}`}
              href={href({ name: 'list', type: def.key })}
              onClick={onNavigate}
            >
              <Dot section={sec} theme={theme} />
              {def.plural}
              <span className="count">{countEntities(db, def.key)}</span>
            </a>
          ))}
        </div>
      ))}

      <div className="nav-group">
        <Item to={{ name: 'settings' }}>Réglages</Item>
      </div>
    </nav>
  );
}
