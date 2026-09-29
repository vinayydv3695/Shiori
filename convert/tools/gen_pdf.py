#!/usr/bin/env python3
"""Generate synthetic PDF fixtures (Q-owned corpus tooling).

Builds 4 PDFs over public-domain Gutenberg text:
  novel.pdf        — reflowable novel: title, chapter headings, justified prose,
                     running headers + page-number footers (the classic wrecking crew)
  twocolumn.pdf    — two-column magazine layout with a sidebar
  scan.pdf         — image-only pages (no text layer) → probes fixed-layout fallback
  tables.pdf       — simple text tables with ruled lines
All content from Project Gutenberg (public domain).
"""
import io
import os
import re

from fpdf import FPDF
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "pdf")
os.makedirs(OUT, exist_ok=True)
BASE = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "txt")

SERIF = "/usr/share/fonts/liberation/LiberationSerif-Regular.ttf"
SERIF_BOLD = "/usr/share/fonts/liberation/LiberationSerif-Bold.ttf"
SERIF_ITALIC = "/usr/share/fonts/liberation/LiberationSerif-Italic.ttf"
SANS = "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"
SANS_BOLD = "/usr/share/fonts/liberation/LiberationSans-Bold.ttf"


def load_pg(book: str, start: int, count: int) -> list[str]:
    """Return `count` paragraphs of public-domain prose starting at index `start`."""
    with open(os.path.join(BASE, book), encoding="utf-8", errors="replace") as f:
        text = f.read()
    cut = text.find("*** END OF THE PROJECT GUTENBERG")
    if cut != -1:
        text = text[:cut]
    paras = [p.strip() for p in re.split(r"\n\s*\n", text)
             if p.strip() and (len(p.strip()) > 30 or re.match(r"^(chapter|the end)\b", p.strip(), re.I))]
    return paras[start:start + count]


def setup_fonts(pdf):
    pdf.add_font("serif", "", SERIF)
    pdf.add_font("serif", "B", SERIF_BOLD)
    pdf.add_font("serif", "I", SERIF_ITALIC)
    pdf.add_font("sans", "", SANS)
    pdf.add_font("sans", "B", SANS_BOLD)


class NovelPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("serif", "I", 9)
            self.cell(0, 6, "The Test Novel — A Conversion Fixture", align="C")
            self.ln(8)

    def footer(self):
        if self.page_no() > 1:
            self.set_y(-15)
            self.set_font("serif", "", 9)
            self.cell(0, 10, str(self.page_no()), align="C")


def novel():
    pdf = NovelPDF(format="A5")
    setup_fonts(pdf)
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_font("serif", "B", 24)
    pdf.cell(0, 12, "The Test Novel", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("serif", "", 12)
    pdf.ln(4)
    pdf.cell(0, 8, "by Synthetic Author", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    paras = load_pg("pg84.txt", 40, 600)
    chapter_re = re.compile(r"^(chapter\s+(?:[ivxlc]+\.?|\d+\.?|the end\.?)|the end\.)", re.I)
    n_ch = 0
    for p in paras:
        if chapter_re.match(p.strip()):
            n_ch += 1
            if pdf.page_no() > 1:
                pdf.add_page()
            pdf.set_font("serif", "B", 16)
            pdf.multi_cell(0, 8, p.strip())
            pdf.ln(4)
            pdf.set_font("serif", "", 10.5)
        else:
            pdf.multi_cell(0, 5.2, p.strip())
            pdf.ln(1.5)
        if n_ch >= 6:
            break
    pdf.output(os.path.join(OUT, "novel.pdf"))
    print("wrote novel.pdf with", n_ch, "chapters")


def twocolumn():
    pdf = FPDF(format="A4")
    setup_fonts(pdf)
    pdf.set_auto_page_break(False)
    paras = load_pg("pg1661.txt", 60, 120)
    col_w = 82
    gutter = 12
    top = 30
    page = 0
    pdf.add_page()
    for i in range(0, len(paras), 2):
        page += 1
        if page > 1:
            pdf.add_page()
        pdf.set_font("sans", "B", 14)
        pdf.set_xy(10, 12)
        pdf.cell(0, 8, "The Two-Column Review  —  Issue %d" % page, align="C")
        pdf.line(10, 22, 200, 22)
        # left column
        y = top
        pdf.set_font("serif", "I", 9)
        for p in paras[i:i + 2]:
            pdf.set_xy(12, y)
            pdf.multi_cell(col_w, 4.6, p.strip())
            y = pdf.get_y()
        # right column
        y = top
        for p in paras[i:i + 2]:
            pdf.set_xy(12 + col_w + gutter, y)
            pdf.multi_cell(col_w, 4.6, p.strip())
            y = pdf.get_y()
        # sidebar
        pdf.set_fill_color(240, 240, 240)
        pdf.rect(12 + 2 * (col_w + gutter), top, 56, 100, "F")
        pdf.set_xy(12 + 2 * (col_w + gutter) + 4, top + 4)
        pdf.set_font("sans", "B", 10)
        pdf.multi_cell(48, 5, "SIDEBAR\n\nShort boxed notes that a naive linear reader would splice into the columns.")
    pdf.output(os.path.join(OUT, "twocolumn.pdf"))
    print("wrote twocolumn.pdf with", page, "pages")


def scan():
    """Image-only pages (no text layer)."""
    paras = ["It was a dark and stormy night when the train arrived.",
             "The station clock read half past eleven, and no one was about.",
             "A single lamp burned above the ticket window, casting long shadows.",
             "She folded the telegram twice and slipped it into her coat.",
             "Beyond the tracks, the hills swallowed the last light of day."]
    for pg in range(3):
        img = Image.new("RGB", (1240, 1754), "#f5f1e6")
        d = ImageDraw.Draw(img)
        font = ImageFont.truetype(SERIF, 42)
        font_big = ImageFont.truetype(SERIF_BOLD, 72)
        if pg == 0:
            d.text((400, 300), "THE SCANNED BOOK", fill="#222", font=font_big)
        for j, p in enumerate(paras):
            d.text((160, 500 + j * 160), p, fill="#333", font=font)
        tmp = os.path.join(OUT, f"_scan_pg{pg}.png")
        img.save(tmp, format="PNG")
        pdf = FPDF(unit="mm", format=(210, 297))
        pdf.add_page()
        pdf.image(tmp, 0, 0, 210, 297)
        os.remove(tmp)
        pdf.output(os.path.join(OUT, f"scan_page{pg + 1}.pdf"))
    print("wrote scan_page1..3.pdf (image-only)")


def tables():
    pdf = FPDF(format="A4")
    setup_fonts(pdf)
    pdf.add_page()
    pdf.set_font("serif", "B", 16)
    pdf.cell(0, 10, "Quarterly Results", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("serif", "", 10)
    header = ["Region", "Q1", "Q2", "Q3", "Q4", "Total"]
    rows = [["North", "12", "15", "14", "18", "59"],
            ["South", "8", "9", "11", "10", "38"],
            ["East", "22", "21", "25", "24", "92"],
            ["West", "17", "18", "19", "21", "75"],
            ["Total", "59", "63", "69", "73", "264"]]
    col_w = 28
    for h in header:
        pdf.cell(col_w, 8, h, border=1, align="C")
    pdf.ln()
    for r in rows:
        for c in r:
            pdf.cell(col_w, 8, c, border=1, align="C")
        pdf.ln()
    pdf.ln(6)
    pdf.multi_cell(0, 6, "The table above must survive conversion as a real table, not joined prose.")
    pdf.output(os.path.join(OUT, "tables.pdf"))
    print("wrote tables.pdf")


if __name__ == "__main__":
    novel()
    twocolumn()
    scan()
    tables()