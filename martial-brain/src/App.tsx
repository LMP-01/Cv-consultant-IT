import { useState, type ReactNode } from 'react';
import { getEntity } from './db/queries';
import { AnalyticsView } from './ui/AnalyticsView';
import { DashboardView } from './ui/DashboardView';
import { DbProvider, useDb } from './ui/DbProvider';
import { SearchView } from './ui/SearchView';
import { SettingsView } from './ui/SettingsView';
import { Sidebar } from './ui/Sidebar';
import { EntityDetailView } from './ui/entity/EntityDetailView';
import { EntityFormView } from './ui/entity/EntityFormView';
import { EntityListView } from './ui/entity/EntityListView';
import { GraphView } from './ui/graph/GraphView';
import { useRoute } from './ui/router';

export function App(): ReactNode {
  return (
    <DbProvider>
      <Shell />
    </DbProvider>
  );
}

function Shell(): ReactNode {
  const route = useRoute();
  const [navOpen, setNavOpen] = useState(false);

  const screen = ((): ReactNode => {
    switch (route.name) {
      case 'dashboard':
        return <DashboardView />;
      case 'list':
        return <EntityListView key={route.type} type={route.type} />;
      case 'detail':
        return <EntityDetailView key={route.id} id={route.id} />;
      case 'edit':
        return <EditScreen key={route.id} id={route.id} />;
      case 'create':
        return <EntityFormView key={route.type} type={route.type} />;
      case 'graph':
        return <GraphView focus={route.focus} />;
      case 'search':
        return <SearchView key={route.q ?? ''} initialQuery={route.q ?? ''} />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
    }
  })();

  return (
    <div className="app">
      <div className="mobile-bar">
        <button
          type="button"
          className="btn sm"
          onClick={() => setNavOpen((v) => !v)}
          aria-label="Ouvrir la navigation"
          aria-expanded={navOpen}
        >
          ☰
        </button>
        <b>Waza</b>
      </div>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <Sidebar route={route} open={navOpen} onNavigate={() => setNavOpen(false)} />

      <main className="main">{screen}</main>
    </div>
  );
}

/** The edit route only carries an id; the module comes from the record. */
function EditScreen({ id }: { id: string }): ReactNode {
  const { db, revision } = useDb();
  void revision;
  const record = getEntity(db, id);
  if (!record) return <div className="empty">Cette fiche n’existe plus.</div>;
  return <EntityFormView type={record.type} id={id} />;
}
