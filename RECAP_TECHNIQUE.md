# Récap technique — antisèche entretiens

Pour chaque techno citée sur le CV : **définition courte**, **ce que tu sais en
faire concrètement**, **questions piège fréquentes en entretien** et **comment
y répondre proprement** sans se faire prendre.

---

## IA & Agents

### RAG (Retrieval-Augmented Generation)
- **Quoi** : technique qui complète un LLM avec des documents externes
  récupérés à la volée (vector search) pour éviter les hallucinations.
- **Ton usage** : intégré dans EPTA5 pour la gestion de news financières.
- **Questions piège**
  - "Comment tu chunk les documents ?" → taille (200-500 tokens),
    overlap (10-20%), stratégie sémantique vs fixe.
  - "Quelle base vectorielle ?" → réponds par ton choix réel + alternatives
    (pgvector, Qdrant, Weaviate, Pinecone).
  - "Comment tu mesures la qualité du retrieval ?" → recall@k, precision@k,
    MRR, hit-rate.

### BYOK (Bring Your Own Key)
- **Quoi** : pattern où le client utilise sa propre clé API LLM (OpenAI,
  Anthropic, etc.) au lieu d'utiliser celle hébergée par le fournisseur SaaS.
- **Ton usage** : implémenté dans EPTA5 pour que les clients B2B contrôlent
  leurs coûts et leur confidentialité.
- **Questions piège**
  - "Comment tu sécurises la clé côté serveur ?" → AES-256-GCM, never log,
    rotation, scope limité.
  - "Avantage business ?" → conformité (RGPD, données sensibles), prédictibilité
    coût client, audit trail.

### Multi-agents
- **Quoi** : architecture où plusieurs agents LLM spécialisés collaborent
  (planner, executor, critic) au lieu d'un seul agent monolithique.
- **Questions piège**
  - "Frameworks utilisés ?" → LangGraph, CrewAI, AutoGen, ou maison.
  - "Comment tu évites les boucles infinies ?" → max steps, budget tokens,
    timeout, observability.

### HITL (Human-In-The-Loop)
- **Quoi** : insertion d'un humain à des points critiques du workflow agent
  (validation, override, escalade).
- **Pourquoi c'est crédibilisant** : montre que tu sais que les agents ne
  sont pas magiques et qu'il faut des garde-fous.

### Orchestration
- **Quoi** : chef d'orchestre qui décide quel agent / outil appeler à quel
  moment selon le contexte.
- **Questions piège**
  - "Sync vs async ?" → async pour les longues tâches, sync pour les UX
    interactives.

### Tool use / Function calling
- **Quoi** : capacité d'un LLM à appeler des fonctions externes (API, DB,
  calc) en émettant un JSON structuré.
- **Questions piège**
  - "Différence entre OpenAI tools et Anthropic tool_use ?" → format JSON
    légèrement différent mais concept identique.
  - "Comment tu valides les arguments avant exécution ?" → JSON schema,
    Pydantic, allowlist.

### Guardrails
- **Quoi** : filtres en entrée et sortie d'un LLM (PII, prompt injection,
  toxicité, hors-sujet).
- **Outils** : Guardrails AI, NeMo Guardrails, Lakera, ou prompts système.

### Evals
- **Quoi** : tests automatisés de qualité d'un LLM/agent (golden dataset,
  LLM-as-judge, A/B test).
- **Questions piège**
  - "Comment tu détectes une régression ?" → baseline + CI sur dataset
    figé + alerte si drift.

### Observability
- **Quoi** : monitoring des appels LLM (latence, coût/token, hallucination
  rate, distribution des erreurs).
- **Outils** : Langfuse, Helicone, LangSmith, Datadog LLM Observability.

### LLMOps
- **Quoi** : DevOps appliqué aux LLM — versioning de prompts, déploiement,
  rollback, monitoring, eval continue.

---

## Data & Analyse

### Python
- **Niveau** : intermédiaire / avancé selon le sujet. Confortable sur les
  scripts ETL, les automatisations, le data wrangling.
- **Libs maîtrisées** : `requests`, `pandas`, `numpy`, `pydantic`, `httpx`.
- **Questions piège**
  - "Décorateurs ?" → fonction qui prend une fonction et en retourne une
    nouvelle. Exemple : `@cache`, `@property`.
  - "Différence entre `is` et `==` ?" → identité vs égalité.

### Power BI (Junior)
- **Niveau honnête** : sais construire un dashboard multi-onglets,
  importer des sources, créer des visualisations basiques, exposer un
  rapport. **Pas** un expert tenant-level / RLS / déploiement gateway.
- **Ton usage** : Power BI Backtesting Engine personnel.
- **Question piège** : "Comment tu fais un Row-Level Security ?" → tu peux
  dire "j'ai vu le concept, pas implémenté en prod, je sais que ça repose
  sur DAX `USERPRINCIPALNAME()` et roles".

### DAX (Junior)
- **Niveau honnête** : mesures simples (SUM, AVERAGE, CALCULATE filtré),
  time intelligence basique. **Pas** un expert sur les contextes
  d'évaluation imbriqués ou les variables avancées.
- **Question piège** : "Différence entre `CALCULATE` et `FILTER` ?" →
  CALCULATE modifie le contexte de filtre, FILTER retourne une table
  filtrée. Avoir un exemple simple sous le coude.

### SQL (Intermédiaire)
- **Niveau** : à l'aise sur SELECT, JOIN, GROUP BY, sous-requêtes, CTE,
  fonctions de fenêtre. **Limites** : moins à l'aise sur les optimisations
  d'index complexes, les CTE récursives très profondes.
- **Questions piège**
  - "Différence entre INNER JOIN et LEFT JOIN ?" → simple à expliquer.
  - "C'est quoi une window function ?" → `OVER (PARTITION BY ... ORDER BY ...)`,
    exemple : ROW_NUMBER, RANK, LAG.

### Looker Studio
- **Quoi** : ex Google Data Studio, dashboard gratuit branché sur Sheets,
  BigQuery, etc.
- **Niveau** : sais faire un dashboard simple multi-sources.

### Bloomberg Terminal
- **Quoi** : terminal payant des pros de la finance. Données marché temps
  réel, news, analytique.
- **Ton usage** : utilisé pour des analyses d'actifs et formations.

### ETL / ELT
- **Quoi** : Extract-Transform-Load (ou Extract-Load-Transform si on
  charge brut puis on transforme dans la DWH).
- **Ton usage** : pipelines Python EPTA5 — extraction d'APIs externes,
  nettoyage, chargement dans D1/Cloudflare.

### Data cleaning / wrangling
- **Quoi** : déduplication, gestion des nulls, normalisation des types,
  parsing de dates, détection d'outliers.
- **Question piège** : "Comment tu gères les valeurs manquantes ?" → drop,
  impute (moyenne, médiane, forward-fill), modèle prédictif. Dépend du
  contexte business.

---

## Frontend & Dev

### React
- **Quoi** : framework JS de Meta pour construire des UI à base de
  composants. État via hooks (`useState`, `useEffect`).
- **Niveau** : as déjà construit des composants, sais lire/modifier du
  code React.
- **Questions piège**
  - "Différence entre props et state ?" → props = passées du parent,
    state = interne au composant.
  - "C'est quoi un re-render ?" → React re-évalue le composant quand
    state ou props changent.

### Angular
- **Quoi** : framework JS de Google, plus opinionated que React (RxJS,
  TypeScript natif, services injectables).
- **Niveau** : utilisé sur des projets, sais lire/modifier du code Angular.
- **Question piège** : "Différence avec React ?" → Angular = framework
  complet (router, forms, DI), React = lib UI à composer.

### JSX / TSX
- **Quoi** : extension syntaxique JS qui permet d'écrire du HTML dans le
  code (`<div>...</div>`). TSX = JSX en TypeScript.
- **Pourquoi le mentionner** : signale que tu maîtrises le typage en plus
  du framework.

### GitHub Actions / YAML
- **Quoi** : CI/CD natif GitHub. Workflows déclarés en YAML dans
  `.github/workflows/`.
- **Ton usage** : 20+ pipelines automatisés sur EPTA5 (cron jobs ETL),
  build automatique de ton CV.
- **Questions piège**
  - "Différence entre push et pull_request triggers ?" → push = sur la
    branche après merge, pull_request = avant merge.
  - "Secrets ?" → stockés dans Settings > Secrets, accédés via
    `${{ secrets.NAME }}`.

### Cloudflare Workers / D1
- **Quoi** : Workers = compute serverless edge JS/TS qui tourne dans 300+
  POPs. D1 = base SQLite distribuée par Cloudflare.
- **Ton usage** : architecture EPTA5 100% edge.
- **Question piège** : "Pourquoi pas AWS Lambda ?" → latence edge plus
  faible, pricing fixe simple, pas de cold start, plus simple pour un
  projet solo.

### Drizzle ORM
- **Quoi** : ORM TypeScript moderne, alternative légère à Prisma.
- **Pourquoi** : type-safe, syntaxe SQL-like, optimisé pour edge.

### Protobuf (Protocol Buffers)
- **Quoi** : format de sérialisation binaire de Google, plus compact que
  JSON, schema-first.
- **Question piège** : "Pourquoi Protobuf et pas JSON ?" → taille,
  vitesse, schema versionné.

### VBA / C++
- **Niveau** : notions, utilisés en formation initiale et sur projets
  étudiants.

---

## Sécurité & conformité

### AES-256-GCM
- **Quoi** : chiffrement symétrique authentifié. AES-256 pour la
  confidentialité, GCM pour l'intégrité.
- **Question piège** : "Pourquoi GCM et pas CBC ?" → GCM fournit
  l'authentification (AEAD), CBC nécessite un HMAC séparé.

### OTP (One-Time Password)
- **Quoi** : code à usage unique pour 2FA. Souvent TOTP (basé sur le
  temps, RFC 6238) ou HOTP (basé sur compteur).

### CSRF (Cross-Site Request Forgery)
- **Quoi** : attaque où un site malveillant force le navigateur de la
  victime à envoyer une requête authentifiée vers une autre app.
- **Mitigation** : tokens CSRF, SameSite cookies, vérif Origin/Referer.

### Cloudflare Turnstile
- **Quoi** : alternative à reCAPTCHA, sans tracking, gratuite chez
  Cloudflare.

### Session rotation
- **Quoi** : régénérer l'ID de session à des moments critiques (login,
  élévation de privilège) pour empêcher le session fixation.

### Rate limiting
- **Quoi** : limiter le nombre de requêtes par IP/user/clé sur une
  fenêtre temporelle. Algorithmes : token bucket, sliding window.

### RGPD
- **Quoi** : règlement européen sur la protection des données.
- **Concepts clés** : consentement, droit d'accès, droit à l'oubli,
  minimisation, DPO, DPIA, base légale.

---

## Gestion projet & métier

### Cadrage / Roadmap / MVP
- **MVP** = Minimum Viable Product, plus petite version qui valide une
  hypothèse.
- **Roadmap** = vision à 3-12 mois, pas un Gantt figé.

### Benchmarking fournisseurs / TCO
- **TCO** = Total Cost of Ownership : coût licence + intégration +
  formation + maintenance + dépréciation.
- **Ton usage** : sélection des fournisseurs cloud, APIs, services pour
  EPTA5 en arbitrant qualité technique vs coût total.

### Salesforce
- **Quoi** : CRM leader mondial.
- **Ton usage** : SereniLifeGroup pour la gestion clients courtage.

### Avaloq
- **Quoi** : core banking platform suisse, utilisée par les banques privées.
- **Ton usage** : Caisse d'Épargne / formation banque.

### Finastra Fusion Invest
- **Quoi** : plateforme de gestion d'investissements / portfolio
  management.

### Morningstar Direct
- **Quoi** : terminal d'analyse de fonds et OPCVM.
- **Ton usage** : analyse OPCVM chez SereniLifeGroup.

---

## Finance — détails techniques

### Produits structurés autocall
- **Quoi** : produit obligataire avec coupon conditionnel et mécanisme de
  rappel anticipé si l'actif sous-jacent atteint un seuil à une date
  d'observation.
- **Variantes** : à barrière (knock-in/knock-out), à mémoire (coupon
  cumulé si manqué).

### Enveloppes (PEA, AV, PER)
- **PEA** : Plan d'Épargne en Actions — exonération PV après 5 ans.
- **Assurance-Vie** : enveloppe capitalisante, fiscalité avantageuse
  après 8 ans + transmission hors succession.
- **PER** : Plan d'Épargne Retraite — déduction des versements du revenu
  imposable.

### CFA Level 1
- 10 sujets : Ethics, Quant, Economics, Financial Reporting, Corporate
  Issuers, Equity, Fixed Income, Derivatives, Alternative, Portfolio Mgmt.
- Lecture de référence : John Hull, *Options, Futures and Other
  Derivatives*.

### Méthodologies de risque (Investment-Insight)
- **DCF** : Discounted Cash Flow — actualisation des flux futurs.
- **PEG** : Price/Earnings to Growth — PER ajusté de la croissance.
- **VaR** : Value at Risk — perte max attendue à un niveau de confiance.
- **Z-Score Altman** : score de probabilité de faillite.

---

## Conseil de fin

Pour **chaque** ligne du CV, prépare :
1. Un exemple concret (1 phrase, ton projet réel).
2. Une question difficile + ta réponse honnête.
3. Une zone où tu reconnais ne pas être expert — ne sur-vendre jamais.

L'honnêteté technique en entretien est un signal fort. Mieux vaut dire
"je sais lire et modifier, pas coder from scratch en 2h" que de bluffer
et se faire griller sur un détail.
