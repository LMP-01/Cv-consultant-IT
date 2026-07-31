/**
 * Per-fiche AI actions: summarise a bout, propose relations (§5.2).
 *
 * Suggestions are never applied automatically — they arrive as buttons you
 * press. A model guessing that K003 relates to S001 is a useful prompt for a
 * human; silently writing it into the graph would corrupt the one thing this
 * app is for.
 */
import { useState, type ReactNode } from 'react';
import { summariseBout, suggestRelations, type Suggestion } from '../../ai/tasks';
import { aiConfigured } from '../../ai/router';
import { link } from '../../domain/links';
import type { EntityRecord } from '../../db/queries';
import { loadSettings } from '../../settings';
import { useDb } from '../DbProvider';
import { Code } from '../common';
import { href } from '../router';

export function AiAssist({ record }: { record: EntityRecord }): ReactNode {
  const { db, write } = useDb();
  const settings = loadSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ text: string; via: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBout = record.type === 'sparring' || record.type === 'fight';

  if (!aiConfigured(settings)) {
    return (
      <>
        <h2>Assistance IA</h2>
        <p className="banner">
          <span>
            Aucun fournisseur configuré.{' '}
            <a href={href({ name: 'settings' })} style={{ color: 'var(--accent)' }}>
              Ajouter une clé
            </a>{' '}
            pour activer les résumés et les suggestions de liens. Tout le reste de la fiche
            fonctionne sans.
          </span>
        </p>
      </>
    );
  }

  const run = async (job: 'summary' | 'suggest'): Promise<void> => {
    setBusy(job);
    setError(null);
    try {
      if (job === 'summary') {
        const result = await summariseBout(db, settings, record);
        setSummary({ text: result.text, via: `${result.provider} · ${result.model}` });
      } else {
        const { suggestions: found } = await suggestRelations(db, settings, record);
        setSuggestions(found);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const accept = (suggestion: Suggestion): void => {
    write((d) => link(d, record.id, suggestion.record.id));
    setSuggestions((prev) => prev?.filter((s) => s.code !== suggestion.code) ?? null);
  };

  return (
    <>
      <h2>Assistance IA</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isBout && (
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void run('summary')}
          >
            {busy === 'summary' ? 'Analyse…' : 'Résumer cette séance'}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={busy !== null}
          onClick={() => void run('suggest')}
        >
          {busy === 'suggest' ? 'Recherche…' : 'Proposer des liens'}
        </button>
      </div>

      {error && (
        <p className="banner warn" style={{ marginTop: 12 }}>
          <span>{error}</span>
        </p>
      )}

      {summary && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="field-value">{summary.text}</div>
          <p className="sub" style={{ marginTop: 10 }}>
            Généré par {summary.via}. À relire — un modèle peut se tromper sur ce que tu as
            voulu dire. Rien n’a été écrit dans la fiche.
          </p>
        </div>
      )}

      {suggestions && (
        <div className="card" style={{ marginTop: 12 }}>
          {suggestions.length === 0 ? (
            <p className="sub">Aucune suggestion pertinente parmi les fiches existantes.</p>
          ) : (
            <>
              <p className="sub" style={{ marginBottom: 10 }}>
                Propositions à valider une par une — rien n’est ajouté automatiquement.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {suggestions.map((s) => (
                  <div
                    key={s.code}
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
                  >
                    <Code record={s.record} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{s.record.title}</b>
                      {s.why && <div className="sub">{s.why}</div>}
                    </span>
                    <button type="button" className="btn sm" onClick={() => accept(s)}>
                      Relier
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
