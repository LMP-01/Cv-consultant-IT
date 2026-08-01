/**
 * BYOK configuration.
 *
 * Keys stay in this device's localStorage and go straight to the provider the
 * user picked. No account, no server-side key store, nothing to leak — and the
 * AI features work with no infrastructure deployed at all.
 */
import { useState, type ReactNode } from 'react';
import {
  fetchModels,
  PROVIDERS,
  suggestModel,
  type ProviderId,
} from '../../ai/providers';
import { loadSettings, saveSettings } from '../../settings';
import { ProviderMark } from '../common';

export function AiPanel(): ReactNode {
  const [settings, setSettings] = useState(loadSettings);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const configured = PROVIDERS.filter((p) => settings.aiKeys[p.id] && settings.aiModels[p.id]);

  const check = async (id: ProviderId): Promise<void> => {
    const key = settings.aiKeys[id];
    if (!key) return;
    setBusy(id);
    setErrors((prev) => ({ ...prev, [id]: '' }));
    try {
      const available = await fetchModels(id, key);
      setModels((prev) => ({ ...prev, [id]: available }));

      // La liste est conservée : c'est elle qui donne au routeur de quoi se
      // replier sur un autre modèle de la même clé quand un quota est atteint.
      const patch: Parameters<typeof saveSettings>[0] = {
        aiModelList: { ...settings.aiModelList, [id]: available },
      };
      if (!settings.aiModels[id]) {
        const pick = suggestModel(id, available);
        patch.aiModels = { ...settings.aiModels, [id]: pick };
        patch.aiFastModel = { ...settings.aiFastModel, [id]: pick };
      }
      setSettings(saveSettings(patch));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setBusy(null);
    }
  };

  const move = (id: ProviderId, delta: number): void => {
    const order = [...settings.aiOrder];
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const [moved] = order.splice(from, 1);
    if (moved) order.splice(to, 0, moved);
    setSettings(saveSettings({ aiOrder: order }));
  };

  return (
    <>
      <h2>Intelligence artificielle</h2>
      <p className="sub" style={{ marginBottom: 10 }}>
        Facultative. Sans clé, tout fonctionne : recherche plein texte, filtres, graphe et
        analytics. Une clé ajoute la recherche en langage naturel, les résumés de séance et
        les plans d’entraînement.
      </p>

      <p className="banner" style={{ marginBottom: 14 }}>
        <span>
          Les chiffres — taux de réussite, techniques oubliées, fréquence des erreurs — sont
          calculés en SQL et ne passent jamais par un modèle. Un modèle produirait un nombre
          vraisemblable ; on veut un nombre juste.
        </span>
      </p>

      {settings.aiOrder.map((id: ProviderId, index) => {
        const provider = PROVIDERS.find((p) => p.id === id);
        if (!provider) return null;
        const key = settings.aiKeys[id] ?? '';
        const available = models[id] ?? (settings.aiModels[id] ? [settings.aiModels[id] ?? ''] : []);

        return (
          <div className="card" key={id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ProviderMark id={id} size={20} />
              <b>{provider.label}</b>
              <span className="tag">{index + 1}ᵉ</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn sm"
                  disabled={index === 0}
                  onClick={() => move(id, -1)}
                  aria-label={`Monter ${provider.label}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn sm"
                  disabled={index === settings.aiOrder.length - 1}
                  onClick={() => move(id, 1)}
                  aria-label={`Descendre ${provider.label}`}
                >
                  ↓
                </button>
              </span>
            </div>

            <p className="sub" style={{ marginBottom: 8 }}>
              {provider.note}{' '}
              <a href={provider.keyUrl} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent)' }}>
                Obtenir une clé
              </a>
            </p>

            <div className="fields">
              <div>
                <label className="field-label" htmlFor={`key-${id}`}>
                  Clé API
                </label>
                <input
                  id={`key-${id}`}
                  type="password"
                  value={key}
                  autoComplete="off"
                  placeholder="collée depuis la console du fournisseur"
                  onChange={(e) =>
                    setSettings(
                      saveSettings({ aiKeys: { ...settings.aiKeys, [id]: e.target.value.trim() } }),
                    )
                  }
                />
              </div>

              {available.length > 0 && (
                <>
                  <div>
                    <label className="field-label" htmlFor={`model-${id}`}>
                      Modèle principal — résumés, plans
                    </label>
                    <select
                      id={`model-${id}`}
                      value={settings.aiModels[id] ?? ''}
                      onChange={(e) =>
                        setSettings(
                          saveSettings({
                            aiModels: { ...settings.aiModels, [id]: e.target.value },
                          }),
                        )
                      }
                    >
                      {available.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`fast-${id}`}>
                      Modèle rapide — traduction des questions en filtres
                    </label>
                    <select
                      id={`fast-${id}`}
                      value={settings.aiFastModel[id] ?? settings.aiModels[id] ?? ''}
                      onChange={(e) =>
                        setSettings(
                          saveSettings({
                            aiFastModel: { ...settings.aiFastModel, [id]: e.target.value },
                          }),
                        )
                      }
                    >
                      {available.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <div className="field-help">
                      Un petit modèle suffit : il ne rédige pas, il produit un filtre JSON court.
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                disabled={!key || busy !== null}
                onClick={() => void check(id)}
              >
                {busy === id ? 'Vérification…' : 'Vérifier la clé et lister les modèles'}
              </button>
            </div>

            {errors[id] && (
              <p className="banner warn" style={{ marginTop: 10 }}>
                <span>{errors[id]}</span>
              </p>
            )}
          </div>
        );
      })}

      <p className="sub">
        {configured.length === 0
          ? 'Aucun fournisseur configuré — les fonctions génératives sont désactivées.'
          : `${configured.length} fournisseur(s) prêts. En cas de quota atteint, Combat OS passe automatiquement au suivant dans l’ordre ci-dessus.`}
      </p>
    </>
  );
}
