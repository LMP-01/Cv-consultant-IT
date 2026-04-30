"""ATS CV builder - EN - Theo Manso Pinto - AI Project Manager Assistant."""
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
    doc = BaseDocTemplate("CV_Theo_Manso_Pinto_EN.pdf",
                          pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                          topMargin=12 * mm, bottomMargin=12 * mm,
                          title="CV - Théo Manso Pinto - AI Project Manager Assistant",
                          author="Théo Manso Pinto")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f])])
    s = []

    s.append(Paragraph("Théo Manso Pinto", NAME))
    s.append(Paragraph(
        "AI Project Manager Assistant &middot; Data &middot; AI Agents "
        "&middot; Project Design", ROLE))
    s.append(Paragraph(
        "Île-de-France, France &middot; open to relocation France &amp; "
        "international &middot; consulting / contracting available", CONTACT))
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

    s += head("Profile")
    s.append(Paragraph(
        "<b>AI Project Manager Assistant &middot; Data Engineer &middot; "
        "AI Agents Engineer.</b> "
        "Hybrid finance / tech profile, AMF-certified (French market regulator), "
        "able to scope (PRD, roadmap, discovery), prototype and ship "
        "agentic AI projects end-to-end &mdash; from business need to "
        "production. Founder of EPTA5 Inc (SAS), a B2B financial data "
        "platform (Bloomberg-style) with RAG-based AI, Cloudflare edge "
        "architecture and AES-256-GCM encryption &mdash; designed, shipped "
        "and operated solo (end-to-end project owner). I translate business "
        "requirements (structured products, wealth management, regulatory "
        "reporting) into actionable technical specs and AI agents (RAG, BYOK, "
        "HITL, multi-agent) &mdash; available for consulting or fixed-price "
        "engagements, France and international.", BODY))

    s += head("Target Roles")
    for b in [
        "<b>AI Project Management:</b> scoping, PRD, roadmap, discovery, "
        "stakeholder management, OKRs, MVP, business workshops &mdash; "
        "agile delivery coordination.",
        "<b>AI Agent Design:</b> multi-agent architecture, RAG, BYOK, HITL "
        "(human-in-the-loop), tool use, function calling, guardrails, "
        "evals, observability, production deployment.",
        "<b>Data Engineering:</b> Python ETL / ELT, GitHub Actions "
        "automation (20+ pipelines), data modeling, Power BI / Looker "
        "dashboards.",
        "<b>Business &harr; Tech bridge:</b> business need &rarr; spec "
        "translation, AI evangelism for finance leadership, GDPR "
        "compliance &amp; security (AES-256-GCM, OTP, CSRF)."]:
        s.append(Paragraph("&bull; " + b, BULLET))

    s += head("Skills")
    s.append(kvtable([
        ("AI &amp; Agents",
         "<b>RAG</b> &middot; <b>BYOK</b> &middot; <b>multi-agent</b> "
         "&middot; HITL &middot; orchestration &middot; tool use &middot; "
         "function calling &middot; guardrails &middot; evals &middot; "
         "observability &middot; LLMOps"),
        ("Data &amp; Analytics",
         "<b>Python</b> &middot; <b>Power BI (Expert)</b> &middot; "
         "<b>DAX (Expert)</b> &middot; SQL &middot; Looker Studio "
         "&middot; Bloomberg Terminal &middot; ETL / ELT"),
        ("Cloud &amp; Dev",
         "<b>GitHub Actions / YAML</b> &middot; Cloudflare Workers / D1 "
         "&middot; Drizzle ORM &middot; Protobuf &middot; VBA &middot; C++"),
        ("Security &amp; compliance",
         "AES-256-GCM &middot; OTP / CSRF &middot; Cloudflare Turnstile "
         "&middot; session rotation &middot; rate limiting &middot; "
         "GDPR compliance"),
        ("Project &amp; Domain",
         "Scoping / PRD &middot; roadmap &middot; discovery &middot; "
         "stakeholder management &middot; OKRs &middot; MVP &middot; "
         "Agile &middot; Salesforce &middot; Avaloq &middot; Finastra "
         "Fusion Invest &middot; Morningstar Direct"),
    ], [40 * mm, None]))

    s += head("Languages")
    langs = [("French", "Native"), ("English", "Fluent"),
             ("Spanish", "Intermediate"), ("Portuguese", "Basic")]
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

    s += head("Professional Experience")
    s.append(dated(
        "07/2025 -<br/>present<br/><i>(current role)</i>",
        "Financial Advisor - Permanent (CDI) &middot; Caisse d'Épargne "
        "&middot; Île-de-France, France",
        ["Advise and sell <b>complex structured products</b> (autocallable "
         "notes, barrier and memory-feature instruments) to a wealth "
         "management client base.",
         "Design wealth strategies across <b>3 tax-efficient envelopes</b> "
         "(PEA stock plan, Life Insurance, Retirement Savings) &mdash; "
         "client tax optimization."]))
    s.append(dated(
        "11/2024 -<br/>04/2025",
        "Banking Account Manager &middot; Société Générale &middot; "
        "Saint-Maur (94), France",
        ["Managed a <b>Premium &amp; BPAT (private banking) portfolio</b> "
         "&mdash; proactive follow-up on banking and wealth needs.",
         "<b>Achieved 150 % of insurance sales targets</b> in 1 month "
         "&mdash; <b>top branch performer</b>."]))
    s.append(dated(
        "10/2023 -<br/>04/2024",
        "Brokerage Assistant - Apprenticeship (BTS Banking degree) "
        "&middot; SereniLifeGroup &middot; Clichy (92), France",
        ["<b>Top performer</b> on Retirement, Life Insurance and Wellbeing "
         "products: <b>EUR 50K of gross revenue</b> generated for the group "
         "in 1 month.",
         "Analyzed and selected mutual funds, structured products and "
         "wellbeing solutions &mdash; covered <b>3 product categories</b>.",
         "Mastered <b>3 industry-standard tools</b>: Salesforce CRM, "
         "Finastra Fusion Invest, Morningstar Direct."]))

    s += head("Entrepreneurship &amp; Projects")
    s.append(dated(
        "04/2026 -<br/>present<br/><i>(in progress)</i>",
        "EPTA5 Inc (SAS) - Founder, Project Owner &amp; Developer",
        ["<b>Solo end-to-end project owner</b> &mdash; scoping, PRD, "
         "roadmap, delivery, production rollout, operations.",
         "B2B financial data platform (Bloomberg-style): "
         "<b>RAG-based AI + BYOK system</b> for news ingestion and "
         "Q&amp;A.",
         "<b>100 % serverless edge architecture</b> (Cloudflare Workers / D1) "
         "with <b>7+ integrated security mechanisms</b>: AES-256-GCM, OTP, "
         "CSRF, Turnstile, session rotation, rate limiting, GDPR "
         "compliance &mdash; operated solo.",
         "<b>20+ Python pipelines</b> automated via GitHub Actions / YAML "
         "cron jobs, fed by <b>3+ external financial APIs</b> (FRED, "
         "TIINGO, FMI) and open data sources."],
        meta=link("<https://www.epta5.com>", "<www.epta5.com>")))
    s.append(dated(
        "2024 - 2025",
        "Power BI Backtesting Engine - Personal project",
        ["Multi-variable dashboard &mdash; <b>5+ technical indicators</b> "
         "+ full economic calendar (including central bank speakers).",
         "Advanced DAX &mdash; <b>4+ financial KPIs</b>: entry / exit "
         "signals, Sharpe ratio, max drawdown, win rate."]))
    s.append(dated(
        "2024 - 2025",
        "Investment-Insight &amp; Together Growth - Student projects",
        ["Investment-Insight: equity risk evaluation using <b>4 "
         "methodologies</b> (DCF, PEG, VaR, Altman Z-Score) &mdash; "
         "automated ratio modeling.",
         "Together Growth: market data collection and analysis, Python "
         "automation (returns, volatility, scoring)."]))
    s.append(dated(
        "2026",
        "SeisSix Newsletter - 2026 Investment Guide - Track Record Dashboard",
        ["HTML sites deployed on Netlify &mdash; educational financial "
         "content and public tracking of trading performance "
         "(2022-2025)."],
        meta=link("<https://seissix-newsletter.netlify.app>",
                  "seissix-newsletter.netlify.app")))

    s += head("Certifications")
    certs = [
        ("2026 (in progress)", "CFA Level 1 candidate",
         "Chartered Financial Analyst &mdash; reference: John Hull, "
         "<i>Options, Futures and Other Derivatives</i>."),
        ("07/2025", "DCI &amp; DAA",
         "Financial products, regulation, banking compliance "
         "(French banking certifications)."),
        ("07/2025", "AMF Certification",
         "French Financial Markets Authority &mdash; passed independently, "
         "national certification."),
        ("06/2025", "Google Data Analytics Professional Certificate",
         "Power BI, SQL, Looker Studio &mdash; issued 28/06/2025."),
        ("06/2025", "Financial Markets Certification - Yale University",
         "Official audit &mdash; markets, valuation, behavioral finance.")]
    cert_data = [[Paragraph(d, DATE),
                  Paragraph(f"<b>{t}</b> &mdash; {sub}", VAL)]
                 for d, t, sub in certs]
    ct = Table(cert_data, colWidths=[36 * mm, None])
    ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
    s.append(ct)

    s += head("Education")
    s.append(kvtable([(Paragraph("2024", DATE),
                       Paragraph("<b>BTS Banking degree</b> &mdash; "
                                 "apprenticeship, SereniLifeGroup", VAL)),
                      (Paragraph("2021", DATE),
                       Paragraph("<b>French Baccalauréat</b> "
                                 "(general track)", VAL))],
                     [32 * mm, None]))

    s += head("Interests")
    for b in [
        "<b>Trading &amp; personal finance:</b> public track record "
        "2022-2025 (track-record-lem.netlify.app).",
        "<b>Combat sports (passion):</b> kickboxing, karate, English boxing "
        "and French boxing (savate).",
        "<b>Athletics:</b> 5 years of practice, including 1 year as kids' "
        "coach and assistant strength &amp; conditioning trainer at Val "
        "d'Europe Athletics Club (2021).",
        "<b>E-sports:</b> League of Legends &mdash; top 3 % on the EUW "
        "server (~10.5M active players)."]:
        s.append(Paragraph("&bull; " + b, BULLET))

    doc.build(s)
    print("EN PDF built")


if __name__ == "__main__":
    build()
