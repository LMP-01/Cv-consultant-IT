/**
 * Natural-language search (§5.1).
 *
 * The model never queries the database. It turns the question into a filter,
 * the filter is validated, and SQL executes it — so the panel can show exactly
 * what was run. If the translation is wrong you can see that it is wrong,
 * which is not true of a black box that returns rows.
 */
import { useState, type ReactNode } from 'react';
import { describeSpec, isEmptySpec } from '../ai/filterSpec';
import { AllProvidersFailed, NoProviderConfigured, aiConfigured } from '../ai/router';
import { translateQuery, type TranslatedQuery } from '../ai/tasks';
import { loadSettings } from '../settings';
import { useDb } from './DbProvider';
import { EntityRow } from './common';
import { href } from './router';

export function AskPanel(): ReactNode {
  const { db } = useDb();
  const settings = loadSettings();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<TranslatedQuery | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured(settings)) {
    return (
      <p className="banner" style={{ marginTop: 12 }}>
        <span>
          La recherche en langage naturel demande une clé IA.{' '}
          <a href={href({ name: 'settings' })} style={{ color: 'var(--accent)' }}>
            Configurer un fournisseur
          </a>{' '}
          — Gemini, Groq et Mistral ont tous un palier gratuit. La recherche par texte et
          par filtres ci-dessous fonctionne sans.
        </span>
      </p>
    );
  }

  const ask = async (): Promise<void> => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await translateQuery(db, settings, question.trim()));
    } catch (err) {
      if (err instanceof NoProviderConfigured) setError('Aucune clé IA configurée.');
      else if (err instanceof AllProvidersFailed) setError(err.message);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="field-label">Question en langage naturel</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={question}
          placeholder="Tous les contres utilisant un mae geri contre un adversaire qui avance"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void ask();
          }}
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? '…' : 'Demander'}
        </button>
      </div>

      {error && (
        <p className="banner warn" style={{ marginTop: 10 }}>
          <span>{error}</span>
        </p>
      )}

      {answer && (
        <>
          <p className="sub" style={{ marginTop: 12 }}>
            Filtre appliqué : <b>{describeSpec(answer.spec)}</b> — traduit par {answer.provider} (
            {answer.model}).
            {answer.fallbacks.length > 0 &&
              ` Fournisseurs ignorés : ${answer.fallbacks
                .map((f) => `${f.provider} (${f.reason})`)
                .join(', ')}.`}
          </p>

          {isEmptySpec(answer.spec) && (
            <p className="banner warn" style={{ marginTop: 8 }}>
              <span>
                Le modèle n’a extrait aucun critère exploitable ; tout est affiché. Reformule
                en nommant un module (« contres », « situations ») ou un identifiant.
              </span>
            </p>
          )}

          <p className="sub" style={{ marginTop: 10 }}>
            {answer.results.length} résultat{answer.results.length > 1 ? 's' : ''}
          </p>
          {answer.results.length > 0 && (
            <div className="rows" style={{ marginTop: 6 }}>
              {answer.results.slice(0, 50).map((r) => (
                <EntityRow key={r.id} record={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
