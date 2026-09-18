"""
BidSure — Realistic PDF Document Generator
Generates all 10 standard qualifying PDFs and 5 error demo PDFs using ReportLab.
Run with: python generate_demo_pdfs.py
"""

import os
import sys

def check_or_install_reportlab():
    try:
        import reportlab
    except ImportError:
        print("[*] Installing reportlab for PDF generation...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "reportlab"])

check_or_install_reportlab()

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

BASE_DIR = os.path.join(os.path.dirname(__file__), "demo_pdf_documents")
QUALIFIED_DIR = os.path.join(BASE_DIR, "01_QUALIFIED_FILES")
ERROR_DIR = os.path.join(BASE_DIR, "02_ERROR_DEMO_FILES")

os.makedirs(QUALIFIED_DIR, exist_ok=True)
os.makedirs(ERROR_DIR, exist_ok=True)

styles = getSampleStyleSheet()

# Custom styles
header_style = ParagraphStyle(
    'GovHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=14,
    leading=18,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#0F2942')
)

sub_header_style = ParagraphStyle(
    'GovSubHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=10,
    leading=14,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#2C5282')
)

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=12,
    leading=16,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#1A202C')
)

body_style = ParagraphStyle(
    'GovBody',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=9,
    leading=13,
    alignment=TA_LEFT,
    textColor=colors.HexColor('#2D3748')
)

body_bold = ParagraphStyle(
    'GovBodyBold',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=9,
    leading=13,
    alignment=TA_LEFT,
    textColor=colors.HexColor('#1A202C')
)

center_style = ParagraphStyle(
    'CenterText',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=9,
    leading=13,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#4A5568')
)

stamp_style = ParagraphStyle(
    'StampStyle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8,
    leading=10,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#2B6CB0')
)

error_badge_style = ParagraphStyle(
    'ErrorBadge',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=9,
    leading=12,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#9B2C2C')
)

def build_pdf(filename, elements, border_color=colors.HexColor('#0F2942')):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    doc.build(elements)
    print(f"[✓] Generated: {os.path.basename(filename)}")

# ---------------------------------------------------------------------------
# 1. PAN Card
# ---------------------------------------------------------------------------
def create_pan_card():
    f = os.path.join(QUALIFIED_DIR, "01_PAN_Card_Nexora.pdf")
    el = [
        Paragraph("GOVERNMENT OF INDIA / भारत सरकार", header_style),
        Paragraph("INCOME TAX DEPARTMENT / आयकर विभाग", sub_header_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F2942'), spaceAfter=15),
        Paragraph("PERMANENT ACCOUNT NUMBER CARD / स्थायी लेखा संख्या कार्ड", title_style),
        Spacer(1, 15),
        Table([
            [Paragraph("PAN / स्थायी लेखा संख्या:", body_bold), Paragraph("<b>AAECN1234E</b>", ParagraphStyle('P1', parent=body_bold, fontSize=12, textColor=colors.HexColor('#0F2942')))],
            [Paragraph("Name / नाम:", body_bold), Paragraph("Nexora Systems Private Limited", body_style)],
            [Paragraph("Entity Category:", body_bold), Paragraph("Company (Entity code 'C')", body_style)],
            [Paragraph("Date of Incorporation:", body_bold), Paragraph("14/08/2014", body_style)],
            [Paragraph("Status on Tax Records:", body_bold), Paragraph("ACTIVE & VERIFIED", ParagraphStyle('P2', parent=body_bold, textColor=colors.HexColor('#22543D')))],
        ], colWidths=[160, 350], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
            ('PADDING', (0,0), (-1,-1), 8),
        ]),
        Spacer(1, 40),
        Table([
            [Paragraph("[ DIGITAL VERIFICATION BARCODE ]<br/>*AAECN1234E*<br/>Authenticity Verified", center_style),
             Paragraph("<b>INCOME TAX DEPARTMENT</b><br/>Seal of Authorized Officer<br/><i>Digitally Signed</i>", stamp_style)]
        ], colWidths=[260, 250])
    ]
    build_pdf(f, el)

# ---------------------------------------------------------------------------
# 2. GSTIN Certificate
# ---------------------------------------------------------------------------
def create_gstin():
    f = os.path.join(QUALIFIED_DIR, "02_GSTIN_Certificate_Nexora.pdf")
    el = [
        Paragraph("GOVERNMENT OF INDIA", header_style),
        Paragraph("FORM GST REG-06 — REGISTRATION CERTIFICATE", sub_header_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F2942'), spaceAfter=15),
        Table([
            [Paragraph("Registration Number (GSTIN):", body_bold), Paragraph("<b>07AAECN1234E1ZP</b>", ParagraphStyle('G1', parent=body_bold, fontSize=11, textColor=colors.HexColor('#0F2942')))],
            [Paragraph("Legal Name:", body_bold), Paragraph("Nexora Systems Private Limited", body_style)],
            [Paragraph("Trade Name:", body_bold), Paragraph("Nexora", body_style)],
            [Paragraph("Constitution of Business:", body_bold), Paragraph("Private Limited Company", body_style)],
            [Paragraph("Address of Principal Place:", body_bold), Paragraph("Plot 42, Okhla Industrial Area Phase-III, New Delhi 110020", body_style)],
            [Paragraph("Date of Liability / Reg Date:", body_bold), Paragraph("01/07/2017", body_style)],
            [Paragraph("Period of Validity:", body_bold), Paragraph("From 01/07/2017 To: Regular (Active)", body_style)],
            [Paragraph("Type of Registration:", body_bold), Paragraph("Regular Taxpayer", body_style)],
            [Paragraph("Checksum Verification:", body_bold), Paragraph("Base-36 Luhn Mod 36 Checksum: PASS", ParagraphStyle('G2', parent=body_bold, textColor=colors.HexColor('#22543D')))],
        ], colWidths=[180, 330], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 30),
        Table([
            [Paragraph("<b>Jurisdictional Office:</b> Ward 42, Range 07, Delhi South<br/>QR Code: [OFFICIAL GSTN VERIFIED]", body_style),
             Paragraph("<b>Superintendent of Central Tax</b><br/>Government of India<br/><i>Digitally Signed by GSTN</i>", stamp_style)]
        ], colWidths=[300, 210])
    ]
    build_pdf(f, el)

# ---------------------------------------------------------------------------
# 3. CA Turnover Certificate
# ---------------------------------------------------------------------------
def create_ca_turnover():
    f = os.path.join(QUALIFIED_DIR, "03_CA_Turnover_Certificate_Nexora.pdf")
    el = [
        Paragraph("CA R. IYER & ASSOCIATES", header_style),
        Paragraph("CHARTERED ACCOUNTANTS · ICAI REG NO: 102345N", sub_header_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F2942'), spaceAfter=15),
        Paragraph("STATUTORY AUDIT & TURNOVER CERTIFICATE", title_style),
        Spacer(1, 10),
        Paragraph("This is to certify that we have audited the books of accounts of <b>Nexora Systems Private Limited</b> (PAN: AAECN1234E, GSTIN: 07AAECN1234E1ZP). The annual turnover figures from business operations are certified as under:", body_style),
        Spacer(1, 10),
        Table([
            [Paragraph("<b>Financial Year</b>", center_style), Paragraph("<b>Turnover (₹ Crores)</b>", center_style), Paragraph("<b>Status</b>", center_style)],
            [Paragraph("FY 2023-2024", center_style), Paragraph("₹ 21.80 Cr", center_style), Paragraph("Audited", center_style)],
            [Paragraph("FY 2024-2025", center_style), Paragraph("₹ 23.90 Cr", center_style), Paragraph("Audited", center_style)],
            [Paragraph("FY 2025-2026", center_style), Paragraph("₹ 24.20 Cr", center_style), Paragraph("Audited", center_style)],
            [Paragraph("<b>Average 3-Year Turnover:</b>", body_bold), Paragraph("<b>₹ 23.30 Cr</b>", body_bold), Paragraph("Certified", body_style)],
            [Paragraph("<b>Certified Positive Net Worth:</b>", body_bold), Paragraph("<b>₹ 6.50 Cr</b>", body_bold), Paragraph("Certified", body_style)],
        ], colWidths=[170, 170, 170], style=[
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EDF2F7')),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E0')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 20),
        Table([
            [Paragraph("<b>Unique Document Identification Number (UDIN):</b><br/><b>261234567890123456</b><br/>Certification Date: 10/04/2026", body_style),
             Paragraph("For CA R. Iyer & Associates<br/><b>CA R. Iyer, Partner</b><br/>Membership No: 012345<br/><i>[ICAI Embossed Seal]</i>", stamp_style)]
        ], colWidths=[300, 210])
    ]
    build_pdf(f, el)

# ---------------------------------------------------------------------------
# 4. Bank Guarantee (EMD)
# ---------------------------------------------------------------------------
def create_bank_guarantee():
    f = os.path.join(QUALIFIED_DIR, "06_Bank_Guarantee_EMD.pdf")
    el = [
        Paragraph("STATE BANK OF INDIA", header_style),
        Paragraph("COMMERCIAL BRANCH, PARLIAMENT STREET, NEW DELHI", sub_header_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F2942'), spaceAfter=15),
        Paragraph("BANK GUARANTEE FOR EARNEST MONEY DEPOSIT (EMD) / BID SECURITY", title_style),
        Spacer(1, 10),
        Table([
            [Paragraph("Bank Guarantee No:", body_bold), Paragraph("SBI/BG/2026/009182", body_style)],
            [Paragraph("Guarantee Amount:", body_bold), Paragraph("₹ 4,00,000/- (Rupees Four Lakhs Only / ₹ 0.04 Cr)", body_style)],
            [Paragraph("Issuance Date:", body_bold), Paragraph("15/02/2026", body_style)],
            [Paragraph("Tender Bid Opening Date:", body_bold), Paragraph("01/04/2026", body_style)],
            [Paragraph("Bid Validity Period:", body_bold), Paragraph("30 Days (Covered up to 01/05/2026)", body_style)],
            [Paragraph("Mandatory Claim Period:", body_bold), Paragraph("90 Days beyond Bid Validity (Statutory Requirement >= 45 Days)", body_style)],
            [Paragraph("Absolute Expiry Date / Valid Till:", body_bold), Paragraph("<b>01/06/2027 (Valid Till: 2027-06-01)</b>", ParagraphStyle('B1', parent=body_bold, textColor=colors.HexColor('#22543D')))],
        ], colWidths=[180, 330], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 30),
        Table([
            [Paragraph("We undertake to pay the Purchaser the declared amount upon receipt of first written demand without cavil or argument.", body_style),
             Paragraph("For State Bank of India<br/><b>Chief Manager & Authorized Signatory</b><br/><i>[Commercial Banking Seal]</i>", stamp_style)]
        ], colWidths=[310, 200])
    ]
    build_pdf(f, el)

# ---------------------------------------------------------------------------
# 5. Udyam MSME Certificate
# ---------------------------------------------------------------------------
def create_udyam():
    f = os.path.join(QUALIFIED_DIR, "07_Udyam_MSME_Certificate_Manufacturing.pdf")
    el = [
        Paragraph("GOVERNMENT OF INDIA", header_style),
        Paragraph("MINISTRY OF MICRO, SMALL & MEDIUM ENTERPRISES", sub_header_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0F2942'), spaceAfter=15),
        Paragraph("UDYAM REGISTRATION CERTIFICATE", title_style),
        Spacer(1, 10),
        Table([
            [Paragraph("Udyam Registration Number:", body_bold), Paragraph("<b>UDYAM-07-00-0098765</b>", ParagraphStyle('U1', parent=body_bold, textColor=colors.HexColor('#0F2942')))],
            [Paragraph("Name of Enterprise:", body_bold), Paragraph("Nexora Systems Private Limited", body_style)],
            [Paragraph("Type of Enterprise:", body_bold), Paragraph("Small Enterprise (Manufacturing & IT Solutions)", body_style)],
            [Paragraph("Major Activity:", body_bold), Paragraph("MANUFACTURING (Eligible for MSME EMD Exemption)", body_style)],
            [Paragraph("National Industry Code (NIC):", body_bold), Paragraph("<b>26201</b> - Manufacture of Computers & Electronic Equipment", body_style)],
            [Paragraph("Date of Registration:", body_bold), Paragraph("18/09/2020", body_style)],
            [Paragraph("Status:", body_bold), Paragraph("ACTIVE & VERIFIED on National MSME Portal", ParagraphStyle('U2', parent=body_bold, textColor=colors.HexColor('#22543D')))],
        ], colWidths=[180, 330], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F7FAFC')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E0')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E2E8F0')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 30),
        Table([
            [Paragraph("Statutory Note: Compliant with OM F.9/4/2020-PPD.<br/>Not a retail/wholesale trader.", body_style),
             Paragraph("<b>Ministry of MSME</b><br/>Govt of India<br/><i>[QR & Digital Seal]</i>", stamp_style)]
        ], colWidths=[310, 200])
    ]
    build_pdf(f, el)

# ---------------------------------------------------------------------------
# 6. ERROR DEMO 1: Invalid GSTIN Checksum
# ---------------------------------------------------------------------------
def create_error_gstin():
    f = os.path.join(ERROR_DIR, "ERROR_DEMO_1_Invalid_GSTIN_Luhn_Checksum.pdf")
    el = [
        Paragraph("FORM GST REG-06 — REGISTRATION CERTIFICATE", header_style),
        Paragraph("DEMO DOCUMENT: TAMPERED CHECKSUM TEST FOR BIDSURE", error_badge_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#9B2C2C'), spaceAfter=15),
        Table([
            [Paragraph("Registration Number (GSTIN):", body_bold), Paragraph("<b>07AAECN1234E1ZQ</b> (Tampered 15th Checksum Digit)", ParagraphStyle('E1', parent=body_bold, textColor=colors.HexColor('#9B2C2C')))],
            [Paragraph("Legal Name:", body_bold), Paragraph("Nexora Systems Private Limited", body_style)],
            [Paragraph("Trade Name:", body_bold), Paragraph("Nexora", body_style)],
            [Paragraph("Expected Checksum:", body_bold), Paragraph("'P' (Base-36 Luhn Weighted Sum)", body_style)],
            [Paragraph("Found Checksum:", body_bold), Paragraph("'Q' (Calculated Discrepancy)", body_style)],
            [Paragraph("Expected Platform Result:", body_bold), Paragraph("<b>NON_COMPLIANT -> Disqualification under GFR 173</b>", ParagraphStyle('E2', parent=body_bold, textColor=colors.HexColor('#9B2C2C')))],
        ], colWidths=[180, 330], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FFF5F5')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#FEB2B2')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#FED7D7')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 30),
        Paragraph("<b>EXAMINER NOTE:</b> Uploading this file will demonstrate that BidSure's Base-36 Luhn engine instantly catches mathematical tampering without relying on slow external networks.", body_style)
    ]
    build_pdf(f, el, border_color=colors.HexColor('#9B2C2C'))

# ---------------------------------------------------------------------------
# 7. ERROR DEMO 2: Turnover Triangulation Mismatch
# ---------------------------------------------------------------------------
def create_error_turnover():
    f = os.path.join(ERROR_DIR, "ERROR_DEMO_2_Turnover_Triangulation_Discrepancy.pdf")
    el = [
        Paragraph("CHARTERED ACCOUNTANT TURNOVER CERTIFICATE", header_style),
        Paragraph("DEMO DOCUMENT: 3-WAY TURNOVER TRIANGULATION ERROR", error_badge_style),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#9B2C2C'), spaceAfter=15),
        Table([
            [Paragraph("Entity Name:", body_bold), Paragraph("XYZ Trading Private Limited (PAN: AABCU9603R)", body_style)],
            [Paragraph("Claimed CA Turnover:", body_bold), Paragraph("<b>₹ 9.80 Crores</b>", body_bold)],
            [Paragraph("GSTR-3B Tax Filings Total:", body_bold), Paragraph("<b>₹ 6.10 Crores</b>", body_style)],
            [Paragraph("Audited P&L Filings:", body_bold), Paragraph("₹ 7.20 Crores", body_style)],
            [Paragraph("Calculated Discrepancy:", body_bold), Paragraph("<b>37.76% Variance (Statutory limit is <= 10%)</b>", ParagraphStyle('E3', parent=body_bold, textColor=colors.HexColor('#9B2C2C')))],
            [Paragraph("Expected Platform Result:", body_bold), Paragraph("<b>NON_COMPLIANT -> Critical Financial Anomaly Flagged</b>", ParagraphStyle('E4', parent=body_bold, textColor=colors.HexColor('#9B2C2C')))],
        ], colWidths=[180, 330], style=[
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FFF5F5')),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#FEB2B2')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#FED7D7')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]),
        Spacer(1, 30),
        Paragraph("<b>EXAMINER NOTE:</b> Demonstrates Loophole #12 detection where bidders inflate CA figures while underreporting GST turnover.", body_style)
    ]
    build_pdf(f, el, border_color=colors.HexColor('#9B2C2C'))

def main():
    print("[*] Generating realistic BidSure demo PDF documents...")
    create_pan_card()
    create_gstin()
    create_ca_turnover()
    create_bank_guarantee()
    create_udyam()
    create_error_gstin()
    create_error_turnover()
    print(f"\n[✓] All PDF files created successfully under:\n    {BASE_DIR}")

if __name__ == "__main__":
    main()
