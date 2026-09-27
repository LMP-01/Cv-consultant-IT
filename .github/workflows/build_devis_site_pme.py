"""Devis type - Site vitrine PME - EPTA5 INC (PDF, FR)."""
import os
from decimal import ROUND_HALF_UP, Decimal

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, HRFlowable,
                                KeepTogether, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)

INK = HexColor("#0B1020")
MUTED = HexColor("#545B6E")
ACCENT = HexColor("#2F5BFF")
VIOLET = HexColor("#7C3AED")
LINE = HexColor("#D5D9E3")
SOFT = HexColor("#F3F5FB")
S = getSampleStyleSheet()

NBSP = " "
OUT_DIR = os.path.join("site", "public", "devis")
OUT = os.path.join(OUT_DIR, "Devis_Site_Vitrine_PME_EPTA5.pdf")


def st(name, font="Helvetica", size=9, lead=11.5, color=INK, align=0,
       indent=0, spb=0, spa=0):
    return ParagraphStyle(name, parent=S["Normal"], fontName=font,
                          fontSize=size, leading=lead, textColor=color,
                          alignment=align, leftIndent=indent, spaceBefore=spb,
                          spaceAfter=spa)


TITLE = st("ti", "Helvetica-Bold", 17, 20, INK, spa=1)
SUB = st("sub", "Helvetica-Oblique", 9.5, 12, VIOLET, spa=0)
SECTION = st("sec", "Helvetica-Bold", 8.6, 10.5, VIOLET, spb=5, spa=1.5)
BODY = st("bd", "Helvetica", 8.4, 10.6, INK, TA_JUSTIFY, spa=1.5)
SMALL = st("sm", "Helvetica", 7.9, 10, INK)
BULLET = st("bu", "Helvetica", 8.2, 10.2, INK, indent=8, spa=0.5)
LBL = st("lb", "Helvetica", 8.2, 10.4, MUTED)
VAL = st("vl", "Helvetica", 8.2, 10.4, INK)
TH = st("th", "Helvetica-Bold", 8.2, 10, HexColor("#FFFFFF"))
THR = st("thr", "Helvetica-Bold", 8.2, 10, HexColor("#FFFFFF"), TA_RIGHT)
TD = st("td", "Helvetica", 8.2, 10.3, INK)
TDR = st("tdr", "Helvetica", 8.2, 10.3, INK, TA_RIGHT)
TOTL = st("totl", "Helvetica", 8.6, 11, INK, TA_RIGHT)
TOTB = st("totb", "Helvetica-Bold", 10, 12.5, INK, TA_RIGHT)
BOXH = st("bh", "Helvetica-Bold", 8.4, 10.5, ACCENT)
CENTER = st("ce", "Helvetica-Bold", 9, 11.5, INK, TA_CENTER)

# Montants (Decimal)
QTE = Decimal("1")
PU_HT = Decimal("700.00")
TVA_RATE = Decimal("0.20")
ACOMPTE_RATE = Decimal("0.30")
CENT = Decimal("0.01")

TOTAL_HT = (QTE * PU_HT).quantize(CENT, ROUND_HALF_UP)
TVA = (TOTAL_HT * TVA_RATE).quantize(CENT, ROUND_HALF_UP)
TOTAL_TTC = TOTAL_HT + TVA
ACOMPTE_HT = (TOTAL_HT * ACOMPTE_RATE).quantize(CENT, ROUND_HALF_UP)
ACOMPTE_TTC = (TOTAL_TTC * ACOMPTE_RATE).quantize(CENT, ROUND_HALF_UP)
SOLDE_TTC = TOTAL_TTC - ACOMPTE_TTC


def eur(amount, decimals=True):
    """Format FR : 1 234,56 € (espaces insécables U+00A0)."""
    q = Decimal(amount).quantize(CENT if decimals else Decimal("1"),
                                 ROUND_HALF_UP)
    sign = "-" if q < 0 else ""
    q = abs(q)
    ent, _, dec = f"{q:.2f}".partition(".") if decimals else (f"{q:.0f}", "", "")
    groups = []
    while len(ent) > 3:
        groups.insert(0, ent[-3:])
        ent = ent[:-3]
    groups.insert(0, ent)
    txt = NBSP.join(groups)
    if decimals:
        txt += "," + dec
    return f"{sign}{txt}{NBSP}€"


def pct(rate):
    return f"{(rate * 100).normalize():f}{NBSP}%"


def head(label):
    return [Paragraph(label.upper(), SECTION),
            HRFlowable(width="100%", thickness=0.5, color=VIOLET,
                       spaceAfter=3)]


def kvtable(rows, widths):
    data = [[Paragraph(a, LBL) if isinstance(a, str) else a,
             Paragraph(b, VAL) if isinstance(b, str) else b] for a, b in rows]
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 1.2),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2)]))
    return t


def bullets(items):
    return [Paragraph("&bull;&nbsp;" + b, BULLET) for b in items]


def box(flowables, width):
    t = Table([[flowables]], colWidths=[width])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE),
                           ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                           ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 6),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                           ("TOPPADDING", (0, 0), (-1, -1), 5),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


def fields(labels, widths, gap=7):
    """Champs à remplir : libellé + ligne de saisie (filet bas)."""
    t = Table([[Paragraph(l, LBL), ""] for l in labels], colWidths=widths,
              rowHeights=[gap * mm] * len(labels))
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                           ("LINEBELOW", (1, 0), (1, -1), 0.5, MUTED)]))
    return t


FOOTER = (f"EPTA5 INC — SAS au capital de 1{NBSP}000{NBSP}€ — "
          f"RCS Paris 103{NBSP}825{NBSP}956 — TVA FR16103825956")


def on_page(canvas, doc):
    canvas.saveState()
    w, _ = A4
    # Filet d'accent en haut de page
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 3 * mm, w * 0.62, 3 * mm, stroke=0, fill=1)
    canvas.setFillColor(VIOLET)
    canvas.rect(w * 0.62, A4[1] - 3 * mm, w * 0.38, 3 * mm, stroke=0, fill=1)
    # Pied de page
    y = 9 * mm
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, y + 4 * mm, w - doc.rightMargin, y + 4 * mm)
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, y, FOOTER)
    canvas.drawRightString(w - doc.rightMargin, y, f"Page {doc.page}")
    canvas.restoreState()


def build():
    os.makedirs(OUT_DIR, exist_ok=True)
    doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=15 * mm,
                          rightMargin=15 * mm, topMargin=11 * mm,
                          bottomMargin=17 * mm, invariant=1,
                          title="Devis type — Site vitrine PME — EPTA5 INC",
                          author="EPTA5 INC", subject="Devis type")
    f = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="full", frames=[f],
                                       onPage=on_page)])
    W = doc.width
    s = []

    # En-tête : titre + méta
    meta = kvtable([
        ("N° de devis", "<b>à attribuer</b>"),
        ("Date d'émission", "____ / ____ / ________"),
        ("Validité", "30 jours à compter de la date d'émission"),
    ], [26 * mm, 54 * mm])
    title = [Paragraph("DEVIS TYPE — Site vitrine PME", TITLE),
             Paragraph("Offre réservée aux professionnels", SUB)]
    ht = Table([[title, meta]], colWidths=[W - 80 * mm, 80 * mm])
    ht.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    s.append(ht)
    s.append(HRFlowable(width="100%", thickness=1.2, color=ACCENT,
                        spaceBefore=4, spaceAfter=5))

    # Émetteur / Client
    half = (W - 6 * mm) / 2
    emetteur = [
        Paragraph("ÉMETTEUR", BOXH),
        Paragraph("<b>EPTA5 INC</b> — SAS au capital de "
                  f"1{NBSP}000{NBSP}€", VAL),
        Paragraph("Siège : 78 avenue des Champs-Élysées, Bureau 326, "
                  "75008 Paris", VAL),
        Paragraph(f"SIREN 103{NBSP}825{NBSP}956 — RCS Paris "
                  f"103{NBSP}825{NBSP}956", VAL),
        Paragraph(f"SIRET 103{NBSP}825{NBSP}956{NBSP}00016", VAL),
        Paragraph("N° TVA intracommunautaire : FR16103825956", VAL),
        Paragraph("www.epta5.com — theo.mansopro@gmail.com — "
                  f"+33{NBSP}6{NBSP}30{NBSP}80{NBSP}85{NBSP}75", VAL),
        Paragraph("Représentée par Théo Manso Pinto, Président", LBL),
    ]
    client = [
        Paragraph("CLIENT", BOXH),
        fields(["Raison sociale", "Adresse de facturation", "", "SIREN",
                "Contact / email"], [33 * mm, half - 12 - 33 * mm]),
    ]
    parties = Table([[box(emetteur, half), "", box(client, half)]],
                    colWidths=[half, 6 * mm, half])
    parties.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                 ("TOPPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    s.append(parties)

    # Détail de la prestation
    s += head("Détail de la prestation")
    desc = [
        Paragraph("<b>Site vitrine PME — one-page mono-service</b>", TD),
        Paragraph(
            "<font color='#545B6E'>Inclus : site one-page responsive "
            "(mobile, tablette, ordinateur) présentant un seul service, "
            "jusqu'à 5 sections ; formulaire de contact avec envoi par "
            "email ; page mentions légales et politique de "
            "confidentialité ; SEO de base (balises title/description, "
            "sitemap, performance) ; mise en ligne sur un hébergement "
            "gratuit (Netlify ou Cloudflare Pages) et branchement du nom de "
            "domaine du client ; 2 allers-retours de modifications."
            "</font>", SMALL),
    ]
    rows = [
        [Paragraph("Désignation", TH), Paragraph("Qté", THR),
         Paragraph("PU HT", THR), Paragraph("TVA", THR),
         Paragraph("Total HT", THR)],
        [desc, Paragraph(f"{QTE}", TDR), Paragraph(eur(PU_HT), TDR),
         Paragraph(pct(TVA_RATE), TDR), Paragraph(eur(TOTAL_HT), TDR)],
    ]
    cw = [W - 76 * mm, 12 * mm, 23 * mm, 16 * mm, 25 * mm]
    lt = Table(rows, colWidths=cw, repeatRows=1)
    lt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), INK),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                            ("LINEBELOW", (0, 1), (-1, 1), 0.6, LINE)]))
    s.append(lt)

    tot = Table([
        [Paragraph("Total HT", TOTL), Paragraph(eur(TOTAL_HT), TOTL)],
        [Paragraph(f"TVA {pct(TVA_RATE)}", TOTL), Paragraph(eur(TVA), TOTL)],
        [Paragraph("<b>Total TTC</b>", TOTB),
         Paragraph(f"<b>{eur(TOTAL_TTC)}</b>", TOTB)],
    ], colWidths=[35 * mm, 30 * mm], hAlign="RIGHT")
    tot.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 5),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                             ("TOPPADDING", (0, 0), (-1, -1), 2),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                             ("LINEABOVE", (0, 2), (-1, 2), 1, ACCENT),
                             ("BACKGROUND", (0, 2), (-1, 2), SOFT),
                             ("TOPPADDING", (0, 2), (-1, 2), 4),
                             ("BOTTOMPADDING", (0, 2), (-1, 2), 4)]))
    s.append(Spacer(1, 3))
    s.append(tot)

    # Non inclus + Délai (deux colonnes)
    col = (W - 6 * mm) / 2
    left = head("Non inclus") + bullets([
        "Automatisations, intelligence artificielle, CRM",
        "E-commerce",
        "Multilingue",
        "Rédaction de contenus avancée",
        "Achat du nom de domaine",
        "Maintenance et évolutions après livraison",
    ]) + [Paragraph("<i>Travaux supplémentaires hors périmètre : devis "
                    "séparé.</i>", BODY)]
    right = head("Délai") + [Paragraph(
        "Livraison sous environ <b>2 semaines</b> à compter de la réception "
        "de l'acompte <b>et</b> de l'ensemble des contenus (textes, logo, "
        "images).", BODY)] + head("Propriété et hébergement") + bullets([
            "Après paiement intégral, cession au client des droits de "
            "reproduction, de représentation et d'adaptation sur les livrables "
            "spécifiquement créés, pour une exploitation en ligne, pour le "
            "monde entier et pour la durée légale des droits d'auteur. Les "
            "composants open source et outils tiers restent régis par leurs "
            "licences respectives.",
            "Nom de domaine et comptes d'hébergement ouverts au nom du "
            "client.",
            "Hébergement gratuit fourni par un tiers, sans garantie de "
            "disponibilité par EPTA5.",
        ])
    two = Table([[left, "", right]], colWidths=[col, 6 * mm, col])
    two.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 0),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    s.append(two)

    # Conditions de paiement
    s += head("Conditions de paiement")
    s += bullets([
        f"Acompte de <b>{pct(ACOMPTE_RATE)}</b> à la signature, soit "
        f"<b>{eur(ACOMPTE_HT)} HT</b> ({eur(ACOMPTE_TTC)} TTC), payable à "
        "réception de la facture d'acompte.",
        f"Solde de <b>{eur(SOLDE_TTC)} TTC</b> facturé à la livraison, payable "
        "à 30 jours à compter de la date d'émission de la facture. Pas "
        "d'escompte pour paiement anticipé.",
        "En cas de retard de paiement : pénalités au taux de la BCE majoré "
        "de 10 points et indemnité forfaitaire pour frais de recouvrement de "
        f"{eur(40, decimals=False)} (art. L441-10 et D441-5 du Code de "
        "commerce).",
    ])

    # Mention
    s += head("Mention")
    s.append(Paragraph(
        "Offre réservée aux professionnels. Pour un contrat conclu hors "
        f"établissement avec une entreprise de 5{NBSP}salariés au plus, dont "
        "l'objet n'entre pas dans son activité principale, un droit de "
        f"rétractation de 14{NBSP}jours s'applique (art. L221-3 du Code de "
        "la consommation). Le délai court à compter de la signature du devis ; "
        "la rétractation s'exerce par e-mail à theo.mansopro@gmail.com "
        "(formulaire type disponible sur demande). Si le client demande "
        "expressément le démarrage de la prestation avant la fin de ce délai, "
        "il reste redevable du montant correspondant aux travaux réalisés "
        "jusqu'à sa rétractation. Les conditions générales de vente d'EPTA5 "
        "INC sont disponibles sur demande.", BODY))

    # Signature
    sig_client = [
        Paragraph("Pour le client", BOXH),
        fields(["Date", "Nom", "Qualité"], [16 * mm, half - 12 - 16 * mm]),
        Spacer(1, 3),
        Paragraph("Signature et cachet", LBL),
        Spacer(1, 16 * mm),
    ]
    sig_epta = [
        Paragraph("Pour EPTA5 INC", BOXH),
        Paragraph("Théo Manso Pinto, Président", VAL),
        Spacer(1, 3),
        Paragraph("Signature", LBL),
        Spacer(1, 16 * mm + 21 * mm - 11),
    ]
    sig = Table([[box(sig_client, half), "", box(sig_epta, half)]],
                colWidths=[half, 6 * mm, half])
    sig.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                             ("TOPPADDING", (0, 0), (-1, -1), 0),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    s.append(KeepTogether(head("Bon pour accord") + [
        Paragraph("<b>Bon pour accord — Le devis signé vaut commande.</b>",
                  BODY),
        Spacer(1, 2), sig]))

    doc.build(s)
    print(f"Devis PDF built: {OUT}")


if __name__ == "__main__":
    build()
