"""
One-page investor leave-behind (A4 portrait, real PDF).

Run:  python pitch-deck/generate_onepager.py
Out:  pitch-deck/Agri-Funds-One-Pager.pdf
"""

from fpdf import FPDF
import os

# Brand palette (RGB)
GREEN_DARK = (6, 95, 70)
GREEN = (16, 185, 129)
GREEN_LIGHT = (209, 250, 229)
INK = (15, 23, 42)
SLATE = (71, 85, 105)
SLATE_LIGHT = (148, 163, 184)
WHITE = (255, 255, 255)
MINT_BG = (240, 253, 249)

PDF_W = 210  # A4 mm
MARGIN = 14


class OnePager(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*SLATE_LIGHT)
        self.cell(0, 5, "Agri Funds  -  Transparent Agricultural Capital, Settled on Stellar  -  "
                        "Investor Briefing", align="C")


pdf = OnePager(orientation="P", unit="mm", format="A4")
pdf.set_auto_page_break(auto=False)
pdf.add_page()
pdf.set_margins(MARGIN, MARGIN, MARGIN)


def rect(x, y, w, h, color):
    pdf.set_fill_color(*color)
    pdf.rect(x, y, w, h, style="F")


def text(x, y, s, size, color, style="", w=None, h=4.6, align="L"):
    pdf.set_xy(x, y)
    pdf.set_font("Helvetica", style, size)
    pdf.set_text_color(*color)
    if w is None:
        w = PDF_W - 2 * MARGIN
    pdf.multi_cell(w, h, s, align=align)


# ---- Header band ----------------------------------------------------------
rect(0, 0, PDF_W, 34, GREEN_DARK)
rect(0, 34, PDF_W, 1.5, GREEN)
# logo tile
rect(MARGIN, 8, 12, 12, GREEN)
pdf.set_xy(MARGIN, 9.5)
pdf.set_font("Helvetica", "B", 14)
pdf.set_text_color(*WHITE)
pdf.cell(12, 9, "AF", align="C")

text(MARGIN + 16, 8.5, "Agri Funds", 22, WHITE, "B", w=150)
text(MARGIN + 16, 19, "Transparent Agricultural Capital, Settled on the Blockchain",
     10.5, GREEN_LIGHT, "", w=150)
text(MARGIN + 16, 25, "Prepared for Farming By Faith, ARA Concept & Agricultural Investors",
     8.5, (143, 227, 200), "", w=150)

y = 42

# ---- One-liner ------------------------------------------------------------
text(MARGIN, y, "A transparency-first platform that tracks every dollar of agricultural "
                "capital - from investor to treasury to farm and back as profit - with the "
                "critical payments settled on the Stellar blockchain so investors can "
                "independently verify them.", 10.5, SLATE, "", h=5)
y += 22

# ---- The Problem / The Solution (two columns) -----------------------------
col_w = (PDF_W - 2 * MARGIN - 6) / 2
left_x = MARGIN
right_x = MARGIN + col_w + 6

# headings
pdf.set_draw_color(*GREEN)
text(left_x, y, "THE PROBLEM", 10, GREEN_DARK, "B", w=col_w)
text(right_x, y, "THE SOLUTION", 10, GREEN_DARK, "B", w=col_w)
y += 6

problems = [
    "Investors wire capital into a black box - no visibility once it leaves.",
    "Operators reconcile by spreadsheet; no shared source of truth.",
    "Profit splits spark disputes; no transparent method.",
    "No audit trail when investors or boards ask 'show me.'",
]
solutions = [
    "Critical money flows settle on a public blockchain - verifiable hashes.",
    "Unified ledger + real-time dashboards replace spreadsheets.",
    "Automated, share-based profit distribution engine.",
    "Full 16-type audit log + one-click investor PDF statements.",
]

yy_start = y
for p in problems:
    pdf.set_xy(left_x, y)
    pdf.set_font("Helvetica", "", 8.8)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(col_w, 4.2, "-  " + p, align="L")
    y = pdf.get_y() + 1.5
y_left_end = y

y = yy_start
for sblt in solutions:
    pdf.set_xy(right_x, y)
    pdf.set_font("Helvetica", "", 8.8)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(col_w, 4.2, "-  " + sblt, align="L")
    y = pdf.get_y() + 1.5

y = max(y_left_end, y) + 4

# ---- Fund flow strip ------------------------------------------------------
rect(MARGIN, y, PDF_W - 2 * MARGIN, 16, MINT_BG)
text(MARGIN + 3, y + 2.5, "HOW CAPITAL FLOWS", 8.5, GREEN_DARK, "B", w=170)
pdf.set_xy(MARGIN + 3, y + 7)
pdf.set_font("Helvetica", "B", 9.5)
pdf.set_text_color(*INK)
pdf.cell(0, 5, "Investor  >  Treasury  >  Project  >  Farmer  ...  Revenue  >  "
               "Profit Distribution  >  Investor")
text(MARGIN + 3, y + 11.5, "Investments and investor distributions settle on-chain (real ledger "
     "hashes). Allocations & farmer payouts are guarded internal book-keeping.",
     7.5, SLATE, "I", w=180)
y += 20

# ---- Key capabilities (grid) ----------------------------------------------
text(MARGIN, y, "WHAT'S BUILT TODAY", 10, GREEN_DARK, "B")
y += 6

caps = [
    ("Blockchain settlement", "Real Stellar payments with verifiable tx hashes."),
    ("Dual custody", "Custodial wallets + non-custodial connect (Freighter/Albedo, SEP-10)."),
    ("Treasury intelligence", "Live balance, liquidity health, utilization, obligations."),
    ("Financial-grade safety", "Idempotent + atomic money ops - no double/overspends (tested)."),
    ("Profit distributions", "Preview, generate, and pay investor returns on-chain."),
    ("Audit & reporting", "Full activity log, rollups, profit trends, PDF statements."),
    ("Security", "Encrypted seeds, JWT + revocation, RBAC, rate limiting, CI."),
    ("Real-time PWA", "Installable app with live SSE updates across dashboards."),
]
cw = (PDF_W - 2 * MARGIN - 6) / 2
ch = 13
for i, (h, d) in enumerate(caps):
    cx = MARGIN + (i % 2) * (cw + 6)
    if i % 2 == 0 and i > 0:
        y += ch + 2
    cy = y
    rect(cx, cy, cw, ch, WHITE)
    pdf.set_draw_color(*GREEN_LIGHT)
    pdf.set_line_width(0.3)
    pdf.rect(cx, cy, cw, ch)
    rect(cx, cy, 1.3, ch, GREEN)
    text(cx + 4, cy + 1.8, h, 9, INK, "B", w=cw - 6, h=4)
    text(cx + 4, cy + 6.2, d, 7.6, SLATE, "", w=cw - 6, h=3.4)
y += ch + 4

# ---- Roadmap + Ask --------------------------------------------------------
rmw = PDF_W - 2 * MARGIN
text(MARGIN, y, "ROADMAP", 10, GREEN_DARK, "B")
y += 5.5
text(MARGIN, y, "Now: proven transparent core (testnet)   >   Next: USDC + mainnet, "
     "on-chain projects/farmers, KYC/AML   >   Then: per-investor tranche ledgering, "
     "multi-fund, fiat ramps   >   Future: Soroban smart-contract distributions.",
     8.8, SLATE, "", h=4.3)
y += 16

# Ask band
rect(MARGIN, y, rmw, 20, GREEN_DARK)
text(MARGIN + 4, y + 3, "THE ASK", 9, GREEN_LIGHT, "B", w=rmw - 8)
text(MARGIN + 4, y + 7.5, "Partnership to onboard the first real projects and investors, and "
     "capital to take the platform to mainnet + USDC, add compliance, and launch the first "
     "cohort with Farming By Faith & ARA Concept as founding partners.",
     9, WHITE, "", w=rmw - 8, h=4.3)

out = os.path.join(os.path.dirname(__file__), "Agri-Funds-One-Pager.pdf")
pdf.output(out)
print("Saved:", out)
