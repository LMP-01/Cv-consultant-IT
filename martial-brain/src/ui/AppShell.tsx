/**
 * La coquille : barre supérieure, barre latérale, onglets, fil d'Ariane.
 *
 * Le cahier des charges impose une structure permanente — trois colonnes,
 * barre supérieure toujours présente, barre latérale toujours visible, fil
 * d'Ariane toujours visible. C'est ce qui distingue un poste de pilotage d'un
 * carnet : les repères ne bougent pas, seul le contenu change. D'où une
 * coquille montée une fois pour toutes, dans laquelle les écrans s'échangent,
 * plutôt que des pages qui redessineraient chacune leur en-tête.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { alerts } from '../db/alerts';
import { countEntities, getEntity } from '../db/queries';
import { defsInSection, entityDef, SECTIONS } from '../domain/schema';
import { CommandPalette } from './CommandPalette';
import { useDb } from './DbProvider';
import { Dot, useTheme } from './common';
import { Icon, Mark, moduleIcon } from './icons';
import { FONT_SCALES, getPrefs, resolvedTheme, setPrefs, subscribePrefs } from './prefs';
import { LuisPanel } from './luis/LuisPanel';
import { href, navigate, type Route } from './router';
import { useTabs } from './tabs';

/** Le modificateur affiché dans les raccourcis, selon la plateforme. */
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export function usePrefs(): ReturnType<typeof getPrefs> {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }): ReactNode {
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tabs = useTabs(route);

  // Ctrl/Cmd + K depuis n'importe où, y compris depuis un champ de saisie :
  // « ouverture instantanée » veut dire qu'on n'a jamais à cliquer ailleurs
  // d'abord.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Toute navigation referme le tiroir mobile : le laisser ouvert masquerait
  // l'écran qu'on vient justement de demander.
  useEffect(() => setNavOpen(false), [route]);

  return (
    <div className="shell">
      <header className="topbar">
        <button
          type="button"
          className="icon-btn nav-toggle"
          aria-label="Ouvrir la navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <Icon name="menu" size={18} />
        </button>

        <a className="brand" href={href({ name: 'dashboard' })}>
          <Mark />
          Combat&nbsp;OS
          <small>second cerveau martial</small>
        </a>

        <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={14} />
          <span className="placeholder">Chercher une fiche, un identifiant, une commande…</span>
          <span className="kbd">{MOD} K</span>
        </button>

        <div className="topbar-actions">
          <SyncBadge />
          <Notifications />
          <ThemeToggle />
          <Profile />
        </div>
      </header>

      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <Sidebar route={route} open={navOpen} />

      <div className="body">
        <TabStrip {...tabs} />
        <Breadcrumb route={route} />
        {children}
      </div>

      <LuisPanel route={route} />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/* ── Barre latérale ────────────────────────────────────────────────────────
 * L'ordre suit celui du cahier des charges : les pages transverses en haut,
 * puis les modules groupés par section — l'ordre du schéma, qui place déjà
 * les décisions juste après les hypothèses comme le demande le document.
 * ────────────────────────────────────────────────────────────────────────── */

function Sidebar({ route, open }: { route: Route; open: boolean }): ReactNode {
  const { db, revision } = useDb();
  const theme = useTheme();
  void revision; // les compteurs se relisent à chaque écriture

  const active = (r: Route): boolean =>
    r.name === 'list' && route.name === 'list' ? r.type === route.type : r.name === route.name;

  const Item = ({ to, icon, label }: { to: Route; icon: Parameters<typeof Icon>[0]['name']; label: string }): ReactNode => (
    <a className={`nav-item${active(to) ? ' active' : ''}`} href={href(to)}>
      <Icon name={icon} />
      {label}
    </a>
  );

  return (
    <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Navigation principale">
      <div className="nav-section">
        <Item to={{ name: 'dashboard' }} icon="dashboard" label="Tableau de bord" />
        <Item to={{ name: 'graph' }} icon="graph" label="Graphe" />
        <Item to={{ name: 'timeline' }} icon="timeline" label="Timeline" />
        <Item to={{ name: 'calendar' }} icon="calendar" label="Calendrier" />
        <Item to={{ name: 'analytics' }} icon="analytics" label="Statistiques" />
      </div>

      {SECTIONS.map((sec) => (
        <div className="nav-section" key={sec.key}>
          <h3>{sec.label}</h3>
          {defsInSection(sec.key).map((def) => (
            <a
              key={def.key}
              className={`nav-item${active({ name: 'list', type: def.key }) ? ' active' : ''}`}
              href={href({ name: 'list', type: def.key })}
            >
              <Icon name={moduleIcon(def.key)} />
              <span className="t">{def.plural}</span>
              <span className="count">{countEntities(db, def.key)}</span>
              <Dot section={sec} theme={theme} />
            </a>
          ))}
        </div>
      ))}

      <div className="nav-section">
        <Item to={{ name: 'search' }} icon="search" label="Recherche avancée" />
        <Item to={{ name: 'settings' }} icon="settings" label="Paramètres" />
      </div>
    </nav>
  );
}

/* ── Onglets ───────────────────────────────────────────────────────────────*/

function TabStrip({ tabs, activeId, close }: ReturnType<typeof useTabs>): ReactNode {
  const { db, revision } = useDb();
  const stripRef = useRef<HTMLDivElement>(null);
  void revision;

  // L'onglet actif reste visible même quand la bande déborde.
  useEffect(() => {
    stripRef.current?.querySelector('.tab.active')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeId, tabs.length]);

  const label = (route: Route): { text: string; icon: Parameters<typeof Icon>[0]['name'] } => {
    switch (route.name) {
      case 'dashboard':
        return { text: 'Tableau de bord', icon: 'dashboard' };
      case 'list':
        return { text: entityDef(route.type).plural, icon: moduleIcon(route.type) };
      case 'detail':
      case 'edit': {
        const record = getEntity(db, route.id);
        return record
          ? { text: record.code, icon: moduleIcon(record.type) }
          : { text: 'Fiche', icon: 'file' };
      }
      case 'create':
        return { text: `Nouveau · ${entityDef(route.type).label}`, icon: 'plus' };
      case 'graph':
        return { text: 'Graphe', icon: 'graph' };
      case 'search':
        return { text: 'Recherche', icon: 'search' };
      case 'analytics':
        return { text: 'Statistiques', icon: 'analytics' };
      case 'timeline':
        return { text: 'Timeline', icon: 'timeline' };
      case 'calendar':
        return { text: 'Calendrier', icon: 'calendar' };
      case 'settings':
        return { text: 'Paramètres', icon: 'settings' };
    }
  };

  return (
    <div className="tabs" role="tablist" aria-label="Fiches ouvertes" ref={stripRef}>
      {tabs.map((tab) => {
        const { text, icon } = label(tab.route);
        return (
          <div
            key={tab.id}
            className={`tab${tab.id === activeId ? ' active' : ''}`}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeId}
            title={text}
            onClick={() => navigate(tab.route)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(tab.route);
              }
            }}
            // Le clic milieu ferme, comme dans un navigateur et dans VS Code.
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                close(tab.id);
              }
            }}
          >
            <Icon name={icon} size={13} />
            <span className="label">{text}</span>
            <span
              className="close"
              role="button"
              aria-label={`Fermer ${text}`}
              onClick={(e) => {
                e.stopPropagation();
                close(tab.id);
              }}
            >
              <Icon name="close" size={11} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Fil d'Ariane ──────────────────────────────────────────────────────────*/

function Breadcrumb({ route }: { route: Route }): ReactNode {
  const { db, revision } = useDb();
  void revision;

  const crumbs: { label: string; route?: Route }[] = [
    { label: 'Tableau de bord', route: { name: 'dashboard' } },
  ];

  switch (route.name) {
    case 'dashboard':
      crumbs.length = 0;
      crumbs.push({ label: 'Tableau de bord' });
      break;
    case 'list':
      crumbs.push({ label: entityDef(route.type).plural });
      break;
    case 'create':
      crumbs.push(
        { label: entityDef(route.type).plural, route: { name: 'list', type: route.type } },
        { label: 'Nouvelle fiche' },
      );
      break;
    case 'detail':
    case 'edit': {
      const record = getEntity(db, route.id);
      if (record) {
        crumbs.push({
          label: entityDef(record.type).plural,
          route: { name: 'list', type: record.type },
        });
        crumbs.push(
          route.name === 'edit'
            ? { label: record.code, route: { name: 'detail', id: record.id } }
            : { label: record.code },
        );
        if (route.name === 'edit') crumbs.push({ label: 'Modification' });
      } else {
        crumbs.push({ label: 'Fiche introuvable' });
      }
      break;
    }
    case 'graph':
      crumbs.push({ label: 'Graphe' });
      break;
    case 'search':
      crumbs.push({ label: 'Recherche' });
      break;
    case 'analytics':
      crumbs.push({ label: 'Statistiques' });
      break;
    case 'timeline':
      crumbs.push({ label: 'Timeline' });
      if (route.year) crumbs.push({ label: String(route.year) });
      break;
    case 'calendar':
      crumbs.push({ label: 'Calendrier' });
      break;
    case 'settings':
      crumbs.push({ label: 'Paramètres' });
      break;
  }

  return (
    <nav className="breadcrumb" aria-label="Fil d’Ariane">
      {crumbs.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} style={{ display: 'contents' }}>
          {i > 0 && (
            <span className="sep" aria-hidden="true">
              <Icon name="chevron" size={12} />
            </span>
          )}
          {crumb.route && i < crumbs.length - 1 ? (
            <a href={href(crumb.route)}>{crumb.label}</a>
          ) : (
            <span className="here" aria-current="page">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ── Actions de la barre supérieure ────────────────────────────────────────*/

/** État de la synchronisation : couleur + icône + mot, jamais la couleur seule. */
function SyncBadge(): ReactNode {
  const { syncState } = useDb();
  if (syncState.phase === 'idle') return null;

  const [icon, cls, text] =
    syncState.phase === 'syncing'
      ? (['refresh', '', 'Synchronisation…'] as const)
      : syncState.phase === 'error'
        ? (['cloudOff', 'bad', syncState.message] as const)
        : (['cloud', 'good', 'Synchronisé'] as const);

  return (
    <span className={`status ${cls} sync-badge`} title={text}>
      <Icon name={icon} size={14} />
      <span className="t">{text}</span>
    </span>
  );
}

function Notifications(): ReactNode {
  const { db, revision } = useDb();
  const [open, setOpen] = useState(false);
  const list = alerts(db);
  void revision;

  const warns = list.filter((a) => a.level === 'warn').length;

  return (
    <div className="pop-host">
      <button
        type="button"
        className={`icon-btn${list.length ? ' on' : ''}`}
        aria-label={`Notifications (${list.length})`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={17} />
        {list.length > 0 && <span className={`pip${warns ? ' warn' : ''}`} />}
      </button>

      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="pop" role="dialog" aria-label="Notifications">
            <h4>Relances</h4>
            {list.length === 0 ? (
              <p className="sub">Rien à signaler. Le graphe est à jour.</p>
            ) : (
              list.map((a) => (
                <a key={a.id} className="pop-item" href={a.href} onClick={() => setOpen(false)}>
                  <Icon name={a.level === 'warn' ? 'warn' : 'info'} className={a.level} />
                  <span>
                    <b>{a.label}</b>
                    <span className="sub">{a.detail}</span>
                  </span>
                </a>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ThemeToggle(): ReactNode {
  const prefs = usePrefs();
  const dark = resolvedTheme(prefs) === 'dark';
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      onClick={() => setPrefs({ theme: dark ? 'light' : 'dark' })}
    >
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
    </button>
  );
}

/**
 * Profil.
 *
 * Il n'y a qu'un utilisateur et aucun compte — l'application est locale. Ce
 * menu porte donc ce qui a réellement un sens ici : les réglages d'affichage
 * du cahier des charges (police réglable, contraste élevé) et l'accès aux
 * paramètres. Un faux écran de compte serait un décor.
 */
function Profile(): ReactNode {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);

  return (
    <div className="pop-host">
      <button
        type="button"
        className="avatar"
        aria-label="Profil et affichage"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="user" size={14} />
      </button>

      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="pop" role="dialog" aria-label="Profil et affichage">
            <h4>Affichage</h4>

            <div className="pop-row">
              <span>Thème</span>
              <div className="seg">
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={prefs.theme === t ? 'on' : ''}
                    onClick={() => setPrefs({ theme: t })}
                  >
                    {t === 'system' ? 'Auto' : t === 'light' ? 'Clair' : 'Sombre'}
                  </button>
                ))}
              </div>
            </div>

            <div className="pop-row">
              <span>Taille du texte</span>
              <div className="seg">
                {FONT_SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={prefs.fontScale === s ? 'on' : ''}
                    aria-label={`Texte à ${Math.round(s * 100)} %`}
                    onClick={() => setPrefs({ fontScale: s })}
                  >
                    {Math.round(s * 100)}
                  </button>
                ))}
              </div>
            </div>

            <div className="pop-row">
              <span>Contraste élevé</span>
              <div className="seg">
                <button
                  type="button"
                  className={prefs.contrast === 'normal' ? 'on' : ''}
                  onClick={() => setPrefs({ contrast: 'normal' })}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={prefs.contrast === 'high' ? 'on' : ''}
                  onClick={() => setPrefs({ contrast: 'high' })}
                >
                  Élevé
                </button>
              </div>
            </div>

            <a className="pop-item" href={href({ name: 'settings' })} onClick={() => setOpen(false)}>
              <Icon name="settings" />
              <span>
                <b>Paramètres</b>
                <span className="sub">Synchronisation, IA, données</span>
              </span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
