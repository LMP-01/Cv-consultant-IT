"""Compact ATS CV builder for Theo Manso Pinto."""
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


NAME = st("name", "Times-Bold", 22, 24, NAVY, TA_CENTER, spa=2)
ROLE = st("role", "Times-Italic", 12, 14, GREY, TA_CENTER, spa=6)
CONTACT = st("ct", "Times-Roman", 9.2, 12, INK, TA_CENTER, spa=10)
SECTION = st("sec", "Times-Bold", 10, 12, NAVY, spb=8, spa=4)
BODY = st("bd", "Times-Roman", 10, 13, INK, TA_JUSTIFY, spa=4)
BULLET = st("bu", "Times-Roman", 9.7, 12.5, INK, indent=10, spa=1.5)
TITLE = st("ti", "Times-Bold", 10.5, 13, INK, spa=2)
DATE = st("dt", "Times-Italic", 9.5, 12, GREY)
LBL = st("lb", "Times-Roman", 9.8, 12, GREY)
VAL = st("vl", "Times-Roman", 9.8, 12, INK)


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


def build():
    doc = BaseDocTemplate("CV_Theo_Manso_Pinto_Consultant_IT.pdf",
                          pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=16 * mm, bottomMargin=16 * mm,
                          title="CV - Theo Manso Pinto - Consultant IT",
                          author="Theo Manso Pinto")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f])])
    s = []
    s.append(Paragraph("Theo Manso Pinto", NAME))
    s.append(Paragraph("Consultant IT", ROLE))
    contact = ('+33 6 30 80 85 75 &nbsp;&bull;&nbsp; '
               '<font color="#1B3F8B"><u>theo.mansopro@gmail.com</u></font> '
               '&nbsp;&bull;&nbsp; <font color="#1B3F8B"><u><epta5.com></u></font> '
               '&nbsp;&bull;&nbsp; <font color="#1B3F8B"><u>'
               'seissix-newsletter.netlify.app</u></font> &nbsp;&bull;&nbsp; '
               '<font color="#1B3F8B"><u>track-record-lem.netlify.app</u></font>')
    s.append(Paragraph(contact, CONTACT))

    s += head("Profil")
    s.append(Paragraph(
        "Consultant hybride finance / tech, certifie AMF, capable de livrer "
        "des missions data et IA de bout en bout pour des ESN, cabinets de "
        "conseil ou directions metier de la banque-assurance. Fondateur "
        "d'EPTA5 Inc (SAS), plateforme data financiere B2B type Bloomberg "
        "avec IA RAG, architecture Cloudflare edge et chiffrement "
        "AES-256-GCM concue en autonomie totale. Je traduis les besoins "
        "metier (produits structures, gestion de patrimoine, reporting "
        "reglementaire) en solutions techniques Python, Power BI, GitHub "
        "Actions, cloud edge - mobilisable en regie ou au forfait, en "
        "France et a l'international.", BODY))

    s += head("Competences")
    s.append(kvtable([
        ("Data & Analyse",
         "Power BI (Expert) &middot; DAX (Expert) &middot; SQL &middot; "
         "Looker Studio &middot; Bloomberg Terminal"),
        ("Developpement",
         "Python &middot; GitHub Actions / YAML &middot; Cloudflare "
         "Workers / D1 &middot; Drizzle ORM &middot; VBA &middot; C++"),
        ("IA & Securite",
         "IA generative &middot; RAG &middot; BYOK &middot; AES-256-GCM "
         "&middot; OTP / CSRF &middot; Cloudflare Turnstile &middot; "
         "conformite RGPD"),
        ("CRM & Metier",
         "Salesforce &middot; Avaloq &middot; Finastra Fusion Invest "
         "&middot; Morningstar Direct &middot; WordPress &middot; "
         "Pack Office")], [40 * mm, None]))

    s += head("Langues")
    langs = [("Francais", "Langue maternelle"), ("Anglais", "Courant"),
             ("Espagnol", "Intermediaire"), ("Portugais", "Notions")]
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

    s += head("Loisirs")
    s.append(Paragraph(
        "League of Legends - top 3% sur le serveur EUW (~10,5M de joueurs "
        "actifs) &middot; Randonnee &middot; Bivouac", BODY))

    s += head("Consultant IT - Data & FinTech")
    s.append(Paragraph(
        "<b>Missions cibles :</b> Data Engineering (ETL Python, automatisation "
        "GitHub Actions, modeles de donnees, dashboards Power BI / Looker) "
        "&middot; IA generative & RAG (cadrage, prototypage et "
        "industrialisation d'agents IA, BYOK, evaluation, securite) "
        "&middot; FinTech & RegTech (produits structures, valorisation, "
        "conformite RGPD, AES-256-GCM, gestion d'identite OTP / CSRF) "
        "&middot; Cloud edge & FinOps (Cloudflare Workers / D1, "
        "architectures serverless low-cost, observabilite et resilience).",
        BODY))

    s += head("Experience professionnelle")
    s.append(dated(
        "Juillet 2025 -<br/>aujourd'hui<br/><i>(en poste)</i>",
        "Conseiller Financier - CDI &middot; Caisse d'Epargne &middot; "
        "Ile-de-France",
        ["Conseil et vente de produits structures complexes (autocall, "
         "instruments techniques) aupres d'une clientele patrimoniale.",
         "Strategies patrimoniales : PEA, Assurance-Vie, PER - optimisation "
         "fiscale clients."]))
    s.append(dated(
        "Novembre 2024 -<br/>Avril 2025",
        "Conseiller Clientele Bancaire &middot; Societe Generale &middot; "
        "Saint-Maur (94)",
        ["Clientele Premium et BPAT - suivi proactif des besoins bancaires "
         "et patrimoniaux.",
         "Objectifs prevoyance atteints a 150% en un mois - top vendeur "
         "de l'agence."]))
    s.append(dated(
        "Octobre 2023 -<br/>Avril 2024",
        "Assistant Mandataire en Courtage - Alternance BTS Banque &middot; "
        "SereniLifeGroup &middot; Clichy (92)",
        ["Top vendeur PER, assurance-vie et prevoyance : 50 K EUR de CA "
         "brut genere pour le groupe en 1 mois.",
         "Analyse et selection OPCVM, produits structures et solutions "
         "de prevoyance.",
         "Outils metier : CRM Salesforce, Finastra Fusion Invest, "
         "Morningstar Direct."]))

    s += head("Entrepreneuriat & projets")
    s.append(dated(
        "Avril 2026 -<br/>aujourd'hui<br/><i>(en cours)</i>",
        "EPTA5 Inc (SAS) - Fondateur & Developpeur",
        ["Plateforme data financiere B2B type Bloomberg : IA RAG + systeme "
         "BYOK pour la gestion de news.",
         "Architecture full edge : Cloudflare Workers / D1, AES-256-GCM, "
         "OTP, CSRF, rotation de sessions, Protobuf, rate limiting, "
         "conformite RGPD - geree en autonomie totale.",
         "~20 scripts Python automatises via GitHub Actions / YAML cron "
         "jobs. APIs : FRED, TIINGO, FMI + sources open data."],
        meta="<epta5.com>"))
    s.append(dated(
        "2024 - 2025",
        "Power BI Backtesting Engine - Projet personnel",
        ["Dashboard multi-variables : indicateurs techniques + calendrier "
         "economique complet (incluant interventions de banques centrales).",
         "DAX avance : signaux d'entree / sortie, Sharpe, drawdown max, "
         "win rate."]))
    s.append(dated(
        "2024 - 2025",
        "Investment-Insight & Together Growth - Projets etudiants",
        ["Investment-Insight : evaluation des risques sur actifs cotes "
         "(DCF, PEG, VaR, Z-Score Altman) - modelisation automatisee de "
         "ratios.",
         "Together Growth : collecte et analyse de donnees de marche, "
         "automatisation Python (rendement, volatilite, scoring)."]))
    s.append(dated(
        "2026",
        "SeisSix Newsletter - Guide Investissement 2026 - Track Record "
        "Dashboard",
        ["Sites HTML deployes sur Netlify - contenu financier pedagogique "
         "et suivi public des performances de trading."]))

    s += head("Certifications")
    certs = [
        ("Juillet 2025", "DCI &amp; DAA",
         "Produits financiers, reglementation, conformite bancaire."),
        ("Juillet 2025", "Certification AMF", "Passee en autonomie, nationale."),
        ("Juin 2025", "Google Data Analytics Professional Certificate",
         "Power BI, SQL, Looker Studio - delivre le 28/06/2025."),
        ("Juin 2025", "Financial Markets Certification - Yale University",
         "Audit officiel - marches, valorisation, comportements.")]
    cert_data = [[Paragraph(d, DATE),
                  Paragraph(f"<b>{t}</b> - {sub}", VAL)]
                 for d, t, sub in certs]
    ct = Table(cert_data, colWidths=[32 * mm, None])
    ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    s.append(ct)

    s += head("Formation")
    s.append(kvtable([(Paragraph("2021", DATE),
                       Paragraph("<b>Baccalaureat General</b>", VAL))],
                     [32 * mm, None]))

    s += head("Centres d'interet")
    for b in [
        "<b>Trading & finance personnelle :</b> track record public 2022-2025, "
        "lecture du John Hull (Options, Futures and Other Derivatives), "
        "preparation du CFA niveau 1.",
        "<b>Sports de combat (passion) :</b> kick-boxing, karate, boxe "
        "anglaise et boxe francaise.",
        "<b>Athletisme :</b> 5 ans de pratique, dont 1 an coach enfants "
        "et assistant preparateur physique au Club d'Athletisme Val "
        "d'Europe (2021)."]:
        s.append(Paragraph("&bull; " + b, BULLET))

    doc.build(s)
    print("PDF built")


if __name__ == "__main__":
    build()
