/**
 * Le corpus : quels packs sont installés, lesquels cadrent l'analyse.
 *
 * Deux gestes distincts, et les confondre ferait perdre du temps :
 *
 *   · **Installer** un pack le découpe et l'indexe en plein texte. Gratuit,
 *     hors-ligne, instantané.
 *   · **Vectoriser** un pack ajoute la recherche par similarité de sens. Cela
 *     consomme le quota gratuit de l'utilisateur, donc cela se demande —
 *     jamais automatiquement.
 *
 * Le « mixte » n'est pas un pack : c'est l'absence de filtre. Ne rien
 * sélectionner, c'est chercher dans tout ce qui est installé, ce qui est le bon
 * réglage quand la question ne porte pas sur une discipline en particulier.
 */
import { useState, type ReactNode } from 'react';
import { canEmbed, providerDef, type ProviderId } from '../../ai/providers';
import { usableProviders } from '../../ai/router';
import { loadPack, PACKS } from '../../rag/packs';
import { embedDoc, installDoc, listDocs, removeDoc } from '../../rag/store';
import { loadSettings } from '../../settings';
import { useDb } from '../DbProvider';
import { Icon } from '../icons';
import { Status } from '../common';

interface Props {
  selected: readonly string[];
  onSelect: (slugs: string[]) => void;
  onClose: () => void;
}

export function CorpusPanel({ selected, onSelect, onClose }: Props): ReactNode {
  const { db, write, flush, revision } = useDb();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ slug: string; done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const settings = loadSettings();
  const docs = listDocs(db);
  void revision;

  const embedder: ProviderId | undefined = usableProviders(settings).find(
    (id) => canEmbed(id) && settings.aiKeys[id],
  );

  const install = async (slug: string): Promise<void> => {
    setBusy(slug);
    setError(null);
    try {
      const def = PACKS.find((p) => p.slug === slug);
      if (!def) throw new Error(`pack inconnu : ${slug}`);
      const markdown = await loadPack(slug);
      write((d) =>
        installDoc(
          d,
          { source: 'pack', slug, title: def.title, discipline: def.discipline },
          markdown,
        ),
      );
      await flush();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (slug: string): Promise<void> => {
    write((d) => removeDoc(d, slug));
    onSelect([...selected].filter((s) => s !== slug));
    await flush();
  };

  const vectorise = async (slug: string): Promise<void> => {
    if (!embedder) return;
    setBusy(slug);
    setError(null);
    try {
      await embedDoc(db, slug, embedder, settings.aiKeys[embedder] ?? '', {
        onProgress: (done, total) => setProgress({ slug, done, total }),
      });
      await flush();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    setBusy('import');
    setError(null);
    try {
      const markdown = await file.text();
      const slug = `import-${file.name.replace(/\.mdx?$/i, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      write((d) =>
        installDoc(d, { source: 'import', slug, title: file.name.replace(/\.mdx?$/i, '') }, markdown),
      );
      await flush();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (slug: string): void =>
    onSelect(
      selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug],
    );

  const imported = docs.filter((d) => d.source === 'import');

  return (
    <div className="cmdk-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk corpus" role="dialog" aria-modal="true" aria-label="Packs de connaissances">
        <header className="corpus-head">
          <b>Focaliser l’analyse</b>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="cmdk-list">
          <button
            type="button"
            className={`corpus-row${selected.length === 0 ? ' on' : ''}`}
            onClick={() => onSelect([])}
          >
            <Icon name="graph" size={15} />
            <span className="grow">
              <b>Mixte — tous arts martiaux</b>
              <span className="sub">
                Aucun filtre : LUIS cherche dans tous les packs installés et dans tes fiches.
              </span>
            </span>
            {selected.length === 0 && <Icon name="check" size={15} />}
          </button>

          <div className="cmdk-group">Packs</div>

          {PACKS.map((pack) => {
            const doc = docs.find((d) => d.slug === pack.slug);
            const on = selected.includes(pack.slug);
            const working = busy === pack.slug;

            return (
              <div key={pack.slug} className={`corpus-row${on ? ' on' : ''}`}>
                <Icon name={pack.discipline ? 'technique' : 'principle'} size={15} />

                <button
                  type="button"
                  className="grow"
                  disabled={!doc}
                  onClick={() => doc && toggle(pack.slug)}
                  style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }}
                >
                  <b>{pack.title}</b>
                  <span className="sub">{pack.summary}</span>
                  {doc && (
                    <span className="sub" style={{ marginTop: 3 }}>
                      {doc.chunks} passage{doc.chunks > 1 ? 's' : ''}
                      {doc.embedded > 0 && ` · ${doc.embedded} vectorisé${doc.embedded > 1 ? 's' : ''}`}
                    </span>
                  )}
                  {progress?.slug === pack.slug && (
                    <span className="sub">
                      Vectorisation {progress.done}/{progress.total}
                    </span>
                  )}
                </button>

                <span className="corpus-actions">
                  {!doc ? (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={working}
                      onClick={() => void install(pack.slug)}
                    >
                      {working ? '…' : 'Installer'}
                    </button>
                  ) : (
                    <>
                      {embedder && doc.embedded < doc.chunks && (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={working}
                          title={`Vectoriser avec ${providerDef(embedder).label}`}
                          onClick={() => void vectorise(pack.slug)}
                        >
                          {working ? '…' : 'Vectoriser'}
                        </button>
                      )}
                      {doc.embedded >= doc.chunks && doc.chunks > 0 && (
                        <Status level="good">vectorisé</Status>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Désinstaller ${pack.title}`}
                        onClick={() => void remove(pack.slug)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </>
                  )}
                </span>
              </div>
            );
          })}

          {imported.length > 0 && (
            <>
              <div className="cmdk-group">Tes documents</div>
              {imported.map((doc) => (
                <div
                  key={doc.slug}
                  className={`corpus-row${selected.includes(doc.slug) ? ' on' : ''}`}
                >
                  <Icon name="file" size={15} />
                  <button
                    type="button"
                    className="grow"
                    onClick={() => toggle(doc.slug)}
                    style={{ background: 'none', border: 'none', textAlign: 'left', padding: 0 }}
                  >
                    <b>{doc.title}</b>
                    <span className="sub">
                      {doc.chunks} passage{doc.chunks > 1 ? 's' : ''}
                      {doc.embedded > 0 && ` · ${doc.embedded} vectorisé(s)`}
                    </span>
                  </button>
                  <span className="corpus-actions">
                    {embedder && doc.embedded < doc.chunks && (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busy === doc.slug}
                        onClick={() => void vectorise(doc.slug)}
                      >
                        {busy === doc.slug ? '…' : 'Vectoriser'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Supprimer ${doc.title}`}
                      onClick={() => void remove(doc.slug)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <footer className="corpus-foot">
          <label className="btn sm">
            <Icon name="plus" size={13} />
            Importer un .md
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = '';
              }}
            />
          </label>

          <span className="sub">
            {embedder
              ? `Vectorisation par ${providerDef(embedder).label}.`
              : 'Recherche plein texte seule — ni Groq ni une base sans clé ne vectorisent.'}
          </span>
        </footer>

        {error && (
          <p className="banner bad" style={{ margin: 10 }}>
            <Icon name="bad" size={14} />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
