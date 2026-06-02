"""
Generates the Agri Funds investor pitch deck (.pptx).

Run:  python pitch-deck/generate_deck.py
Output: pitch-deck/Agri-Funds-Investor-Deck.pptx

Pure python-pptx — no template needed. Each slide carries title, body content,
and the speaker notes go into the slide's notes pane (presenter view).
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# ---- Brand palette --------------------------------------------------------
GREEN_DARK = RGBColor(0x06, 0x5F, 0x46)   # deep emerald
GREEN = RGBColor(0x10, 0xB9, 0x81)        # brand green
GREEN_LIGHT = RGBColor(0xD1, 0xFA, 0xE5)  # mint
INK = RGBColor(0x0F, 0x17, 0x2A)          # near-black slate
SLATE = RGBColor(0x47, 0x55, 0x69)        # body slate
SLATE_LIGHT = RGBColor(0x94, 0xA3, 0xB8)  # muted
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BG = RGBColor(0xF8, 0xFA, 0xFC)           # off-white
AMBER = RGBColor(0xF5, 0x9E, 0x0B)

FONT = "Segoe UI"

# 16:9
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
SW, SH = prs.slide_width, prs.slide_height
BLANK = prs.slide_layouts[6]


def add_slide():
    return prs.slides.add_slide(BLANK)


def fill_bg(slide, color=BG):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    s.line.fill.background()
    s.shadow.inherit = False
    # send to back
    spTree = slide.shapes._spTree
    spTree.remove(s._element)
    spTree.insert(2, s._element)
    return s


def rect(slide, x, y, w, h, color, line=None):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    s.fill.solid()
    s.fill.fore_color.rgb = color
    if line:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    return s


def textbox(slide, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    return tb, tf


def set_run(r, text, size, color, bold=False, italic=False, font=FONT):
    r.text = text
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.bold = bold
    r.font.italic = italic
    r.font.name = font


def para(tf, text, size, color, bold=False, italic=False, space_after=6,
         bullet=False, level=0, align=PP_ALIGN.LEFT, first=False, font=FONT):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = align
    p.level = level
    p.space_after = Pt(space_after)
    p.space_before = Pt(0)
    run = p.add_run()
    set_run(run, ("•  " + text) if bullet else text, size, color, bold, italic, font)
    return p


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def footer(slide, idx, total=10):
    tb, tf = textbox(slide, Inches(0.5), Inches(7.05), Inches(8), Inches(0.4))
    para(tf, "Agri Funds  ·  Transparent Agricultural Capital on Stellar",
         9, SLATE_LIGHT, first=True)
    tb2, tf2 = textbox(slide, Inches(11.6), Inches(7.05), Inches(1.3), Inches(0.4))
    para(tf2, f"{idx} / {total}", 9, SLATE_LIGHT, align=PP_ALIGN.RIGHT, first=True)


def kicker(slide, text, x=Inches(0.85), y=Inches(0.7)):
    # small pill-like label
    tb, tf = textbox(slide, x, y, Inches(6), Inches(0.4))
    para(tf, text.upper(), 12, GREEN, bold=True, first=True)


def title(slide, text, x=Inches(0.85), y=Inches(1.05), w=Inches(11.6), size=34):
    tb, tf = textbox(slide, x, y, w, Inches(1.4))
    para(tf, text, size, INK, bold=True, first=True)


def accent_bar(slide):
    rect(slide, 0, 0, SW, Inches(0.16), GREEN)


def content_slide(idx, kick, ttl, body_items, note, visual=None):
    s = add_slide()
    fill_bg(s)
    accent_bar(s)
    kicker(s, kick)
    title(s, ttl)
    # body
    tb, tf = textbox(s, Inches(0.9), Inches(2.25), Inches(7.5), Inches(4.4))
    for i, item in enumerate(body_items):
        if isinstance(item, tuple):
            head, sub = item
            para(tf, head, 17, GREEN_DARK, bold=True, space_after=2, first=(i == 0))
            para(tf, sub, 13.5, SLATE, space_after=12)
        else:
            para(tf, item, 15, SLATE, bullet=True, space_after=10, first=(i == 0))
    # visual panel
    if visual:
        panel = rect(s, Inches(8.7), Inches(2.25), Inches(3.85), Inches(4.2), WHITE)
        panel.line.color.rgb = GREEN_LIGHT
        panel.line.width = Pt(1.5)
        vtb, vtf = textbox(s, Inches(8.95), Inches(2.45), Inches(3.35), Inches(3.85),
                           anchor=MSO_ANCHOR.MIDDLE)
        for i, line in enumerate(visual):
            if i == 0:
                para(vtf, line, 12, GREEN, bold=True, space_after=10, first=True,
                     align=PP_ALIGN.CENTER)
            else:
                mono = line.startswith("`")
                txt = line.strip("`")
                para(vtf, txt, 11 if mono else 12.5,
                     INK if mono else SLATE, bold=mono,
                     space_after=7, align=PP_ALIGN.CENTER,
                     font="Consolas" if mono else FONT)
    footer(s, idx)
    notes(s, note)
    return s


# ===========================================================================
# COVER
# ===========================================================================
s = add_slide()
fill_bg(s, GREEN_DARK)
# big band
rect(s, 0, 0, SW, Inches(0.22), GREEN)
# logo mark
mark = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.85), Inches(0.9),
                          Inches(0.95), Inches(0.95))
mark.fill.solid()
mark.fill.fore_color.rgb = GREEN
mark.line.fill.background()
mark.shadow.inherit = False
mtf = mark.text_frame
mtf.word_wrap = True
mp = mtf.paragraphs[0]
mp.alignment = PP_ALIGN.CENTER
mr = mp.add_run()
set_run(mr, "🌱", 30, WHITE)

tb, tf = textbox(s, Inches(0.85), Inches(2.55), Inches(11.6), Inches(2.6))
para(tf, "Agri Funds", 60, WHITE, bold=True, space_after=6, first=True)
para(tf, "Transparent Agricultural Capital, Settled on the Blockchain",
     26, GREEN_LIGHT, space_after=18)
para(tf, "Track every dollar from investor to farm and back — verifiable, "
         "real-time, audit-ready.", 16, RGBColor(0xC7, 0xF9, 0xE5))

tb2, tf2 = textbox(s, Inches(0.85), Inches(6.4), Inches(11.6), Inches(0.8))
para(tf2, "Investor Briefing  ·  Prepared for Farming By Faith, ARA Concept & "
          "Agricultural Investors", 13, RGBColor(0x8F, 0xE3, 0xC8), first=True)
notes(s, "Open warm and direct: 'Thank you. In the next ten minutes I'll show "
         "you a working platform that makes agricultural capital fully "
         "transparent — and let you verify it isn't smoke and mirrors, because "
         "the key money movements settle on a public blockchain.'")

# ===========================================================================
# SLIDE 1 — PROBLEM
# ===========================================================================
content_slide(
    1, "The Problem", "Agricultural Investment Runs on Blind Trust",
    [
        ("Money disappears into a black box",
         "Investors wire capital and hope — they can't see where it goes once it leaves their hands."),
        ("Operators reconcile by spreadsheet",
         "Manual, error-prone book-keeping with no shared source of truth between parties."),
        ("Profit splits spark disputes",
         "No transparent, agreed method for how returns are calculated and paid."),
        ("No audit trail when questions arise",
         "When an investor or board asks 'show me,' there is no credible paper trail."),
    ],
    "The bottleneck to unlocking agricultural capital isn't crop risk — it's "
    "opacity and trust. Every agri-investor's real fear is not knowing. That "
    "fear keeps capital on the sidelines.",
    visual=["WHAT INVESTORS SEE TODAY", "Investor", "↓", "`?  ?  ?`", "↓",
            "Farmer", "", "No proof. No trail."]
)

# ===========================================================================
# SLIDE 2 — VISION
# ===========================================================================
content_slide(
    2, "Vision & Opportunity", "Make Every Dollar Traceable, Every Return Provable",
    [
        ("A transparency-first capital platform",
         "Agricultural money flows on a verifiable ledger — not a spreadsheet."),
        ("Investors self-verify",
         "Critical payments settle on a public blockchain investors can independently check."),
        ("Operators get real-time intelligence",
         "Live treasury, liquidity health, and obligations — no more flying blind."),
        ("Trust becomes a property of the system",
         "We don't ask for trust. We prove it, transaction by transaction."),
    ],
    "Our opportunity is to become the financial operating system for "
    "faith-based and impact agri-funds, where transparency is the product "
    "itself — exactly what this audience needs to deploy capital with "
    "confidence.",
    visual=["THE SHIFT", "Opaque spreadsheet", "→", "Live, on-chain", "verified dashboard",
            "", "Trust by proof,", "not by promise"]
)

# ===========================================================================
# SLIDE 3 — PLATFORM OVERVIEW
# ===========================================================================
content_slide(
    3, "Platform Overview", "One Platform, the Full Capital Lifecycle",
    [
        ("Capital intake",
         "Investor onboarding, custodial + non-custodial wallets, funding & investment."),
        ("Treasury & deployment",
         "Central treasury, project allocation, farmer payouts with guardrails."),
        ("Revenue & investor returns",
         "Revenue capture, profit calc, and on-chain profit distributions to investors."),
        ("Transparency layer",
         "Unified ledger, full audit log, PDF statements, and live role-based dashboards."),
    ],
    "This is not a concept deck. Everything on this slide exists and runs "
    "today — a deployed system on Stellar testnet, with admin and investor "
    "roles live.",
    visual=["LIFECYCLE", "Investor", "↓", "Treasury", "↓", "Project → Farmer",
            "↓", "Profit → Investor"]
)

# ===========================================================================
# SLIDE 4 — ARCHITECTURE
# ===========================================================================
content_slide(
    4, "System Architecture", "Built Like a Fintech, Settled Like a Blockchain",
    [
        ("Modern 3-tier, horizontally scalable",
         "React PWA (Vercel) ⇄ secured Express API (Render) ⇄ MongoDB Atlas."),
        ("Blockchain settlement layer",
         "Stellar testnet via Horizon for real, verifiable on-chain payments."),
        ("Financial-grade safety",
         "Idempotent + atomic money operations — no double-spends, no overspends (test-proven)."),
        ("Hardened & tested",
         "Encrypted custody, JWT + revocation, RBAC, rate limiting, CI with automated tests."),
    ],
    "Deliberately boring where it should be — proven, scalable, stateless — "
    "and innovative where it matters: real settlement and bank-grade "
    "transaction correctness.",
    visual=["STACK", "React PWA", "↓ JWT / live SSE", "Express API", "↓",
            "MongoDB   +   Stellar", "ledger        on-chain"]
)

# ===========================================================================
# SLIDE 5 — INVESTOR JOURNEY
# ===========================================================================
content_slide(
    5, "Investor Journey", "From Connect to Confidence",
    [
        ("1 — Sign in your way",
         "Email login, or connect your own Stellar wallet (Freighter / Albedo) — keys stay with you."),
        ("2 — Fund & invest",
         "Capital moves into the treasury as a real on-chain transaction with a ledger hash."),
        ("3 — Watch it deploy live",
         "Real-time dashboards show allocation, projects, and returns as they happen."),
        ("4 — Get paid & verify",
         "Profit distributions are paid on-chain; download a PDF statement; verify on the public ledger."),
    ],
    "Investors never lose sight of their money — and can independently verify "
    "payouts on the public ledger. We don't ask for trust; we prove it.",
    visual=["EVERY PAYOUT", "carries a real", "Stellar tx hash", "",
            "`GABC…hash`", "", "Verifiable by", "anyone, anytime"]
)

# ===========================================================================
# SLIDE 6 — TREASURY
# ===========================================================================
content_slide(
    6, "Treasury & Capital Management", "Real-Time Command Over Capital",
    [
        ("Live treasury intelligence",
         "On-chain balance, capital-utilization %, and available liquidity with a reserve buffer."),
        ("Liquidity health at a glance",
         "Healthy / Tight / Critical badge plus a pending-obligations tracker."),
        ("Historical flow analytics",
         "Inflow/outflow trends and running balance over time."),
        ("Over-allocation is impossible",
         "Treasury debits are atomic and race-free — the system refuses to overspend."),
    ],
    "Operators stop flying blind: runway, obligations, and utilization in real "
    "time — and the platform itself enforces solvency.",
    visual=["LIQUIDITY HEALTH", "", "Healthy", "Tight", "Critical", "",
            "Available = Balance −", "Obligations − Reserve"]
)

# ===========================================================================
# SLIDE 7 — BLOCKCHAIN & TRANSPARENCY
# ===========================================================================
content_slide(
    7, "Blockchain & Transparency", "Verifiable, Not Just Visible",
    [
        ("Real on-chain settlement",
         "Investments and investor distributions submit real Stellar payments returning ledger hashes."),
        ("Self-custody option (SEP-10)",
         "Investors prove wallet ownership without ever exposing a private key."),
        ("Encrypted custody & testnet-locked",
         "Custodial seeds are AES-256-GCM encrypted; mainnet is blocked at startup for safety."),
        ("Complete on-chain + audit trail",
         "Unified ledger and a 16-type activity log capture who did what, when."),
    ],
    "Anyone can paint numbers on a screen. We anchor the critical money "
    "movements to a public blockchain — the difference between visible and "
    "verifiable.",
    visual=["TRANSACTION CARD", "Invest  120 XLM", "status: success", "",
            "`tx: GABC…9F2`", "→ Stellar explorer", "", "Independently checkable"]
)

# ===========================================================================
# SLIDE 8 — REPORTING / COMPLIANCE / AUDIT
# ===========================================================================
content_slide(
    8, "Reporting, Compliance & Audit", "Audit-Ready by Design",
    [
        ("Every action logged",
         "16 audit action types — who, what, when, and outcome — immutably recorded."),
        ("Investor & project rollups",
         "Per-investor and per-project performance, revenue-vs-payout, profit trends."),
        ("One-click investor statements",
         "Downloadable PDF statements per investor; JSON export for analysts."),
        ("Dispute & regulator ready",
         "A complete paper trail — without the paper."),
    ],
    "When an investor, board, or regulator says 'show me,' the answer is one "
    "click — not a week of spreadsheet archaeology.",
    visual=["AUDIT FEED", "CREATE_INVESTOR ✓", "INVESTMENT ✓", "ALLOCATION ✓",
            "DISTRIBUTION_PAID ✓", "STATEMENT_GENERATED ✓", "", "+ PDF statements"]
)

# ===========================================================================
# SLIDE 9 — ROADMAP
# ===========================================================================
content_slide(
    9, "Scalability & Roadmap", "From Testnet MVP to Financial Infrastructure",
    [
        ("Now — proven core",
         "Working transparent capital flows with real on-chain settlement on testnet."),
        ("Next — production money",
         "USDC stablecoin + mainnet; on-chain wallets for projects & farmers; KYC/AML."),
        ("Then — precision & scale",
         "Per-investor→project tranche ledgering, multi-fund support, fiat on/off-ramps, mobile."),
        ("Future — programmable trust",
         "Soroban smart contracts for automated escrow and self-executing distributions."),
    ],
    "We've de-risked the hard part — the working transparent core. The roadmap "
    "is a funded, sequenced path from testnet proof to production financial "
    "infrastructure.",
    visual=["ROADMAP", "Now → proven core", "Next → USDC + mainnet",
            "Then → scale + precision", "Future → smart contracts"]
)

# ===========================================================================
# SLIDE 10 — DEMO SUMMARY & NEXT STEPS
# ===========================================================================
s = add_slide()
fill_bg(s, GREEN_DARK)
rect(s, 0, 0, SW, Inches(0.22), GREEN)
kicker(s, "Demo Summary & Next Steps", x=Inches(0.85), y=Inches(0.75))
tb, tf = textbox(s, Inches(0.85), Inches(1.25), Inches(11.6), Inches(1.2))
para(tf, "Working Today. Ready to Scale With You.", 36, WHITE, bold=True, first=True)

tb2, tf2 = textbox(s, Inches(0.9), Inches(2.55), Inches(7.3), Inches(4.0))
para(tf2, "What you saw", 16, GREEN, bold=True, space_after=8, first=True)
for item in [
    "A live, deployed platform proving transparent agri-capital management end-to-end",
    "Real on-chain settlement of investments and investor distributions",
    "Treasury intelligence, full audit trail, and investor PDF statements",
]:
    para(tf2, item, 14, GREEN_LIGHT, bullet=True, space_after=9)

para(tf2, "The ask", 16, GREEN, bold=True, space_after=8)
for item in [
    "Partnership to onboard the first real projects and investors",
    "Capital to take it to mainnet + USDC, add compliance, and launch the first cohort",
]:
    para(tf2, item, 14, GREEN_LIGHT, bullet=True, space_after=9)

# call card
panel = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.7), Inches(2.55),
                           Inches(3.85), Inches(3.7))
panel.fill.solid()
panel.fill.fore_color.rgb = GREEN
panel.line.fill.background()
panel.shadow.inherit = False
ptf = panel.text_frame
ptf.word_wrap = True
ptf.vertical_anchor = MSO_ANCHOR.MIDDLE
para(ptf, "Let's build the\ntransparent agri-fund\ntogether.", 20, WHITE, bold=True,
     align=PP_ALIGN.CENTER, first=True, space_after=14)
para(ptf, "Founding partners:\nFarming By Faith · ARA Concept", 13,
     RGBColor(0xE6, 0xFF, 0xF6), align=PP_ALIGN.CENTER)
notes(s, "Close with conviction: 'This is real and running today. We're "
         "inviting you to be the founding partners of the transparent agri-fund "
         "— let's put the first real projects on it together.' Then stop and "
         "invite questions.")

tb3, tf3 = textbox(s, Inches(0.85), Inches(6.7), Inches(11.6), Inches(0.5))
para(tf3, "Agri Funds  ·  Built on Stellar  ·  Investor Briefing", 11,
     RGBColor(0x8F, 0xE3, 0xC8), first=True)

# ---- save -----------------------------------------------------------------
out = os.path.join(os.path.dirname(__file__), "Agri-Funds-Investor-Deck.pptx")
prs.save(out)
print(f"Saved: {out}  ({len(prs.slides.__iter__.__self__._sldIdLst)} slides)")
