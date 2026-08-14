/** Device settings: theme, storage, backup. Sync and AI are added on top. */
import { useRef, useState, type ReactNode } from 'react';
import { downloadDatabase, restoreDatabase } from '../db/backup';
import { graphHealth } from '../db/analytics';
import { remainingSeedCount, removeSeed } from '../db/seed';
import { usePrefs } from './AppShell';
import { useDb } from './DbProvider';
import { Screen } from './common';
import { Icon } from './icons';
import { FONT_SCALES, setPrefs } from './prefs';
import { AiPanel } from './settings/AiPanel';
import { SyncPanel } from './settings/SyncPanel';

const BACKEND_LABEL: Record<string, string> = {
  indexeddb: 'IndexedDB — écrit après chaque enregistrement',
  memory: 'Mémoire — non persistant',
};

export function SettingsView(): ReactNode {
  const { db, revision, write, flush } = useDb();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const health = graphHealth(db);
  const seedLeft = remainingSeedCount(db);
  void revision;

  const onImport = async (file: File): Promise<void> => {
    if (
      !confirm(
        `Remplacer la base actuelle (${health.entities} fiches) par le contenu de « ${file.name} » ?\n\nCette action est irréversible — exporte d’abord si tu veux garder l’état actuel.`,
      )
    ) {
      return;
    }
    setBusy('import');
    setError(null);
    try {
      await restoreDatabase(db, file);
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  };

  return (
    <Screen>
      <div className="page-head">
        <div className="grow">
          <p className="sub">Réglages</p>
          <h1>Cet appareil</h1>
        </div>
      </div>

      <h2>Affichage et accessibilité</h2>
      <AppearancePanel />

      <h2>Stockage</h2>
      <div className="card">
        <div className="fields">
          <div>
            <div className="field-label">Backend</div>
            <div className="field-value">{BACKEND_LABEL[db.backend] ?? db.backend}</div>
          </div>
          <div>
            <div className="field-label">Contenu</div>
            <div className="field-value">
              {health.entities} fiches · {health.links} relations
            </div>
          </div>
        </div>
        {db.backend === 'memory' && (
          <p className="banner warn" style={{ marginTop: 12 }}>
            <span>
              Aucun stockage persistant disponible. Tes modifications seront perdues en fermant
              l’onglet — c’est typiquement le cas en navigation privée.
            </span>
          </p>
        )}
      </div>

      <h2>Sauvegarde</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        L’export produit un fichier <code>.sqlite3</code> — la base elle-même, lisible par
        n’importe quel outil SQLite. C’est aussi la façon de transférer ton graphe vers un autre
        appareil sans passer par un serveur.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn primary"
          disabled={busy !== null}
          onClick={() => {
            setBusy('export');
            void downloadDatabase(db).finally(() => setBusy(null));
          }}
        >
          {busy === 'export' ? 'Export…' : 'Exporter la base'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
        >
          {busy === 'import' ? 'Import…' : 'Importer une base'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".sqlite3,.sqlite,.db,application/x-sqlite3"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onImport(file);
          }}
        />
      </div>

      {error && (
        <p className="banner warn" style={{ marginTop: 12 }}>
          <span>{error}</span>
        </p>
      )}

      {seedLeft > 0 && (
        <>
          <h2>Fiches d’exemple</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            {seedLeft} fiches d’exemple sont encore présentes. Elles servent à montrer ce
            qu’un graphe relié permet. Si tu appaires un second appareil, son propre jeu
            d’exemples fusionnera avec celui-ci — les deux appareils sèment avant de se
            rencontrer.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => {
              if (!confirm(`Supprimer les ${seedLeft} fiches d’exemple encore présentes ?`)) return;
              write((d) => removeSeed(d));
              void flush();
            }}
          >
            Supprimer les fiches d’exemple
          </button>
        </>
      )}

      <SyncPanel />
      <AiPanel />
    </Screen>
  );
}

/**
 * Les réglages d'affichage, à l'endroit où on les cherche.
 *
 * Ils sont aussi dans le menu de profil et dans la palette de commandes — ce
 * n'est pas une redite mais trois portes sur le même état, qui est unique
 * (`ui/prefs.ts`). Un réglage d'accessibilité qu'il faut trouver est un
 * réglage qui ne sera pas trouvé.
 */
function AppearancePanel(): ReactNode {
  const prefs = usePrefs();

  return (
    <div className="card">
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
              {t === 'system' ? 'Système' : t === 'light' ? 'Clair' : 'Sombre'}
            </button>
          ))}
        </div>
      </div>

      <div className="pop-row">
        <span>Taille du texte</span>
        <div className="seg">
          {FONT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              className={prefs.fontScale === scale ? 'on' : ''}
              aria-label={`Texte à ${Math.round(scale * 100)} %`}
              onClick={() => setPrefs({ fontScale: scale })}
            >
              {Math.round(scale * 100)} %
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

      <p className="sub" style={{ marginTop: 8 }}>
        <Icon name="info" size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
        Le contraste élevé s’ajoute au thème choisi au lieu de le remplacer :
        « sombre + contraste élevé » reste possible. Ces réglages restent sur cet
        appareil et ne sont pas synchronisés.
      </p>
    </div>
  );
}
