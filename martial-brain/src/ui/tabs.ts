/**
 * Onglets, façon VS Code.
 *
 * Le cahier des charges demande de pouvoir garder plusieurs fiches ouvertes en
 * même temps. Le point n'est pas décoratif : on compare une technique à son
 * contre, on garde le sparring d'où l'idée est venue sous la main, et revenir
 * en arrière trois fois pour retrouver un onglet est exactement ce que le
 * système est censé éviter.
 *
 * Un onglet est identifié par son URL. C'est ce qui rend l'ensemble trivial :
 * pas d'état dupliqué, pas de synchronisation à tenir, l'onglet actif est
 * celui dont l'URL est affichée. Ouvrir la même fiche deux fois est donc
 * impossible par construction.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { href, navigate, parseHash, type Route } from './router';

export interface Tab {
  /** L'URL de hachage — l'identité de l'onglet. */
  id: string;
  route: Route;
}

/** Au-delà, la bande devient illisible et le défilement horizontal pénible. */
const MAX_TABS = 12;

const KEY = 'combat-os.tabs';

function load(): Tab[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return [];
    return ids
      .filter((id): id is string => typeof id === 'string')
      .slice(0, MAX_TABS)
      .map((id) => ({ id, route: parseHash(id) }));
  } catch {
    return [];
  }
}

function save(tabs: readonly Tab[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(tabs.map((t) => t.id)));
  } catch {
    // Session storage refusé : les onglets ne survivront pas au rechargement,
    // ce qui est acceptable — ils ne portent aucune donnée.
  }
}

export interface TabsApi {
  tabs: Tab[];
  activeId: string;
  close: (id: string) => void;
  closeOthers: (id: string) => void;
}

export function useTabs(route: Route): TabsApi {
  const activeId = href(route);
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const restored = load();
    return restored.some((t) => t.id === activeId)
      ? restored
      : [...restored, { id: activeId, route }].slice(-MAX_TABS);
  });

  // Le formulaire d'édition n'ouvre pas d'onglet à lui : #/e/x/edit et #/e/x
  // sont la même fiche dans deux états. Deux onglets pour une fiche seraient
  // du bruit, et fermer le mauvais donnerait l'impression d'avoir perdu la
  // modification en cours.
  const tabIdFor = (r: Route): string => href(r.name === 'edit' ? { name: 'detail', id: r.id } : r);
  const wanted = tabIdFor(route);

  const lastRef = useRef(wanted);

  useEffect(() => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === wanted)) return prev;

      // Le nouvel onglet s'insère après l'onglet courant, pas à la fin :
      // naviguer depuis K003 vers A014 met A014 juste à côté de K003, où le
      // regard le cherche.
      const at = prev.findIndex((t) => t.id === lastRef.current);
      const entry: Tab = { id: wanted, route: parseHash(wanted) };
      const next = [...prev];
      next.splice(at >= 0 ? at + 1 : next.length, 0, entry);

      // Éviction du plus ancien onglet qui n'est pas celui qu'on vient
      // d'ouvrir : la limite ne doit jamais fermer ce que l'utilisateur
      // regarde.
      while (next.length > MAX_TABS) {
        const victim = next.findIndex((t) => t.id !== wanted);
        next.splice(victim < 0 ? 0 : victim, 1);
      }
      return next;
    });
    lastRef.current = wanted;
  }, [wanted]);

  useEffect(() => save(tabs), [tabs]);

  const close = useCallback(
    (id: string): void => {
      setTabs((prev) => {
        const at = prev.findIndex((t) => t.id === id);
        if (at < 0) return prev;
        const next = prev.filter((t) => t.id !== id);

        // Fermer l'onglet courant renvoie sur son voisin — celui de droite,
        // puis celui de gauche s'il n'y en a pas. Fermer le dernier renvoie au
        // tableau de bord : on n'affiche jamais du vide.
        if (id === tabIdFor(parseHash(window.location.hash))) {
          const fallback = next[at] ?? next[at - 1];
          navigate(fallback ? fallback.route : { name: 'dashboard' });
        }
        return next;
      });
    },
    // `tabIdFor` est pur et stable ; la fermeture ne dépend d'aucun état React.
    [],
  );

  const closeOthers = useCallback((id: string): void => {
    setTabs((prev) => prev.filter((t) => t.id === id));
    navigate(parseHash(id));
  }, []);

  return { tabs, activeId: wanted, close, closeOthers };
}
