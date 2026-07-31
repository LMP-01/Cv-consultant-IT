/** Pair this device with a sync Worker and run a sync by hand. */
import { useState, type ReactNode } from 'react';
import { countDirty, getCursor, sync } from '../../sync/engine';
import { fetchStatus, httpTransport, pairDevice } from '../../sync/client';
import { loadSettings, saveSettings } from '../../settings';
import { useDb } from '../DbProvider';

export function SyncPanel(): ReactNode {
  const { db, write, revision } = useDb();
  const [settings, setSettings] = useState(loadSettings);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  void revision;
  const paired = Boolean(settings.syncUrl && settings.syncToken);
  const pending = countDirty(db);

  const pair = async (): Promise<void> => {
    setBusy('pair');
    setMessage(null);
    try {
      const token = await pairDevice(settings.syncUrl, secret);
      setSettings(saveSettings({ syncToken: token }));
      setSecret('');
      const status = await fetchStatus(settings.syncUrl, token);
      setMessage({
        kind: 'ok',
        text: `Appareil appairé. Le serveur contient ${status.entities} fiches et ${status.links} relations.`,
      });
    } catch (err) {
      setMessage({ kind: 'warn', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const run = async (): Promise<void> => {
    setBusy('sync');
    setMessage(null);
    try {
      const report = await write((d) =>
        sync(d, httpTransport(settings.syncUrl, settings.syncToken)),
      );
      const bits = [
        `${report.pulled.inserted} reçues`,
        `${report.pulled.overwritten} mises à jour`,
        `${report.pushed} envoyées`,
      ];
      if (report.pulled.keptLocal > 0) bits.push(`${report.pulled.keptLocal} gardées en local`);
      if (report.renamedCodes > 0) bits.push(`${report.renamedCodes} codes renumérotés`);
      setMessage({ kind: 'ok', text: `Synchronisé — ${bits.join(', ')}.` });
    } catch (err) {
      setMessage({
        kind: 'warn',
        text: `${err instanceof Error ? err.message : String(err)} — tes modifications restent en attente et repartiront à la prochaine synchronisation.`,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2>Synchronisation</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Optionnelle. Sans elle, Waza fonctionne entièrement hors-ligne et l’export
        <code> .sqlite3</code> suffit à transporter ton graphe. Avec elle, tes appareils
        convergent automatiquement.
      </p>

      <div className="card">
        <div className="fields">
          <div>
            <label className="field-label" htmlFor="sync-url">
              Adresse du Worker
            </label>
            <input
              id="sync-url"
              type="url"
              value={settings.syncUrl}
              placeholder="https://waza-sync.ton-compte.workers.dev"
              onChange={(e) => setSettings(saveSettings({ syncUrl: e.target.value.trim() }))}
            />
            <div className="field-help">
              Déploiement : <code>npm run worker:deploy</code>, puis
              <code> npx wrangler secret put SYNC_SECRET</code>.
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
                Appareil appairé · curseur {getCursor(db)} ·{' '}
                {pending === 0 ? 'rien en attente' : `${pending} modification(s) en attente`}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {!paired ? (
            <button
              type="button"
              className="btn primary"
              disabled={!settings.syncUrl || !secret || busy !== null}
              onClick={() => void pair()}
            >
              {busy === 'pair' ? 'Appairage…' : 'Appairer cet appareil'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn primary"
                disabled={busy !== null}
                onClick={() => void run()}
              >
                {busy === 'sync' ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => setSettings(saveSettings({ syncToken: '' }))}
              >
                Désappairer
              </button>
            </>
          )}
        </div>

        {message && (
          <p className={`banner${message.kind === 'warn' ? ' warn' : ''}`} style={{ marginTop: 12 }}>
            <span>{message.text}</span>
          </p>
        )}
      </div>
    </>
  );
}
