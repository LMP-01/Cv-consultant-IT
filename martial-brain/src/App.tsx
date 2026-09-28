import type { ReactNode } from 'react';
import { getEntity } from './db/queries';
import { AnalyticsView } from './ui/AnalyticsView';
import { AppShell } from './ui/AppShell';
import { CalendarView } from './ui/CalendarView';
import { DashboardView } from './ui/DashboardView';
import { DbProvider, useDb } from './ui/DbProvider';
import { SearchView } from './ui/SearchView';
import { SettingsView } from './ui/SettingsView';
import { TimelineView } from './ui/TimelineView';
import { EntityDetailView } from './ui/entity/EntityDetailView';
import { EntityFormView } from './ui/entity/EntityFormView';
import { EntityListView } from './ui/entity/EntityListView';
import { GraphView } from './ui/graph/GraphView';
import { useRoute } from './ui/router';

export function App(): ReactNode {
  return (
    <DbProvider>
      <Router />
    </DbProvider>
  );
}

function Router(): ReactNode {
  const route = useRoute();

  // `key` sur chaque écran : changer de fiche remonte un composant neuf plutôt
  // que de réutiliser l'ancien. C'est ce qui rejoue l'animation d'ouverture du
  // cahier des charges, et ce qui garantit qu'aucun état de formulaire ne
  // survit d'une fiche à la suivante.
  const screen = ((): ReactNode => {
    switch (route.name) {
      case 'dashboard':
        return <DashboardView />;
      case 'list':
        return <EntityListView key={route.type} type={route.type} />;
      case 'detail':
        return <EntityDetailView key={route.id} id={route.id} />;
      case 'edit':
        return <EditScreen key={`edit-${route.id}`} id={route.id} />;
      case 'create':
        return (
          <EntityFormView
            key={`new-${route.type}`}
            type={route.type}
            {...(route.preset ? { preset: route.preset } : {})}
          />
        );
      case 'graph':
        return <GraphView focus={route.focus} />;
      case 'search':
        return <SearchView key={route.q ?? ''} initialQuery={route.q ?? ''} />;
      case 'analytics':
        return <AnalyticsView />;
      case 'timeline':
        return <TimelineView {...(route.year ? { year: route.year } : {})} />;
      case 'calendar':
        return <CalendarView {...(route.month ? { month: route.month } : {})} />;
      case 'settings':
        return <SettingsView />;
    }
  })();

  return <AppShell route={route}>{screen}</AppShell>;
}

/** The edit route only carries an id; the module comes from the record. */
function EditScreen({ id }: { id: string }): ReactNode {
  const { db, revision } = useDb();
  void revision;
  const record = getEntity(db, id);
  if (!record) {
    return (
      <div className="pane screen">
        <div className="empty">Cette fiche n’existe plus.</div>
      </div>
    );
  }
  return <EntityFormView type={record.type} id={id} />;
}
