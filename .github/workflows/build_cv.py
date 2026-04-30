"""ATS CV builder - FR - Théo Manso Pinto - Assistant Chef de Projet IA."""
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable,
                                KeepTogether, PageTemplate, Paragraph,
                                Table, TableStyle)

NAVY = HexColor("#1B3F8B")
INK = HexColor("#1F1F1F")
GREY = HexColor("#666B72")
LINE = HexColor("#C9CDD3")
S = getSampleStyleSheet()


def st(name, font="Times-Roman", size=10, lead=13, color=INK, align=0,
       indent=0, spb=0, spa=0):
    return ParagraphStyle(name, parent=S["Normal"], fontName=font,
                          fontSize=size, leading=lead, textColor=color,
                          alignment=align, leftIndent=indent, spaceBefore=spb,
                          spaceAfter=spa)


NAME = st("name", "Times-Bold", 20, 22, NAVY, TA_CENTER, spa=1)
ROLE = st("role", "Times-Italic", 11, 13, GREY, TA_CENTER, spa=2)
CONTACT = st("ct", "Times-Roman", 8.8, 11, INK, TA_CENTER, spa=6)
SECTION = st("sec", "Times-Bold", 9.5, 11, NAVY, spb=5, spa=2)
BODY = st("bd", "Times-Roman", 9.5, 12, INK, TA_JUSTIFY, spa=2)
BULLET = st("bu", "Times-Roman", 9.3, 11.5, INK, indent=10, spa=1)
TITLE = st("ti", "Times-Bold", 10, 12, INK, spa=1)
DATE = st("dt", "Times-Italic", 9, 11, GREY)
LBL = st("lb", "Times-Roman", 9.3, 11.5, GREY)
VAL = st("vl", "Times-Roman", 9.3, 11.5, INK)


def head(label):
    return [Paragraph(label.upper(), SECTION),
            HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4)]


def dated(date, title, bullets, meta=None):
    th = f'<b>{title}</b>'
    if meta:
        th += f'<br/><i><font color="#666B72">{meta}</font></i>'
    right = [Paragraph(th, TITLE)]
    for b in bullets:
        right.append(Paragraph("&bull; " + b, BULLET))
    t = Table([[Paragraph(date, DATE), right]], colWidths=[32 * mm, None])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return KeepTogether(t)


def kvtable(rows, widths):
    data = [[Paragraph(a, LBL) if isinstance(a, str) else a,
             Paragraph(b, VAL) if isinstance(b, str) else b] for a, b in rows]
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    return t


def link(url, text=None):
    txt = text or url
    return f'<a href="{url}"><font color="#1B3F8B"><u>{txt}</u></font></a>'


def build():
    doc = BaseDocTemplate("CV_Theo_Manso_Pinto_FR.pdf",
                          pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                          topMargin=12 * mm, bottomMargin=12 * mm,
                          title="CV - Théo Manso Pinto - Assistant Chef de Projet IA",
                          author="Théo Manso Pinto")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f])])
    s = []

    s.append(Paragraph("Théo Manso Pinto", NAME))
    s.append(Paragraph(
        "Assistant Chef de Projet IA &middot; Data &middot; Agents IA &middot; "
        "Conception de projet", ROLE))
    s.append(Paragraph(
        "Île-de-France &middot; mobilité France & international &middot; "
        "régie ou forfait", CONTACT))
    contact = (
        '+33 6 30 80 85 75 &nbsp;&bull;&nbsp; '
        + link("mailto:theo.mansopro@gmail.com", "theo.mansopro@gmail.com")
        + ' &nbsp;&bull;&nbsp; '
        + link("<https://www.linkedin.com/in/théo-manso-pinto>",
               "<linkedin.com/in/théo-manso-pinto>")
        + ' &nbsp;&bull;&nbsp; '
        + link("<https://www.epta5.com>", "<www.epta5.com>")
        + ' &nbsp;&bull;&nbsp; '
        + link("<https://seissix-newsletter.netlify.app>",
               "seissix-newsletter.netlify.app")
        + ' &nbsp;&bull;&nbsp; '
        + link("<https://track-record-lem.netlify.app>",
               "track-record-lem.netlify.app"))
    s.append(Paragraph(contact, CONTACT))

    s += head("Profil")
    s.append(Paragraph(
        "<b>Assistant Chef de Projet IA &middot; Data Engineer &middot; "
        "AI Agents Engineer.</b> "
        "Profil hybride finance / tech, certifié AMF, capable de cadrer "
        "(PRD, roadmap, discovery), prototyper et livrer des projets IA "
        "agentiques de bout en bout — du besoin métier jusqu'à la mise en "
        "production. Fondateur d'EPTA5 Inc (SAS), plateforme data financière "
        "B2B type Bloomberg avec IA RAG, architecture Cloudflare edge et "
        "chiffrement AES-256-GCM &mdash; conçue, livrée et opérée en autonomie "
        "totale (rôle de chef de projet solo end-to-end). Je traduis les "
        "besoins métier (produits structurés, gestion de patrimoine, "
        "reporting réglementaire) en specs techniques actionnables et en "
        "agents IA (RAG, BYOK, HITL, multi-agents) &mdash; mobilisable en "
        "régie ou au forfait, en France et à l'international.", BODY))

    s += head("Missions cibles")
    for b in [
        "<b>Pilotage projet IA :</b> cadrage, PRD, roadmap, discovery, "
        "stakeholder management, OKR, MVP, animation d'ateliers métier "
        "&mdash; coordination delivery agile.",
        "<b>Conception d'agents IA :</b> architecture multi-agents, RAG, "
        "BYOK, HITL (human-in-the-loop), tool use, function calling, "
        "guardrails, evals, observabilité, mise en production.",
        "<b>Data Engineering :</b> ETL / ELT Python, automatisation GitHub "
        "Actions (20+ pipelines), modèles de données, dashboards Power BI / "
        "Looker.",
        "<b>Bridge métier &harr; tech :</b> traduction besoin métier &rarr; "
        "spec, vulgarisation IA auprès de directions financières, "
        "conformité RGPD &amp; sécurité (AES-256-GCM, OTP, CSRF)."]:
        s.append(Paragraph("&bull; " + b, BULLET))

    s += head("Compétences")
    s.append(kvtable([
        ("IA &amp; Agents",
         "<b>RAG</b> &middot; <b>BYOK</b> &middot; <b>multi-agents</b> "
         "&middot; HITL &middot; orchestration &middot; tool use &middot; "
         "function calling &middot; guardrails &middot; evals &middot; "
         "observabilité &middot; LLMOps"),
        ("Data &amp; Analyse",
         "<b>Python</b> &middot; <b>Power BI (Expert)</b> &middot; "
         "<b>DAX (Expert)</b> &middot; SQL &middot; Looker Studio "
         "&middot; Bloomberg Terminal &middot; ETL / ELT &middot; "
         "<b>data cleaning</b> &middot; normalisation &middot; "
         "intégration d'APIs financières (FRED, FMI, TIINGO)"),
        ("Cloud &amp; Dev",
         "<b>GitHub Actions / YAML</b> &middot; Cloudflare Workers / D1 "
         "&middot; Drizzle ORM &middot; Protobuf &middot; VBA &middot; C++"),
        ("Sécurité &amp; conformité",
         "AES-256-GCM &middot; OTP / CSRF &middot; Cloudflare Turnstile "
         "&middot; rotation de sessions &middot; rate limiting &middot; "
         "conformité RGPD"),
        ("Gestion projet &amp; métier",
         "Cadrage / PRD &middot; roadmap &middot; discovery &middot; "
         "stakeholder management &middot; OKR &middot; MVP &middot; Agile "
         "&middot; <b>benchmarking fournisseurs</b> &middot; "
         "<b>arbitrage qualité / coût (TCO)</b> &middot; Salesforce "
         "&middot; Avaloq &middot; Finastra Fusion Invest &middot; "
         "Morningstar Direct"),
    ], [40 * mm, None]))

    s += head("Langues")
    langs = [("Français", "Langue maternelle"),
             ("Anglais", "C1 (Avancé) - EF SET 72/100"),
             ("Espagnol", "B1 (Intermédiaire) - Instituto Cervantes (AVE)"),
             ("Portugais", "Notions")]
    rows = []
    for i in range(0, len(langs), 2):
        l, r = langs[i], langs[i + 1]
        rows.append([Paragraph(f"<b>{l[0]}</b>", LBL), Paragraph(l[1], VAL),
                     "", Paragraph(f"<b>{r[0]}</b>", LBL),
                     Paragraph(r[1], VAL)])
    t = Table(rows, colWidths=[26 * mm, 55 * mm, 8 * mm, 26 * mm, None])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 1),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    s.append(t)

    s += head("Expérience professionnelle")
    s.append(dated(
        "07/2025 -<br/>présent<br/><i>(en poste)</i>",
        "Conseiller Financier - CDI &middot; Caisse d'Épargne &middot; "
        "Île-de-France",
        ["Conseille et vends des <b>produits structurés autocall complexes</b> "
         "(instruments à barrière, à mémoire) auprès d'une clientèle "
         "patrimoniale.",
         "Conçois des stratégies patrimoniales sur <b>3 enveloppes</b> "
         "(PEA, Assurance-Vie, PER) &mdash; optimisation fiscale clients."]))
    s.append(dated(
        "11/2024 -<br/>04/2025",
        "Conseiller Clientèle Bancaire &middot; Société Générale &middot; "
        "Saint-Maur (94)",
        ["Gère un portefeuille de clients <b>Premium et BPAT</b> &mdash; "
         "suivi proactif des besoins bancaires et patrimoniaux.",
         "Atteint <b>150 % des objectifs prévoyance</b> en 1 mois &mdash; "
         "<b>top vendeur de l'agence</b>."]))
    s.append(dated(
        "10/2023 -<br/>04/2024",
        "Assistant Mandataire en Courtage - Alternance BTS Banque "
        "&middot; SereniLifeGroup &middot; Clichy (92)",
        ["<b>Top vendeur</b> PER, assurance-vie et prévoyance : "
         "<b>50 K&euro; de CA brut</b> généré pour le groupe en 1 mois.",
         "Analyse et sélectionne OPCVM, produits structurés et solutions "
         "de prévoyance &mdash; <b>3 catégories de produits</b> couvertes.",
         "<b>3 outils métier</b> maîtrisés : CRM Salesforce, Finastra Fusion "
         "Invest, Morningstar Direct."]))

    s += head("Entrepreneuriat &amp; projets")
    s.append(dated(
        "04/2026 -<br/>présent<br/><i>(en cours)</i>",
        "EPTA5 Inc (SAS) - Fondateur, Chef de Projet &amp; Développeur",
        ["<b>Chef de projet solo end-to-end</b> &mdash; cadrage, PRD, "
         "roadmap, delivery, mise en production, opérations.",
         "Plateforme data financière B2B type Bloomberg : "
         "<b>IA RAG + système BYOK</b> pour la gestion de news.",
         "<b>Data engineering &amp; nettoyage</b> (posture data analyst) : "
         "20+ pipelines Python automatisés via GitHub Actions / YAML cron "
         "jobs, alimentés par 3 APIs financières spécialisées &mdash; "
         "<b>FRED</b> (Réserve fédérale américaine, séries macro), "
         "<b>FMI</b> (Fonds monétaire international, données macro globales) "
         "et <b>TIINGO</b> (cours d'actions historiques depuis l'IPO, "
         "fournisseur open source) &mdash; avec déduplication, "
         "normalisation et gestion des valeurs manquantes.",
         "<b>Benchmarking fournisseurs &amp; arbitrage qualité / coût</b> : "
         "sélection rationnelle des services cloud, APIs et briques tierces "
         "pour maximiser la qualité technique tout en optimisant le TCO.",
         "Architecture <b>100 % serverless edge</b> (Cloudflare Workers / D1) "
         "avec <b>7+ mécanismes de sécurité</b> intégrés : AES-256-GCM, OTP, "
         "CSRF, Turnstile, rotation de sessions, rate limiting, conformité "
         "RGPD &mdash; gérée en autonomie totale."],
        meta=link("<https://www.epta5.com>", "<www.epta5.com>")))
    s.append(dated(
        "2024 - 2025",
        "Power BI Backtesting Engine - Projet personnel",
        ["Dashboard multi-variables &mdash; <b>5+ indicateurs techniques</b> "
         "+ calendrier économique complet (incluant interventions de "
         "banques centrales).",
         "DAX avancé &mdash; <b>4+ KPIs financiers</b> : signaux d'entrée / "
         "sortie, Sharpe, drawdown max, win rate."]))
    s.append(dated(
        "2024 - 2025",
        "Investment-Insight &amp; Together Growth - Projets étudiants",
        ["Investment-Insight : évaluation des risques sur actifs cotés via "
         "<b>4 méthodologies</b> (DCF, PEG, VaR, Z-Score Altman) &mdash; "
         "modélisation automatisée de ratios.",
         "Together Growth : collecte et analyse de données de marché, "
         "automatisation Python (rendement, volatilité, scoring)."]))
    s.append(dated(
        "2026",
        "SeisSix Newsletter - Guide Investissement 2026 - Track Record "
        "Dashboard",
        ["Sites HTML déployés sur Netlify &mdash; contenu financier "
         "pédagogique et suivi public des performances de trading "
         "(2022-2025)."],
        meta=link("<https://seissix-newsletter.netlify.app>",
                  "seissix-newsletter.netlify.app")))

    s += head("Certifications")
    certs = [
        ("2026 (en cours)", "CFA Level 1 candidate",
         "Chartered Financial Analyst &mdash; lecture de référence : "
         "John Hull, <i>Options, Futures and Other Derivatives</i>."),
        ("07/2025", "DCI &amp; DAA",
         "Produits financiers, réglementation, conformité bancaire."),
        ("07/2025", "Certification AMF",
         "Passée en autonomie, nationale."),
        ("06/2025", "Google Data Analytics Professional Certificate",
         "Power BI, SQL, Looker Studio &mdash; délivré le 28/06/2025."),
        ("06/2025", "Financial Markets Certification - Yale University",
         "Audit officiel &mdash; marchés, valorisation, comportements.")]
    cert_data = [[Paragraph(d, DATE),
                  Paragraph(f"<b>{t}</b> &mdash; {sub}", VAL)]
                 for d, t, sub in certs]
    ct = Table(cert_data, colWidths=[32 * mm, None])
    ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    s.append(ct)

    s += head("Formation")
    s.append(kvtable([(Paragraph("2024", DATE),
                       Paragraph("<b>BTS Banque</b> &mdash; alternance, "
                                 "SereniLifeGroup", VAL)),
                      (Paragraph("2021", DATE),
                       Paragraph("<b>Baccalauréat Général</b>", VAL))],
                     [32 * mm, None]))

    s += head("Centres d'intérêt")
    for b in [
        "<b>Trading &amp; finance personnelle :</b> track record public "
        "2022-2025 (track-record-lem.netlify.app).",
        "<b>Sports de combat (passion) :</b> kick-boxing, karaté, boxe "
        "anglaise et boxe française.",
        "<b>Athlétisme :</b> 5 ans de pratique, dont 1 an coach enfants et "
        "assistant préparateur physique au Club d'Athlétisme Val "
        "d'Europe (2021).",
        "<b>E-sport :</b> League of Legends &mdash; top 3 % sur le serveur "
        "EUW (~10,5 M de joueurs actifs)."]:
        s.append(Paragraph("&bull; " + b, BULLET))

    doc.build(s)
    print("FR PDF built")


if __name__ == "__main__":
    build()
