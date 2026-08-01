/**
 * LUIS AI — le panneau.
 *
 * Sur ordinateur il occupe la colonne libre à droite du contenu : cet espace
 * existait déjà, vide, parce qu'un texte de plus de cent caractères par ligne
 * ne se lit plus. Y installer l'analyste plutôt que d'élargir le texte règle
 * les deux problèmes d'un coup.
 *
 * Sur mobile il n'y a pas de colonne libre, donc pas de dock : un bouton
 * flottant, déplaçable, qui ouvre une feuille. Déplaçable parce qu'un bouton
 * fixe en bas à droite masque toujours quelque chose, et que ce quelque chose
 * dépend de l'écran.
 *
 * Le panneau connaît la fiche ouverte. Poser une question depuis K003 sans
 * avoir à écrire « à propos de K003 » est la moitié de l'intérêt.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getEntity } from '../../db/queries';
import { providerDef, type ProviderId } from '../../ai/providers';
import { modelChain, usableProviders } from '../../ai/router';
import { ask, type Turn } from '../../rag/luis';
import { listDocs } from '../../rag/store';
import { loadSettings } from '../../settings';
import { useDb } from '../DbProvider';
import { Icon } from '../icons';
import { href, navigate, type Route } from '../router';
import { CorpusPanel } from './CorpusPanel';

const KEY_OPEN = 'combat-os.luis.open';
const KEY_FAB = 'combat-os.luis.fab';

interface Message extends Turn {
  id: string;
  /** Ce sur quoi la réponse s'appuie — cliquable. */
  sources?: { label: string; route?: Route }[];
  meta?: string;
  error?: boolean;
}

/** La fiche à laquelle la question se rapporte, s'il y en a une. */
function focusOf(route: Route): string | undefined {
  return route.name === 'detail' || route.name === 'edit' ? route.id : undefined;
}

export function LuisPanel({ route }: { route: Route }): ReactNode {
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(KEY_OPEN);
      // Ouvert par défaut sur grand écran — c'est là que la place existe.
      return stored ? stored === '1' : window.innerWidth >= 1280;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.luis = open ? 'open' : 'closed';
    try {
      localStorage.setItem(KEY_OPEN, open ? '1' : '0');
    } catch {
      /* stockage refusé : l'état vaut pour la session */
    }
  }, [open]);

  // Ctrl/Cmd + J : le pendant de Ctrl+K. On cherche avec l'un, on analyse avec
  // l'autre, sans jamais lâcher le clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {!open && <Fab onClick={() => setOpen(true)} />}
      {open && <Conversation route={route} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── Le bouton flottant, déplaçable ───────────────────────────────────────── */

function Fab({ onClick }: { onClick: () => void }): ReactNode {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(KEY_FAB);
      return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });

  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  // Le déplacement écoute la fenêtre, pas le bouton : un doigt qui glisse vite
  // sort du bouton, et l'écouteur local perdrait l'événement en cours de route.
  useEffect(() => {
    if (!drag.current) return undefined;

    const onMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d) return;
      d.moved = true;
      const x = Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - 60);
      const y = Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - 60);
      setPos({ x, y });
    };

    const onUp = (): void => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) onClick();
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(KEY_FAB, JSON.stringify(p));
          } catch {
            /* stockage refusé */
          }
        }
        return p;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  return (
    <button
      type="button"
      className="luis-fab"
      aria-label="Ouvrir LUIS AI"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
        // Forcer un rendu pour que l'effet ci-dessus s'abonne au glissement.
        setPos((p) => p ?? { x: rect.left, y: rect.top });
      }}
      // Le clic natif est neutralisé : c'est `pointerup` qui décide, parce que
      // lui seul sait si le geste était un clic ou un déplacement.
      onClick={(e) => e.preventDefault()}
    >
      <img src="/mascot/luis.webp" alt="" className="luis-fab-avatar" draggable={false} />
    </button>
  );
}

/* ── La conversation ──────────────────────────────────────────────────────── */

function Conversation({ route, onClose }: { route: Route; onClose: () => void }): ReactNode {
  const { db, revision } = useDb();
  const [settings, setSettings] = useState(loadSettings);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCorpus, setShowCorpus] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [prefer, setPrefer] = useState<{ provider: ProviderId; model: string } | null>(null);
  const [slugs, setSlugs] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const docs = listDocs(db);
  void revision;

  const focusId = focusOf(route);
  const focus = focusId ? getEntity(db, focusId) : undefined;
  const providers = usableProviders(settings);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Un pack désinstallé ne doit pas rester sélectionné : la question serait
  // filtrée sur un corpus vide et ne trouverait plus rien, sans rien dire.
  useEffect(() => {
    setSlugs((prev) => prev.filter((s) => docs.some((d) => d.slug === s)));
  }, [docs.length]);

  const send = async (): Promise<void> => {
    const question = draft.trim();
    if (!question || busy) return;

    const mine: Message = { id: `u${Date.now()}`, role: 'user', text: question };
    setMessages((prev) => [...prev, mine]);
    setDraft('');
    setBusy(true);

    try {
      const result = await ask(db, settings, {
        question,
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        ...(slugs.length ? { slugs } : {}),
        ...(focusId ? { focusId } : {}),
        ...(prefer ? { prefer } : {}),
      });

      const sources = result.hits.map((hit) =>
        hit.kind === 'fiche'
          ? { label: hit.record.code, route: { name: 'detail' as const, id: hit.record.id } }
          : { label: `pack:${hit.docSlug}` },
      );

      const parts = [
        `${providerDef(result.route.provider).label} · ${result.route.model}`,
        `${result.used.fts} passage(s) texte`,
        result.used.vector ? `${result.used.vector} par similarité` : '',
        result.used.graph ? `${result.used.graph} via le graphe` : '',
      ].filter(Boolean);

      setMessages((prev) => [
        ...prev,
        {
          id: `a${Date.now()}`,
          role: 'assistant',
          text: result.answer,
          sources,
          meta: parts.join(' · '),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e${Date.now()}`,
          role: 'assistant',
          text: err instanceof Error ? err.message : String(err),
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="luis" aria-label="LUIS AI">
      <header className="luis-head">
        <span className="luis-title">
          <img src="/mascot/luis.webp" alt="" className="luis-avatar" />
          LUIS&nbsp;AI
        </span>

        <button
          type="button"
          className={`chip sm${slugs.length ? ' on' : ''}`}
          onClick={() => setShowCorpus(true)}
          title="Choisir le pack de connaissances"
        >
          <Icon name="resource" size={12} />
          <span className="t">
            {slugs.length === 0
              ? 'Mixte'
              : slugs.length === 1
                ? (docs.find((d) => d.slug === slugs[0])?.title.split(' —')[0] ?? '1 pack')
                : `${slugs.length} packs`}
          </span>
        </button>

        <div className="pop-host">
          <button
            type="button"
            className="chip sm"
            onClick={() => setShowModels((v) => !v)}
            title="Choisir le modèle"
          >
            <Icon name="hypothesis" size={12} />
            <span className="t">{prefer ? prefer.model.split('/').pop() : 'Auto'}</span>
          </button>
          {showModels && (
            <>
              <div className="pop-scrim" onClick={() => setShowModels(false)} />
              <div className="pop" role="dialog" aria-label="Modèle">
                <h4>Modèle</h4>
                <button
                  type="button"
                  className={`pop-item${prefer ? '' : ' on'}`}
                  onClick={() => {
                    setPrefer(null);
                    setShowModels(false);
                  }}
                >
                  <Icon name="refresh" />
                  <span>
                    <b>Automatique</b>
                    <span className="sub">Suit ton ordre de fournisseurs</span>
                  </span>
                </button>

                {providers.length === 0 && (
                  <p className="sub" style={{ padding: '4px 8px' }}>
                    Aucune clé configurée.{' '}
                    <a href={href({ name: 'settings' })} style={{ color: 'var(--accent)' }}>
                      En ajouter une
                    </a>
                    .
                  </p>
                )}

                {providers.map((id) => (
                  <div key={id}>
                    <h4 style={{ marginTop: 10 }}>{providerDef(id).label}</h4>
                    {modelChain(settings, id, false).map((model) => (
                      <button
                        key={model}
                        type="button"
                        className={`pop-item${prefer?.model === model ? ' on' : ''}`}
                        onClick={() => {
                          setPrefer({ provider: id, model });
                          setShowModels(false);
                        }}
                      >
                        <Icon name="check" style={{ opacity: prefer?.model === model ? 1 : 0 }} />
                        <span>
                          <b>{model}</b>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}

                <p className="sub" style={{ padding: '8px 8px 2px' }}>
                  Le modèle choisi est celui par lequel on commence. S’il n’a plus
                  de quota, LUIS passe au suivant de la même clé, puis à la clé
                  suivante — la réponse dit toujours qui a répondu.
                </p>
              </div>
            </>
          )}
        </div>

        <button type="button" className="icon-btn" aria-label="Fermer LUIS AI" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </header>

      {focus && (
        <div className="luis-focus">
          <Icon name="link" size={12} />
          Analyse rattachée à <b>{focus.code}</b> — {focus.title}
        </div>
      )}

      <div className="luis-list" ref={listRef}>
        {messages.length === 0 && <Intro configured={providers.length > 0} docs={docs.length} />}

        {messages.map((m) => (
          <div key={m.id} className={`luis-msg ${m.role}${m.error ? ' bad' : ''}`}>
            <div className="luis-text">{m.text}</div>
            {m.sources && m.sources.length > 0 && (
              <div className="luis-src">
                {m.sources.map((s, i) => (
                  <button
                    key={`${s.label}-${i}`}
                    type="button"
                    className="code"
                    onClick={() => s.route && navigate(s.route)}
                    style={s.route ? undefined : { cursor: 'default' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {m.meta && <div className="luis-meta">{m.meta}</div>}
          </div>
        ))}

        {busy && (
          <div className="luis-msg assistant">
            <div className="luis-meta">LUIS cherche dans ta base…</div>
          </div>
        )}
      </div>

      <form
        className="luis-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          rows={2}
          placeholder={focus ? `Question sur ${focus.code}…` : 'Pose ta question…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée passe à la ligne. C'est la convention
            // de toutes les messageries, et la casser surprendrait.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="btn primary" disabled={busy || !draft.trim()}>
          <Icon name="arrow" size={14} />
        </button>
      </form>

      {showCorpus && (
        <CorpusPanel
          selected={slugs}
          onSelect={setSlugs}
          onClose={() => {
            setShowCorpus(false);
            setSettings(loadSettings());
          }}
        />
      )}
    </aside>
  );
}

function Intro({ configured, docs }: { configured: boolean; docs: number }): ReactNode {
  return (
    <div className="luis-intro">
      <p>
        <b>LUIS AI</b> lit <i>ta</i> base avant de répondre : tes fiches, leurs relations, et le
        pack de connaissances choisi. Il cite ses sources et ne calcule aucun chiffre lui-même.
      </p>

      {!configured && (
        <p className="banner warn">
          <Icon name="warn" size={14} />
          <span>
            Aucune clé IA.{' '}
            <a href={href({ name: 'settings' })} style={{ color: 'var(--accent)' }}>
              En ajouter une
            </a>{' '}
            — Gemini, Groq et Mistral ont un palier gratuit.
          </span>
        </p>
      )}

      {configured && docs === 0 && (
        <p className="banner">
          <Icon name="info" size={14} />
          <span>
            Aucun pack installé. LUIS répondra sur tes seules fiches — utile, mais il ne saura
            rien du règlement de ta discipline.
          </span>
        </p>
      )}

      <div className="luis-hints">
        {[
          'Pourquoi mon Mae Geri passe moins depuis mon dernier combat ?',
          'Quelles fiches devrais-je relier et je ne l’ai pas fait ?',
          'Fais le point sur mes hypothèses ouvertes.',
          'Quel plan pour les trois prochaines semaines ?',
        ].map((hint) => (
          <span key={hint} className="tag">
            {hint}
          </span>
        ))}
      </div>
    </div>
  );
}
