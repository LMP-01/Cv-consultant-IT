"""Build DEVELOPPEMENT_PERSONNEL.pdf - interview prep guide."""
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable,
                                KeepTogether, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

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
H1 = st("h1", "Times-Bold", 14, 18, NAVY, spb=14, spa=4)
H2 = st("h2", "Times-Bold", 11.5, 14, NAVY, spb=8, spa=3)
H3 = st("h3", "Times-Bold", 10, 13, INK, spb=4, spa=2)
BODY = st("body", "Times-Roman", 10, 13.5, INK, TA_JUSTIFY, spa=4)
BULLET = st("bul", "Times-Roman", 10, 13.5, INK, spa=2, indent=14)


def head(label):
    return [Paragraph(label.upper(), H1),
            HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4)]


def bullet(text):
    return Paragraph("&bull;&nbsp; " + text, BULLET)


def build():
    doc = BaseDocTemplate("DEVELOPPEMENT_PERSONNEL.pdf",
                          pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=15 * mm, bottomMargin=15 * mm,
                          title="Developpement personnel - Theo Manso Pinto",
                          author="Theo Manso Pinto")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f])])

    s = []
    s.append(Paragraph("Développement personnel", TITLE))
    s.append(Paragraph("Pistes d'entretien — Théo Manso Pinto", SUBTITLE))
    s.append(Paragraph(
        "Sujets à approfondir pour gagner en crédibilité auprès des "
        "recruteurs de postes Assistant Chef de Projet IA / AI PM. Pour "
        "chaque sujet : <b>ce que c'est</b>, <b>pourquoi ça booste la "
        "crédibilité</b>, <b>les tâches/skills concrètes que ça "
        "débloque</b>, <b>comment l'apprendre</b>.", BODY))
    s.append(Spacer(1, 6))

    sections = [
        ("1. PRD (Product Requirements Document)",
         "Document de référence d'un produit ou d'une feature : problème "
         "à résoudre, utilisateurs cibles, objectifs métier, périmètre, "
         "success metrics, contraintes, risques, dépendances. C'est le "
         "contrat entre PM, design, tech et stakeholders.",
         ["Signale en entretien que tu sais structurer un projet avant de coder.",
          "Permet de répondre proprement à \"comment tu cadres une nouvelle feature ?\".",
          "C'est l'attendu n°1 d'un AI PM dans une scale-up ou un cabinet de conseil."],
         ["Animer un kickoff, formaliser le besoin métier en 1 doc partagé.",
          "Aligner Engineering, Design, Data et Business sur un seul document.",
          "Tracer les arbitrages (scope cuts, trade-offs)."],
         ["Templates publics : Lenny's Newsletter, Reforge, Marty Cagan.",
          "S'entraîner : rédiger un PRD pour une feature d'EPTA5."]),

        ("2. OKR (Objectives and Key Results)",
         "Cadre d'alignement utilisé par Google, Intel, LinkedIn. Un "
         "<i>Objective</i> qualitatif et ambitieux, mesuré par 3 à 5 "
         "<i>Key Results</i> quantitatifs. Cycle trimestriel.",
         ["Signale que tu sais aligner un projet IA avec la stratégie de l'entreprise.",
          "Permet de répondre à \"comment tu mesures le succès de ton produit ?\".",
          "Très demandé dans les boîtes tech / scale-up et cabinets type BCG / Accenture."],
         ["Traduire une vision en KRs mesurables (MAU, NRR, latence p95, taux d'adoption).",
          "Animer un <i>quarterly review</i> avec les stakeholders.",
          "Prioriser le backlog en fonction du KR le plus en retard."],
         ["Livre : <i>Measure What Matters</i> de John Doerr.",
          "S'entraîner : poser 1 Objective + 3 KRs sur EPTA5 pour le trimestre."]),

        ("3. Stakeholder management",
         "Identifier, hiérarchiser, communiquer et gérer les attentes "
         "de tous les acteurs touchés par le projet : sponsor, "
         "utilisateurs, équipe tech, finance, juridique, commerciaux, "
         "top management.",
         ["C'est LA compétence qui distingue un assistant chef de projet d'un dev.",
          "Permet de répondre à \"raconte-moi un conflit géré entre métier et tech\".",
          "Critique dans les missions de conseil IT (ESN, cabinets)."],
         ["Cartographier les stakeholders (matrice Pouvoir / Intérêt — RACI).",
          "Adapter ton discours : pitch exec, spec ingé, demo client.",
          "Désamorcer les blocages politiques (priorisation, budget, scope creep)."],
         ["Livre : <i>Crucial Conversations</i> (Patterson, Grenny).",
          "Méthodes : RACI, matrice Pouvoir / Intérêt, communication plan.",
          "S'entraîner : sur EPTA5, lister tes \"stakeholders\" fictifs et écrire un plan de com par persona."]),

        ("4. Méthodes Agile / Scrum",
         "Framework de delivery itératif. Sprints (1 à 4 semaines), "
         "backlog, daily stand-up, sprint review, retrospective. "
         "Variantes : Scrum, Kanban, SAFe.",
         ["Quasi-systématique dans les offres \"AI PM\", \"Project Manager IT\", ESN.",
          "Permet de répondre à \"raconte un sprint où ça s'est mal passé\".",
          "Une certification PSM I (Scrum.org) est un signal fort."],
         ["Animer un daily stand-up (15 min, 3 questions).",
          "Prioriser un backlog avec MoSCoW ou WSJF.",
          "Mener une rétrospective (Start / Stop / Continue).",
          "Estimer en story points (planning poker)."],
         ["Certif : Scrum.org PSM I (test à 200 $, prep gratuite).",
          "Livre : <i>Scrum: The Art of Doing Twice the Work in Half the Time</i> (Jeff Sutherland).",
          "S'entraîner : organiser EPTA5 en sprints d'1 semaine avec un Notion / GitHub Projects."]),

        ("5. Coordination delivery agile / Discovery",
         None,
         ["Le duo <i>discovery + delivery</i> est la définition contemporaine d'un PM (Marty Cagan, Teresa Torres).",
          "Permet de répondre à \"comment tu valides qu'un produit IA résout un vrai problème avant de coder ?\"."],
         ["Conduire 5 user interviews et synthétiser les insights.",
          "Construire un opportunity tree (Teresa Torres) pour prioriser les hypothèses.",
          "Tracker les blockers en daily et escalader proprement."],
         ["Livre : <i>Continuous Discovery Habits</i> (Teresa Torres).",
          "Cours : Reforge \"Product Discovery\", ProductPlan blog.",
          "S'entraîner : sur EPTA5, interviewer 3 utilisateurs cibles potentiels et formaliser un opportunity tree."]),

        ("6. ETL / ELT (Extract-Transform-Load)",
         "Patterns d'ingestion de données. <b>ETL</b> = on transforme "
         "avant de charger dans le data warehouse. <b>ELT</b> = on "
         "charge brut, on transforme dans la DWH (plus moderne, "
         "BigQuery / Snowflake / Databricks).",
         ["Compétence centrale d'un Data Engineer / AI PM data-aware.",
          "Permet de répondre à \"comment tu construis un pipeline data fiable et observable ?\".",
          "Différencie un AI PM qui fait du prompt engineering d'un AI PM qui sait livrer en prod."],
         ["Cadrer la fréquence (batch / streaming), le SLA, les contrats de schéma.",
          "Mettre en place idempotence, retries, dead letter queue, monitoring.",
          "Documenter le data lineage (source &rarr; transformations &rarr; consommateurs).",
          "Choisir entre orchestrateurs : Airflow, Prefect, Dagster."],
         ["Cours gratuit : <i>Data Engineering Zoomcamp</i> (DataTalks Club, ~50h).",
          "Lecture : <i>Fundamentals of Data Engineering</i> (Reis &amp; Housley, O'Reilly).",
          "S'entraîner : ajouter un test d'intégrité (Great Expectations / Soda) sur un pipeline EPTA5 existant.",
          "Certif rapide (~10h) : <b>Astronomer Airflow Fundamentals</b> (gratuit, badge officiel)."]),

        ("7. SQL — passer en intermédiaire confirmé",
         "SQL est déjà sur ton CV en niveau intermédiaire. Pour passer "
         "un cap rapide et avoir un signal certifié face aux "
         "recruteurs, il existe des certifications courtes (&lt; 15h) "
         "reconnues.",
         ["SQL est demandé sur 90 % des offres Data / AI PM.",
          "Permet de répondre proprement aux tests techniques live coding.",
          "Atout différenciant face à un profil PM purement business."],
         ["Maîtriser JOIN (INNER / LEFT / RIGHT / FULL), GROUP BY, HAVING, sous-requêtes.",
          "Window functions (OVER, PARTITION BY, ROW_NUMBER, RANK, LAG / LEAD).",
          "CTE (WITH ...), CTE récursives.",
          "Optimisation : EXPLAIN, indexes, éviter SELECT *.",
          "Modélisation : star / snowflake schema, formes normales."],
         ["<b>Reco n°1 (gratuite, ~12h) : HackerRank SQL Skills "
          "Certification Advanced.</b> 10-12h de prep sur HackerRank + 1h "
          "de test, certificat shareable LinkedIn. <i>Le meilleur ratio "
          "temps / signal pour ton profil.</i>",
          "<b>Reco n°2 : DataCamp SQL Associate Certification</b> "
          "(~12-15h, abonnement ~30 €/mois, signal recrutement plus fort).",
          "<b>Reco n°3 : Microsoft DP-900 Azure Data Fundamentals</b> "
          "(~10h, test ~100 €, signal Azure).",
          "Plan de prep 12h : SQLZoo (3h) + StrataScratch Easy/Medium "
          "(5h) + HackerRank Advanced (3h) + test (1h). Bonus : 5 requêtes "
          "analytiques sur la D1 EPTA5."]),
    ]

    for title, ce_que, credi, taches, apprendre in sections:
        s += head(title)
        s.append(Paragraph("<b>Ce que c'est</b>", H3))
        if ce_que:
            s.append(Paragraph(ce_que, BODY))
        else:
            for b in [
                "<b>Discovery</b> : phase amont où on valide le problème (interviews users, market research, prototypes jetables).",
                "<b>Coordination delivery</b> : faire avancer les sprints en levant les blocages cross-équipes."]:
                s.append(bullet(b))
        s.append(Paragraph("<b>Pourquoi ça booste la crédibilité</b>", H3))
        for b in credi:
            s.append(bullet(b))
        s.append(Paragraph("<b>Tâches / skills débloqués</b>", H3))
        for b in taches:
            s.append(bullet(b))
        s.append(Paragraph("<b>Comment l'apprendre</b>", H3))
        for b in apprendre:
            s.append(bullet(b))

    s += head("Plan d'attaque suggéré (4 mois)")
    plan_data = [
        ["<b>Mois</b>", "<b>Focus</b>", "<b>Livrable concret</b>"],
        ["1", "<b>SQL Advanced</b> (quick win)",
         "Certif HackerRank SQL Advanced (~12h) + 5 requêtes EPTA5"],
        ["2", "PRD + OKR + Stakeholder mgmt",
         "Rédiger un PRD complet + OKR Q1 + carte stakeholders EPTA5"],
        ["3", "Discovery + ETL / ELT",
         "5 user interviews + Astronomer Airflow Fundamentals"],
        ["4", "Agile / Scrum (PSM I)",
         "Passer la certif PSM I + animer 4 sprints sur EPTA5"]]
    plan_data = [[Paragraph(c, BODY) for c in row] for row in plan_data]
    plan = Table(plan_data, colWidths=[15 * mm, 55 * mm, None])
    plan.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#EAF0F9")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, NAVY),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, NAVY),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    s.append(plan)
    s.append(Spacer(1, 8))
    s.append(Paragraph(
        "Une fois les livrables produits, tu peux <b>défendre ces "
        "compétences en entretien</b> avec un projet concret à l'appui.", BODY))

    doc.build(s)
    print("Developpement personnel PDF built")


if __name__ == "__main__":
    build()
