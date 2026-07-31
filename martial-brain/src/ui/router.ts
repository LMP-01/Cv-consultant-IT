/**
 * Hash routing, hand-rolled.
 *
 * A router library would be ~15 kB to resolve nine routes with no nesting, no
 * loaders and no code-splitting. Hash routes also mean the PWA works when
 * opened from a file:// URL or a static host with no rewrite rules.
 */
import { useEffect, useState } from 'react';
import { isEntityKey, type EntityKey } from '../domain/schema';

export type Route =
  | { name: 'dashboard' }
  | { name: 'list'; type: EntityKey }
  | { name: 'detail'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'create'; type: EntityKey }
  | { name: 'graph'; focus?: string }
  | { name: 'search'; q?: string }
  | { name: 'analytics' }
  | { name: 'settings' };

export function href(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'list':
      return `#/t/${route.type}`;
    case 'detail':
      return `#/e/${route.id}`;
    case 'edit':
      return `#/e/${route.id}/edit`;
    case 'create':
      return `#/new/${route.type}`;
    case 'graph':
      return route.focus ? `#/graph/${route.focus}` : '#/graph';
    case 'search':
      return route.q ? `#/search?q=${encodeURIComponent(route.q)}` : '#/search';
    case 'analytics':
      return '#/analytics';
    case 'settings':
      return '#/settings';
  }
}

export function parseHash(raw: string): Route {
  const [path = '', query = ''] = raw.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const [head, a, b] = parts;

  switch (head) {
    case undefined:
      return { name: 'dashboard' };
    case 't':
      return a && isEntityKey(a) ? { name: 'list', type: a } : { name: 'dashboard' };
    case 'e':
      if (!a) return { name: 'dashboard' };
      return b === 'edit' ? { name: 'edit', id: a } : { name: 'detail', id: a };
    case 'new':
      return a && isEntityKey(a) ? { name: 'create', type: a } : { name: 'dashboard' };
    case 'graph':
      return a ? { name: 'graph', focus: a } : { name: 'graph' };
    case 'search': {
      const q = new URLSearchParams(query).get('q');
      return q ? { name: 'search', q } : { name: 'search' };
    }
    case 'analytics':
      return { name: 'analytics' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'dashboard' };
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

/** Replace rather than push — used for live-updating the search query. */
export function replace(route: Route): void {
  window.history.replaceState(null, '', href(route));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    // Every route change is a new screen; start it at the top.
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, [route]);

  return route;
}
