/** Pair this device, then get out of the way — syncing is automatic. */
import { useState, type ReactNode } from 'react';
import { countDirty, getCursor } from '../../sync/engine';
import { fetchStatus, pairDevice } from '../../sync/client';
import { loadSettings, saveSettings } from '../../settings';
import { useDb } from '../DbProvider';

function relative(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

export function SyncPanel(): ReactNode {
  const { db, revision, syncState, syncNow } = useDb();
  const [settings, setSettings] = useState(loadSettings);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  void revision;
  const paired = Boolean(settings.syncToken);
  const pending = countDirty(db);

  const pair = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const token = await pairDevice(settings.syncUrl, secret);
      setSettings(saveSettings({ syncToken: token }));
      setSecret('');
      const status = await fetchStatus(settings.syncUrl, token);
      setMessage({
        kind: 'ok',
        text: `Appareil appairé. Le serveur contient ${status.entities} fiches et ${status.links} relations. La synchronisation est désormais automatique.`,
      });
      void syncNow();
    } catch (err) {
      setMessage({ kind: 'warn', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Synchronisation</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Optionnelle. Sans elle, Combat OS fonctionne entièrement hors-ligne et l’export
        <code> .sqlite3</code> suffit à transporter ton graphe. Une fois l’appareil appairé,
        la synchronisation se fait toute seule : à l’ouverture, au retour sur l’app, au
        retour du réseau, après chaque enregistrement, et toutes les cinq minutes.
      </p>

      <div className="card">
        <div className="fields">
          <div>
            <label className="field-label" htmlFor="sync-url">
              Adresse du serveur
            </label>
            <input
              id="sync-url"
              type="url"
              value={settings.syncUrl}
              placeholder="laisser vide si l’app est servie par le même déploiement"
              onChange={(e) => setSettings(saveSettings({ syncUrl: e.target.value.trim() }))}
            />
            <div className="field-help">
              Vide = même origine que cette page, ce qui est le cas normal : un seul
              déploiement Deno sert l’application et la synchronisation.
            </div>
          </div>

          {!paired ? (
            <div>
              <label className="field-label" htmlFor="sync-secret">
                Phrase secrète
              </label>
              <input
                id="sync-secret"
                type="password"
                value={secret}
                autoComplete="off"
                placeholder="celle définie dans SYNC_SECRET"
                onChange={(e) => setSecret(e.target.value)}
              />
              <div className="field-help">
                Saisie une seule fois par appareil. Elle est échangée contre un jeton signé ;
                la phrase elle-même n’est pas conservée ici.
              </div>
            </div>
          ) : (
            <div>
              <div className="field-label">État</div>
              <div className="field-value">
                {syncState.phase === 'syncing'
                  ? 'Synchronisation en cours…'
                  : syncState.phase === 'error'
                    ? `Dernière tentative en échec (${syncState.message})`
                    : syncState.at
                      ? `À jour, synchronisé ${relative(syncState.at)}`
                      : 'Appairé, en attente du premier cycle'}
              </div>
              <div className="field-help">
                Curseur {getCursor(db)} ·{' '}
                {pending === 0
                  ? 'rien en attente'
                  : `${pending} modification(s) en attente d’envoi`}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {!paired ? (
            <button
              type="button"
              className="btn primary"
              disabled={!secret || busy}
              onClick={() => void pair()}
            >
              {busy ? 'Appairage…' : 'Appairer cet appareil'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={syncState.phase === 'syncing'}
                onClick={() => void syncNow()}
              >
                {syncState.phase === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSettings(saveSettings({ syncToken: '' }))}
              >
                Désappairer
              </button>
            </>
          )}
        </div>

        {syncState.phase === 'error' && (
          <p className="banner warn" style={{ marginTop: 12 }}>
            <span>
              {syncState.message}. Tes modifications restent en attente et repartiront
              automatiquement au prochain cycle — rien n’est perdu.
            </span>
          </p>
        )}

        {message && (
          <p className={`banner${message.kind === 'warn' ? ' warn' : ''}`} style={{ marginTop: 12 }}>
            <span>{message.text}</span>
          </p>
        )}
      </div>
    </>
  );
}
