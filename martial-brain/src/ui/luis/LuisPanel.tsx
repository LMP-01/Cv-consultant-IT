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
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { getEntity } from '../../db/queries';
import { providerDef, type Attachment, type ProviderId } from '../../ai/providers';
import { modelChain, usableProviders } from '../../ai/router';
import { ask, type Turn } from '../../rag/luis';
import { listDocs } from '../../rag/store';
import { loadSettings } from '../../settings';
import { ProviderMark } from '../common';
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
  /** Rejoué dans l'historique du fil — l'URL d'objet vit pour la session. */
  attachments?: { kind: 'image' | 'video'; previewUrl: string }[];
}

/** Une image ou vidéo en cours de composition, avant l'envoi. */
interface PendingAttachment {
  id: string;
  mimeType: string;
  /** Base64 sans le préfixe `data:...;base64,` — ce que les fournisseurs attendent. */
  data: string;
  kind: 'image' | 'video';
  previewUrl: string;
  name: string;
}

// 10 Mo par fichier, 15 Mo cumulés : Gemini plafonne la requête entière autour
// de 20 Mo une fois encodée en base64 (+33 % environ), et c'est le seul
// fournisseur qui accepte la vidéo — la marge est prise sur son plafond à lui.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_BYTES = 15 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

/**
 * La dictée vocale du navigateur, sans les types DOM qui n'existent pas dans
 * la lib standard — l'API reste non standardisée malgré son âge. Seule la
 * forme réellement utilisée est déclarée, pas la surface complète.
 */
interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

type MascotMood = 'idle' | 'thinking' | 'writing';

/**
 * Le temps qu'une question passe « en réflexion » avant d'afficher « en train
 * d'écrire ». Il n'y a pas de vraie frontière entre les deux — la réponse
 * arrive d'un bloc, jamais en flux — donc c'est un rythme choisi, pas un
 * signal réel du fournisseur : assez court pour que l'écriture s'affiche
 * même sur une réponse rapide, assez long pour laisser voir la respiration.
 */
const THINK_MS = 1600;

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

  const drag = useRef<{ dx: number; dy: number; w: number; h: number; moved: boolean } | null>(
    null,
  );

  // Le déplacement écoute la fenêtre, pas le bouton : un doigt qui glisse vite
  // sort du bouton, et l'écouteur local perdrait l'événement en cours de route.
  useEffect(() => {
    if (!drag.current) return undefined;

    const onMove = (e: PointerEvent): void => {
      const d = drag.current;
      if (!d) return;
      d.moved = true;
      // La taille réelle du bouton est mesurée au moment du geste plutôt que
      // supposée fixe : sur grand écran la mascotte debout est bien plus
      // grande que le disque mobile, et une constante aurait laissé l'une
      // des deux tailles déborder de l'écran.
      const x = Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - d.w - 8);
      const y = Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - d.h - 8);
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
        drag.current = {
          dx: e.clientX - rect.left,
          dy: e.clientY - rect.top,
          w: rect.width,
          h: rect.height,
          moved: false,
        };
        // Forcer un rendu pour que l'effet ci-dessus s'abonne au glissement.
        setPos((p) => p ?? { x: rect.left, y: rect.top });
      }}
      // Le clic natif est neutralisé : c'est `pointerup` qui décide, parce que
      // lui seul sait si le geste était un clic ou un déplacement.
      onClick={(e) => e.preventDefault()}
    >
      {/* Visible seulement sur grand écran (voir styles.css) : sur mobile le
          disque d'accent porte déjà le sens à lui seul. */}
      <span className="luis-fab-tag" aria-hidden="true">
        IA
      </span>
      <img src="/mascot/luis.webp" alt="" className="luis-fab-avatar" draggable={false} />
    </button>
  );
}

/**
 * La mascotte, en scène. Trois humeurs sur une seule image : au repos elle
 * respire à peine, en réflexion elle respire fort assise en tailleur — la
 * pose ne change pas, elle est déjà en tailleur — et en écriture elle frappe
 * du sabre d'un air sérieux, une bulle « … » à ses côtés pour ne laisser
 * aucun doute sur ce qu'elle fait.
 */
function MascotStage({ mood, size = 'lg' }: { mood: MascotMood; size?: 'lg' | 'md' }): ReactNode {
  return (
    <div className={`mascot-stage${size === 'md' ? ' md' : ''}`} data-mood={mood}>
      <div className="mascot-figure">
        <img src="/mascot/luis.webp" alt="" className="mascot-img" />
        {mood === 'writing' && (
          <div className="mascot-bubble" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      {mood === 'thinking' && <p className="mascot-caption">Je réfléchis…</p>}
      {mood === 'writing' && <p className="mascot-caption">LUIS écrit…</p>}
    </div>
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
  const [showSensei, setShowSensei] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [prefer, setPrefer] = useState<{ provider: ProviderId; model: string } | null>(null);
  const [slugs, setSlugs] = useState<string[]>([]);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const docs = listDocs(db);
  void revision;

  const focusId = focusOf(route);
  const focus = focusId ? getEntity(db, focusId) : undefined;
  const providers = usableProviders(settings);
  const effectiveProvider = prefer?.provider ?? providers[0];
  const hasVideo = attachments.some((a) => a.kind === 'video');

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  // Réflexion puis écriture : la réponse arrive d'un bloc, sans étape
  // intermédiaire observable, donc la seconde humeur est un rythme choisi et
  // non un vrai signal du fournisseur (voir THINK_MS).
  useEffect(() => {
    if (!busy) {
      setMood('idle');
      return;
    }
    setMood('thinking');
    const t = window.setTimeout(() => setMood('writing'), THINK_MS);
    return () => window.clearTimeout(t);
  }, [busy]);

  // Un pack désinstallé ne doit pas rester sélectionné : la question serait
  // filtrée sur un corpus vide et ne trouverait plus rien, sans rien dire.
  useEffect(() => {
    setSlugs((prev) => prev.filter((s) => docs.some((d) => d.slug === s)));
  }, [docs.length]);

  // La reconnaissance vocale tourne côté navigateur ; l'arrêter en quittant
  // évite un micro qui reste ouvert derrière un panneau fermé.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const addFiles = async (files: FileList | File[]): Promise<void> => {
    setAttachError('');
    let runningTotal = attachments.reduce((sum, a) => sum + a.data.length * 0.75, 0);

    for (const file of Array.from(files)) {
      const kind: 'image' | 'video' | null = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : null;
      if (!kind) {
        setAttachError(`${file.name} : seules les images et les vidéos sont acceptées.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachError(`${file.name} dépasse 10 Mo — trop lourd pour être envoyé.`);
        continue;
      }
      if (runningTotal + file.size > MAX_ATTACHMENTS_TOTAL_BYTES) {
        setAttachError('15 Mo de pièces jointes au total, pas plus — retire-en une avant d’ajouter celle-ci.');
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        const comma = dataUrl.indexOf(',');
        const data = comma >= 0 ? dataUrl.slice(comma + 1) : '';
        runningTotal += file.size;
        setAttachments((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            mimeType: file.type,
            data,
            kind,
            previewUrl: URL.createObjectURL(file),
            name: file.name,
          },
        ]);
      } catch {
        setAttachError(`${file.name} n’a pas pu être lu.`);
      }
    }
  };

  const removeAttachment = (id: string): void => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // Compteur plutôt qu'un simple booléen : `dragenter`/`dragleave` se
  // déclenchent à chaque survol d'un enfant, et un booléen ferait clignoter
  // la zone de dépôt à chaque frontière traversée à l'intérieur du panneau.
  const onDragEnter = (e: DragEvent<HTMLElement>): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragOver = (e: DragEvent<HTMLElement>): void => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  };
  const onDragLeave = (e: DragEvent<HTMLElement>): void => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDrop = (e: DragEvent<HTMLElement>): void => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  };

  const toggleListening = (): void => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceError("La dictée vocale n'est pas prise en charge par ce navigateur.");
      return;
    }
    setVoiceError('');
    const recognition = new Ctor();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, i) => event.results[i]?.[0]?.transcript ?? '',
      )
        .join(' ')
        .trim();
      if (transcript) setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = (event) => {
      setVoiceError(
        event.error === 'not-allowed' || event.error === 'permission-denied'
          ? 'Micro refusé — autorise-le dans les réglages du navigateur.'
          : 'La dictée vocale a échoué.',
      );
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const send = async (): Promise<void> => {
    const question = draft.trim();
    if ((!question && attachments.length === 0) || busy) return;

    const sent = attachments;
    const mine: Message = {
      id: `u${Date.now()}`,
      role: 'user',
      text:
        question ||
        (sent.length > 1 ? 'Pièces jointes' : sent[0]?.kind === 'video' ? 'Vidéo jointe' : 'Image jointe'),
      ...(sent.length ? { attachments: sent.map((a) => ({ kind: a.kind, previewUrl: a.previewUrl })) } : {}),
    };
    setMessages((prev) => [...prev, mine]);
    setDraft('');
    setAttachments([]);
    setAttachError('');
    setBusy(true);

    try {
      const result = await ask(db, settings, {
        question: question || 'Décris et analyse ce qui est joint.',
        history: messages.map((m) => ({ role: m.role, text: m.text })),
        ...(slugs.length ? { slugs } : {}),
        ...(focusId ? { focusId } : {}),
        ...(prefer ? { prefer } : {}),
        ...(sent.length
          ? { attachments: sent.map((a): Attachment => ({ mimeType: a.mimeType, data: a.data })) }
          : {}),
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
    <aside
      className="luis"
      aria-label="LUIS AI"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="luis-head">
        <span className="luis-title">
          <img src="/mascot/luis.webp" alt="" className="luis-avatar" />
          LUIS&nbsp;AI
        </span>

        <button type="button" className="icon-btn" aria-label="Fermer LUIS AI" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </header>

      {dragActive && (
        <div className="luis-dropzone" aria-hidden="true">
          <Icon name="attach" size={22} />
          <span>Dépose une image ou une vidéo</span>
        </div>
      )}

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
            {m.attachments && m.attachments.length > 0 && (
              <div className="luis-msg-attachments">
                {m.attachments.map((a, i) =>
                  a.kind === 'image' ? (
                    <img key={i} src={a.previewUrl} alt="" />
                  ) : (
                    <video key={i} src={a.previewUrl} controls muted />
                  ),
                )}
              </div>
            )}
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
            <MascotStage mood={mood} size="md" />
          </div>
        )}
      </div>

      {/* Les deux réglages qui changent la réponse — pas ceux qui la lisent —
          juste au-dessus du champ où elle se déclenche : le regard n'a plus à
          remonter en haut du panneau pour savoir qui va répondre et sur quoi.
          Deux puces de suggestion plutôt que deux cartes : leur liste s'ouvre
          vers le haut, juste au-dessus d'elles. */}
      <div className="luis-toolbar">
        <div className="pop-host">
          <button
            type="button"
            className={`luis-tool${slugs.length ? ' on' : ''}`}
            onClick={() => setShowSensei((v) => !v)}
            title="Choisir le pack de connaissances"
          >
            <span className="luis-tool-icon">
              <Icon name="resource" size={13} />
            </span>
            <span className="luis-tool-value">
              {slugs.length === 0
                ? 'Sensei · Mixte'
                : slugs.length === 1
                  ? (docs.find((d) => d.slug === slugs[0])?.title.split(' —')[0] ?? '1 pack')
                  : `${slugs.length} packs`}
            </span>
            <Icon name="chevron" size={11} className="luis-tool-caret" />
          </button>
          {showSensei && (
            <>
              <div className="pop-scrim" onClick={() => setShowSensei(false)} />
              <div className="pop up left" role="dialog" aria-label="Pack de connaissances">
                <h4>Pack de connaissances</h4>
                <button
                  type="button"
                  className={`pop-item${slugs.length === 0 ? ' on' : ''}`}
                  onClick={() => setSlugs([])}
                >
                  <Icon name="graph" />
                  <span>
                    <b>Mixte</b>
                    <span className="sub">Tous les packs installés et tes fiches</span>
                  </span>
                </button>

                {docs.length === 0 ? (
                  <p className="sub" style={{ padding: '4px 8px' }}>
                    Aucun pack installé pour l’instant.
                  </p>
                ) : (
                  docs.map((d) => {
                    const on = slugs.includes(d.slug);
                    return (
                      <button
                        key={d.slug}
                        type="button"
                        className={`pop-item${on ? ' on' : ''}`}
                        onClick={() => setSlugs((prev) => (on ? prev.filter((s) => s !== d.slug) : [...prev, d.slug]))}
                      >
                        <Icon name="check" style={{ opacity: on ? 1 : 0 }} />
                        <span>
                          <b>{d.title.split(' —')[0]}</b>
                        </span>
                      </button>
                    );
                  })
                )}

                <button
                  type="button"
                  className="pop-item"
                  style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 9 }}
                  onClick={() => {
                    setShowSensei(false);
                    setShowCorpus(true);
                  }}
                >
                  <Icon name="settings" size={14} />
                  <span>
                    <b>Gérer les packs…</b>
                    <span className="sub">Installer, vectoriser, importer un document</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="pop-host">
          <button
            type="button"
            className={`luis-tool${prefer ? ' on' : ''}`}
            onClick={() => setShowModels((v) => !v)}
            title="Choisir le modèle"
          >
            <span className="luis-tool-icon">
              <Icon name="hypothesis" size={13} />
            </span>
            <span className="luis-tool-value">
              Modèle · {prefer ? prefer.model.split('/').pop() : 'Auto'}
            </span>
            <Icon name="chevron" size={11} className="luis-tool-caret" />
          </button>
          {showModels && (
            <>
              <div className="pop-scrim" onClick={() => setShowModels(false)} />
              <div className="pop up left" role="dialog" aria-label="Modèle">
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
                    <h4
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        textTransform: 'none',
                        fontSize: 12.5,
                      }}
                    >
                      <ProviderMark id={id} size={16} />
                      {providerDef(id).label}
                    </h4>
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
      </div>

      <form
        className="luis-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {(attachments.length > 0 || attachError) && (
          <div className="luis-attachments">
            {attachments.map((a) => (
              <div key={a.id} className="luis-attachment" title={a.name}>
                {a.kind === 'image' ? (
                  <img src={a.previewUrl} alt="" />
                ) : (
                  <video src={a.previewUrl} muted />
                )}
                <button
                  type="button"
                  className="luis-attachment-remove"
                  aria-label={`Retirer ${a.name}`}
                  onClick={() => removeAttachment(a.id)}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
            {attachError && <p className="luis-attach-note bad">{attachError}</p>}
          </div>
        )}

        {hasVideo && effectiveProvider !== 'gemini' && (
          <p className="luis-attach-note">
            La vidéo n’est comprise que par Gemini — choisis-le comme modèle pour qu’elle soit
            vraiment analysée.
          </p>
        )}
        {voiceError && <p className="luis-attach-note bad">{voiceError}</p>}

        <div className="luis-compose-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="icon-btn"
            title="Joindre une image ou une vidéo"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="attach" size={16} />
          </button>

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

          {Boolean(getSpeechRecognition()) && (
            <button
              type="button"
              className={`icon-btn${listening ? ' listening' : ''}`}
              title={listening ? 'Arrêter la dictée' : 'Dicter en français'}
              aria-pressed={listening}
              onClick={toggleListening}
            >
              <Icon name="mic" size={16} />
            </button>
          )}

          <button
            type="submit"
            className="btn primary"
            disabled={busy || (!draft.trim() && attachments.length === 0)}
          >
            <Icon name="arrow" size={14} />
          </button>
        </div>
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
      <MascotStage mood="idle" />
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
