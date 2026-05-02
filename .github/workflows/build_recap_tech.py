"""Build RECAP_TECHNIQUE.pdf - interview tech cheatsheet."""
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable,
                                KeepTogether, PageTemplate, Paragraph,
                                Spacer)

NAVY = HexColor("#1B3F8B")
INK = HexColor("#1F1F1F")
GREY = HexColor("#666B72")
LINE = HexColor("#C9CDD3")
S = getSampleStyleSheet()


def st(name, font="Times-Roman", size=10, lead=13, color=INK, align=0,
       spb=0, spa=0, indent=0):
    return ParagraphStyle(name, parent=S["Normal"], fontName=font,
                          fontSize=size, leading=lead, textColor=color,
                          alignment=align, spaceBefore=spb, spaceAfter=spa,
                          leftIndent=indent)


TITLE = st("title", "Times-Bold", 22, 26, NAVY, TA_CENTER, spa=2)
SUBTITLE = st("subtitle", "Times-Italic", 12, 14, GREY, TA_CENTER, spa=18)
H1 = st("h1", "Times-Bold", 13, 16, NAVY, spb=12, spa=4)
H2 = st("h2", "Times-Bold", 10.5, 13, NAVY, spb=6, spa=2)
BODY = st("body", "Times-Roman", 9.5, 12.5, INK, TA_JUSTIFY, spa=3)
BULLET = st("bul", "Times-Roman", 9.5, 12.5, INK, spa=1, indent=14)
SUBBULLET = st("sub", "Times-Roman", 9.5, 12.5, INK, spa=1, indent=28)


def head(label):
    return [Paragraph(label.upper(), H1),
            HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4)]


def bullet(text):
    return Paragraph("&bull;&nbsp; " + text, BULLET)


def sub_bullet(text):
    return Paragraph("&ndash;&nbsp; " + text, SUBBULLET)


def topic(name, items):
    elems = [Paragraph(name, H2)]
    for kind, text in items:
        if kind == "b":
            elems.append(bullet(text))
        elif kind == "s":
            elems.append(sub_bullet(text))
        elif kind == "p":
            elems.append(Paragraph(text, BODY))
    return KeepTogether(elems)


def build():
    doc = BaseDocTemplate("RECAP_TECHNIQUE.pdf",
                          pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=15 * mm, bottomMargin=15 * mm,
                          title="Recap technique - Theo Manso Pinto",
                          author="Theo Manso Pinto")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f])])

    s = []
    s.append(Paragraph("Récap technique", TITLE))
    s.append(Paragraph("Antisèche entretiens — Théo Manso Pinto", SUBTITLE))
    s.append(Paragraph(
        "Pour chaque techno citée sur le CV : <b>définition courte</b>, "
        "<b>ce que tu sais en faire concrètement</b>, <b>questions piège "
        "fréquentes en entretien</b> et <b>comment y répondre proprement</b> "
        "sans se faire prendre.", BODY))

    s += head("IA & Agents")
    s.append(topic("RAG (Retrieval-Augmented Generation)", [
        ("b", "<b>Quoi</b> : technique qui complète un LLM avec des documents externes récupérés à la volée (vector search) pour éviter les hallucinations."),
        ("b", "<b>Ton usage</b> : intégré dans EPTA5 pour la gestion de news financières."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Comment tu chunk les documents ?\" &rarr; taille (200-500 tokens), overlap (10-20 %), stratégie sémantique vs fixe."),
        ("s", "\"Quelle base vectorielle ?\" &rarr; ton choix réel + alternatives (pgvector, Qdrant, Weaviate, Pinecone)."),
        ("s", "\"Comment tu mesures la qualité du retrieval ?\" &rarr; recall@k, precision@k, MRR, hit-rate.")]))
    s.append(topic("BYOK (Bring Your Own Key)", [
        ("b", "<b>Quoi</b> : pattern où le client utilise sa propre clé API LLM (OpenAI, Anthropic, etc.) au lieu de celle hébergée par le fournisseur SaaS."),
        ("b", "<b>Ton usage</b> : implémenté dans EPTA5 pour que les clients B2B contrôlent leurs coûts et leur confidentialité."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Comment tu sécurises la clé côté serveur ?\" &rarr; AES-256-GCM, never log, rotation, scope limité."),
        ("s", "\"Avantage business ?\" &rarr; conformité (RGPD, données sensibles), prédictibilité coût client, audit trail.")]))
    s.append(topic("Multi-agents", [
        ("b", "<b>Quoi</b> : architecture où plusieurs agents LLM spécialisés collaborent (planner, executor, critic) au lieu d'un seul agent monolithique."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Frameworks utilisés ?\" &rarr; LangGraph, CrewAI, AutoGen, ou maison."),
        ("s", "\"Comment tu évites les boucles infinies ?\" &rarr; max steps, budget tokens, timeout, observability.")]))
    s.append(topic("HITL (Human-In-The-Loop)", [
        ("b", "<b>Quoi</b> : insertion d'un humain à des points critiques du workflow agent (validation, override, escalade)."),
        ("b", "<b>Pourquoi c'est crédibilisant</b> : montre que tu sais que les agents ne sont pas magiques et qu'il faut des garde-fous.")]))
    s.append(topic("Orchestration", [
        ("b", "<b>Quoi</b> : chef d'orchestre qui décide quel agent / outil appeler à quel moment selon le contexte."),
        ("b", "<b>Questions piège</b> : \"Sync vs async ?\" &rarr; async pour les longues tâches, sync pour les UX interactives.")]))
    s.append(topic("Tool use / Function calling", [
        ("b", "<b>Quoi</b> : capacité d'un LLM à appeler des fonctions externes (API, DB, calc) en émettant un JSON structuré."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Différence entre OpenAI tools et Anthropic tool_use ?\" &rarr; format JSON légèrement différent mais concept identique."),
        ("s", "\"Comment tu valides les arguments avant exécution ?\" &rarr; JSON schema, Pydantic, allowlist.")]))
    s.append(topic("Guardrails", [
        ("b", "<b>Quoi</b> : filtres en entrée et sortie d'un LLM (PII, prompt injection, toxicité, hors-sujet)."),
        ("b", "<b>Outils</b> : Guardrails AI, NeMo Guardrails, Lakera, ou prompts système.")]))
    s.append(topic("Evals", [
        ("b", "<b>Quoi</b> : tests automatisés de qualité d'un LLM / agent (golden dataset, LLM-as-judge, A/B test)."),
        ("b", "<b>Questions piège</b> : \"Comment tu détectes une régression ?\" &rarr; baseline + CI sur dataset figé + alerte si drift.")]))
    s.append(topic("Observability", [
        ("b", "<b>Quoi</b> : monitoring des appels LLM (latence, coût/token, hallucination rate, distribution des erreurs)."),
        ("b", "<b>Outils</b> : Langfuse, Helicone, LangSmith, Datadog LLM Observability.")]))
    s.append(topic("LLMOps", [
        ("b", "<b>Quoi</b> : DevOps appliqué aux LLM &mdash; versioning de prompts, déploiement, rollback, monitoring, eval continue.")]))

    s += head("Data & Analyse")
    s.append(topic("Python", [
        ("b", "<b>Niveau</b> : intermédiaire / avancé selon le sujet. Confortable sur les scripts ETL, les automatisations, le data wrangling."),
        ("b", "<b>Libs maîtrisées</b> : <i>requests, pandas, numpy, pydantic, httpx</i>."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Décorateurs ?\" &rarr; fonction qui prend une fonction et en retourne une nouvelle. Exemple : <i>@cache, @property</i>."),
        ("s", "\"Différence entre <i>is</i> et <i>==</i> ?\" &rarr; identité vs égalité.")]))
    s.append(topic("Power BI (Junior)", [
        ("b", "<b>Niveau honnête</b> : sais construire un dashboard multi-onglets, importer des sources, créer des visualisations basiques, exposer un rapport. Pas un expert tenant-level / RLS / déploiement gateway."),
        ("b", "<b>Ton usage</b> : Power BI Backtesting Engine personnel."),
        ("b", "<b>Question piège</b> : \"Comment tu fais un Row-Level Security ?\" &rarr; \"j'ai vu le concept, pas implémenté en prod, je sais que ça repose sur DAX <i>USERPRINCIPALNAME()</i> et roles\".")]))
    s.append(topic("DAX (Junior)", [
        ("b", "<b>Niveau honnête</b> : mesures simples (SUM, AVERAGE, CALCULATE filtré), time intelligence basique. Pas un expert sur les contextes d'évaluation imbriqués ou les variables avancées."),
        ("b", "<b>Question piège</b> : \"Différence entre CALCULATE et FILTER ?\" &rarr; CALCULATE modifie le contexte de filtre, FILTER retourne une table filtrée. Avoir un exemple simple sous le coude.")]))
    s.append(topic("SQL (Intermédiaire)", [
        ("b", "<b>Niveau</b> : à l'aise sur SELECT, JOIN, GROUP BY, sous-requêtes, CTE, fonctions de fenêtre. <b>Limites</b> : moins à l'aise sur les optimisations d'index complexes, les CTE récursives très profondes."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Différence entre INNER JOIN et LEFT JOIN ?\" &rarr; simple à expliquer."),
        ("s", "\"C'est quoi une window function ?\" &rarr; OVER (PARTITION BY ... ORDER BY ...), exemple : ROW_NUMBER, RANK, LAG.")]))
    s.append(topic("Looker Studio", [
        ("b", "<b>Quoi</b> : ex Google Data Studio, dashboard gratuit branché sur Sheets, BigQuery, etc."),
        ("b", "<b>Niveau</b> : sais faire un dashboard simple multi-sources.")]))
    s.append(topic("Bloomberg Terminal", [
        ("b", "<b>Quoi</b> : terminal payant des pros de la finance. Données marché temps réel, news, analytique."),
        ("b", "<b>Ton usage</b> : utilisé pour des analyses d'actifs et formations.")]))
    s.append(topic("Data cleaning / wrangling", [
        ("b", "<b>Quoi</b> : déduplication, gestion des nulls, normalisation des types, parsing de dates, détection d'outliers."),
        ("b", "<b>Question piège</b> : \"Comment tu gères les valeurs manquantes ?\" &rarr; drop, impute (moyenne, médiane, forward-fill), modèle prédictif. Dépend du contexte business.")]))

    s += head("Frontend & Dev")
    s.append(topic("HTML", [
        ("b", "<b>Quoi</b> : langage de balisage de base du web. Structure les pages."),
        ("b", "<b>Ton usage</b> : sites SeisSix Newsletter et Track Record dashboard déployés sur Netlify.")]))
    s.append(topic("React", [
        ("b", "<b>Quoi</b> : framework JS de Meta pour construire des UI à base de composants. État via hooks (<i>useState, useEffect</i>)."),
        ("b", "<b>Niveau</b> : as déjà construit des composants, sais lire / modifier du code React."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Différence entre props et state ?\" &rarr; props = passées du parent, state = interne au composant."),
        ("s", "\"C'est quoi un re-render ?\" &rarr; React re-évalue le composant quand state ou props changent.")]))
    s.append(topic("Angular", [
        ("b", "<b>Quoi</b> : framework JS de Google, plus opinionated que React (RxJS, TypeScript natif, services injectables)."),
        ("b", "<b>Niveau</b> : utilisé sur des projets, sais lire / modifier du code Angular."),
        ("b", "<b>Question piège</b> : \"Différence avec React ?\" &rarr; Angular = framework complet (router, forms, DI), React = lib UI à composer.")]))
    s.append(topic("JSX / TSX", [
        ("b", "<b>Quoi</b> : extension syntaxique JS qui permet d'écrire du HTML dans le code (<i>&lt;div&gt;...&lt;/div&gt;</i>). TSX = JSX en TypeScript."),
        ("b", "<b>Pourquoi le mentionner</b> : signale que tu maîtrises le typage en plus du framework.")]))
    s.append(topic("GitHub Actions / YAML", [
        ("b", "<b>Quoi</b> : CI / CD natif GitHub. Workflows déclarés en YAML dans <i>.github/workflows/</i>."),
        ("b", "<b>Ton usage</b> : 20+ pipelines automatisés sur EPTA5 (cron jobs ETL), build automatique de ton CV."),
        ("b", "<b>Questions piège</b> :"),
        ("s", "\"Différence entre push et pull_request triggers ?\" &rarr; push = sur la branche après merge, pull_request = avant merge."),
        ("s", "\"Secrets ?\" &rarr; stockés dans Settings &gt; Secrets, accédés via <i>${{ secrets.NAME }}</i>.")]))
    s.append(topic("Cloudflare Workers / D1", [
        ("b", "<b>Quoi</b> : Workers = compute serverless edge JS / TS qui tourne dans 300+ POPs. D1 = base SQLite distribuée par Cloudflare."),
        ("b", "<b>Ton usage</b> : architecture EPTA5 100 % edge."),
        ("b", "<b>Question piège</b> : \"Pourquoi pas AWS Lambda ?\" &rarr; latence edge plus faible, pricing fixe simple, pas de cold start, plus simple pour un projet solo.")]))
    s.append(topic("Drizzle ORM", [
        ("b", "<b>Quoi</b> : ORM TypeScript moderne, alternative légère à Prisma."),
        ("b", "<b>Pourquoi</b> : type-safe, syntaxe SQL-like, optimisé pour edge.")]))
    s.append(topic("Protobuf (Protocol Buffers)", [
        ("b", "<b>Quoi</b> : format de sérialisation binaire de Google, plus compact que JSON, schema-first."),
        ("b", "<b>Question piège</b> : \"Pourquoi Protobuf et pas JSON ?\" &rarr; taille, vitesse, schema versionné.")]))
    s.append(topic("VBA / C++", [
        ("b", "<b>Niveau</b> : notions, utilisés en formation initiale et sur projets étudiants.")]))

    s += head("Sécurité & conformité")
    s.append(topic("AES-256-GCM", [
        ("b", "<b>Quoi</b> : chiffrement symétrique authentifié. AES-256 pour la confidentialité, GCM pour l'intégrité."),
        ("b", "<b>Question piège</b> : \"Pourquoi GCM et pas CBC ?\" &rarr; GCM fournit l'authentification (AEAD), CBC nécessite un HMAC séparé.")]))
    s.append(topic("OTP (One-Time Password)", [
        ("b", "<b>Quoi</b> : code à usage unique pour 2FA. Souvent TOTP (basé sur le temps, RFC 6238) ou HOTP (basé sur compteur).")]))
    s.append(topic("CSRF (Cross-Site Request Forgery)", [
        ("b", "<b>Quoi</b> : attaque où un site malveillant force le navigateur de la victime à envoyer une requête authentifiée vers une autre app."),
        ("b", "<b>Mitigation</b> : tokens CSRF, SameSite cookies, vérif Origin / Referer.")]))
    s.append(topic("Cloudflare Turnstile", [
        ("b", "<b>Quoi</b> : alternative à reCAPTCHA, sans tracking, gratuite chez Cloudflare.")]))
    s.append(topic("Session rotation", [
        ("b", "<b>Quoi</b> : régénérer l'ID de session à des moments critiques (login, élévation de privilège) pour empêcher le session fixation.")]))
    s.append(topic("Rate limiting", [
        ("b", "<b>Quoi</b> : limiter le nombre de requêtes par IP / user / clé sur une fenêtre temporelle. Algorithmes : token bucket, sliding window.")]))
    s.append(topic("RGPD", [
        ("b", "<b>Quoi</b> : règlement européen sur la protection des données."),
        ("b", "<b>Concepts clés</b> : consentement, droit d'accès, droit à l'oubli, minimisation, DPO, DPIA, base légale.")]))

    s += head("Gestion projet & métier")
    s.append(topic("Cadrage / Roadmap / MVP", [
        ("b", "<b>MVP</b> = Minimum Viable Product, plus petite version qui valide une hypothèse."),
        ("b", "<b>Roadmap</b> = vision à 3-12 mois, pas un Gantt figé.")]))
    s.append(topic("Benchmarking fournisseurs / TCO", [
        ("b", "<b>TCO</b> = Total Cost of Ownership : coût licence + intégration + formation + maintenance + dépréciation."),
        ("b", "<b>Ton usage</b> : sélection des fournisseurs cloud, APIs, services pour EPTA5 en arbitrant qualité technique vs coût total.")]))
    s.append(topic("Salesforce", [
        ("b", "<b>Quoi</b> : CRM leader mondial."),
        ("b", "<b>Ton usage</b> : SereniLifeGroup pour la gestion clients courtage.")]))
    s.append(topic("Avaloq", [
        ("b", "<b>Quoi</b> : core banking platform suisse, utilisée par les banques privées."),
        ("b", "<b>Ton usage</b> : Caisse d'Épargne / formation banque.")]))
    s.append(topic("Finastra Fusion Invest", [
        ("b", "<b>Quoi</b> : plateforme de gestion d'investissements / portfolio management.")]))
    s.append(topic("Morningstar Direct", [
        ("b", "<b>Quoi</b> : terminal d'analyse de fonds et OPCVM."),
        ("b", "<b>Ton usage</b> : analyse OPCVM chez SereniLifeGroup.")]))

    s += head("Finance — détails techniques")
    s.append(topic("Produits structurés autocall", [
        ("b", "<b>Quoi</b> : produit obligataire avec coupon conditionnel et mécanisme de rappel anticipé si l'actif sous-jacent atteint un seuil à une date d'observation."),
        ("b", "<b>Variantes</b> : à barrière (knock-in / knock-out), à mémoire (coupon cumulé si manqué).")]))
    s.append(topic("Enveloppes (PEA, AV, PER)", [
        ("b", "<b>PEA</b> : Plan d'Épargne en Actions &mdash; exonération PV après 5 ans."),
        ("b", "<b>Assurance-Vie</b> : enveloppe capitalisante, fiscalité avantageuse après 8 ans + transmission hors succession."),
        ("b", "<b>PER</b> : Plan d'Épargne Retraite &mdash; déduction des versements du revenu imposable.")]))
    s.append(topic("CFA Level 1", [
        ("b", "10 sujets : Ethics, Quant, Economics, Financial Reporting, Corporate Issuers, Equity, Fixed Income, Derivatives, Alternative, Portfolio Mgmt."),
        ("b", "Lecture de référence : John Hull, <i>Options, Futures and Other Derivatives</i>.")]))
    s.append(topic("Méthodologies de risque (Investment-Insight)", [
        ("b", "<b>DCF</b> : Discounted Cash Flow &mdash; actualisation des flux futurs."),
        ("b", "<b>PEG</b> : Price / Earnings to Growth &mdash; PER ajusté de la croissance."),
        ("b", "<b>VaR</b> : Value at Risk &mdash; perte max attendue à un niveau de confiance."),
        ("b", "<b>Z-Score Altman</b> : score de probabilité de faillite.")]))

    s += head("Conseil de fin")
    s.append(Paragraph("Pour <b>chaque</b> ligne du CV, prépare :", BODY))
    for b in ["Un exemple concret (1 phrase, ton projet réel).",
              "Une question difficile + ta réponse honnête.",
              "Une zone où tu reconnais ne pas être expert &mdash; ne sur-vendre jamais."]:
        s.append(bullet(b))
    s.append(Spacer(1, 6))
    s.append(Paragraph(
        "<i>L'honnêteté technique en entretien est un signal fort. Mieux "
        "vaut dire \"je sais lire et modifier, pas coder from scratch en 2h\" "
        "que de bluffer et se faire griller sur un détail.</i>", BODY))

    doc.build(s)
    print("Recap technique PDF built")


if __name__ == "__main__":
    build()
