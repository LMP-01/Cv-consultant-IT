/**
 * La colonne de gauche d'une fiche — images, schémas, vidéos, PDF, liens.
 *
 * Deux façons d'attacher un média, et le choix entre les deux n'est pas
 * cosmétique :
 *
 *   · Les images sont **incorporées** dans la fiche (data URL). Elles doivent
 *     rester lisibles hors-ligne, dans le train, sans réseau — un schéma de
 *     placement de pied qui ne s'affiche pas au dojo ne sert à rien. Elles sont
 *     donc redimensionnées et recompressées avant stockage.
 *   · Les vidéos, PDF et pages web sont **référencés**. Une vidéo de sparring
 *     pèse des dizaines de mégaoctets ; l'incorporer ferait exploser la base et
 *     rendrait la synchronisation impraticable. Le lien, lui, coûte cent
 *     octets.
 *
 * La limite de taille est appliquée ici plutôt que signalée après coup : une
 * base gonflée se remarque des mois plus tard, quand il est trop tard.
 */
import { useRef, useState, type ReactNode } from 'react';
import { updateEntity, type EntityRecord } from '../../db/queries';
import { useDb } from '../DbProvider';
import { Icon } from '../icons';

export interface MediaItem {
  kind: 'image' | 'video' | 'pdf' | 'lien';
  /** Data URL pour une image incorporée, URL absolue sinon. */
  src: string;
  name?: string;
}

/** Côté long maximal d'une image stockée. Au-delà, l'écran ne rend pas plus. */
const MAX_EDGE = 1400;
/** Une image au-delà de ça après recompression est refusée, pas tronquée. */
const MAX_BYTES = 400_000;

export function readMedia(record: EntityRecord): MediaItem[] {
  const raw = record.data.media;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is MediaItem =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as MediaItem).src === 'string' &&
      ['image', 'video', 'pdf', 'lien'].includes((m as MediaItem).kind),
  );
}

/** Ce que l'URL désigne, d'après son extension ou son hôte. */
function classify(url: string): MediaItem['kind'] {
  const clean = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(mp4|webm|mov|m4v)$/.test(clean)) return 'video';
  if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com/.test(clean)) return 'video';
  if (clean.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean)) return 'image';
  return 'lien';
}

/**
 * Redimensionne et recompresse une image choisie dans le navigateur.
 *
 * `createImageBitmap` puis `canvas` : aucune bibliothèque, et le décodage se
 * fait hors du fil principal.
 */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // On descend en qualité tant que le poids dépasse le plafond, plutôt que de
  // refuser d'emblée : une photo de téléphone passe presque toujours à 0,7.
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const url = canvas.toDataURL('image/webp', quality);
    if (url.length * 0.75 <= MAX_BYTES) return url;
  }
  throw new Error('Image trop lourde même après compression.');
}

export function MediaColumn({ record }: { record: EntityRecord }): ReactNode {
  const { db, write, flush } = useDb();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const media = readMedia(record);

  const save = async (next: MediaItem[]): Promise<void> => {
    write((d) => updateEntity(d, record.id, { data: { ...record.data, media: next } }));
    await flush();
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const added: MediaItem[] = [];
    try {
      for (const file of [...files]) {
        if (!file.type.startsWith('image/')) {
          setError(
            `${file.name} n’est pas une image. Les vidéos et PDF s’ajoutent par lien — ` +
              'les incorporer rendrait la base insynchronisable.',
          );
          continue;
        }
        added.push({ kind: 'image', src: await shrink(file), name: file.name });
      }
      if (added.length) await save([...media, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const addLink = async (url: string): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Un lien doit commencer par http:// ou https://');
      return;
    }
    setError(null);
    setLinkOpen(false);
    await save([...media, { kind: classify(trimmed), src: trimmed }]);
  };

  const remove = async (index: number): Promise<void> => {
    await save(media.filter((_, i) => i !== index));
  };

  void db;

  return (
    <div className="media-col">
      <h4>Médias</h4>

      {media.map((item, i) => (
        <figure className="media-thumb" key={`${item.src.slice(0, 48)}-${i}`}>
          {item.kind === 'image' ? (
            <img src={item.src} alt={item.name ?? 'Image de la fiche'} loading="lazy" />
          ) : (
            <a className="media-link" href={item.src} target="_blank" rel="noreferrer noopener">
              <Icon name={item.kind === 'video' ? 'video' : item.kind === 'pdf' ? 'file' : 'link'} size={15} />
              <span className="t">{item.name ?? item.src.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          <button
            type="button"
            className="media-del icon-btn"
            aria-label="Retirer ce média"
            onClick={() => void remove(i)}
          >
            <Icon name="close" size={12} />
          </button>
        </figure>
      ))}

      <div
        className="media-drop"
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles(e.dataTransfer.files);
        }}
      >
        <Icon name="media" size={18} />
        <div style={{ marginTop: 5 }}>
          {busy ? 'Compression…' : 'Déposer une image, ou cliquer'}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {linkOpen ? (
        <input
          type="url"
          autoFocus
          placeholder="https://… (vidéo, PDF, page)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addLink(e.currentTarget.value);
            if (e.key === 'Escape') setLinkOpen(false);
          }}
          onBlur={(e) => void addLink(e.currentTarget.value)}
        />
      ) : (
        <button type="button" className="btn ghost" onClick={() => setLinkOpen(true)}>
          <Icon name="link" size={14} />
          Ajouter un lien
        </button>
      )}

      {error && (
        <p className="banner warn">
          <Icon name="warn" size={14} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
