#!/usr/bin/env python3
"""Generate synthetic TXT fixtures across legacy encodings (Q-owned corpus tooling).

Each file contains a known ground-truth string so fidelity scoring is exact.
All content is original synthetic text (no copyrighted material).
"""
import codecs
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "txt")
os.makedirs(OUT, exist_ok=True)

GROUND_TRUTH = (
    "The quick brown fox jumps over the lazy dog.\n\n"
    "Chapter One\n\n"
    "It was a dark and stormy night in the city.\n"
    "The rain fell in sheets, and the wind howled.\n\n"
    "Chapter Two\n\n"
    "Morning came, pale and quiet.\n"
    "The streets gleamed under a cold, grey sky.\n"
)

RUSSIAN = (
    "Глава первая\n\n"
    "Война началась в полдень, когда колокола зазвонили.\n"
    "Старый дом на холме тихо смотрел на дорогу.\n"
)

GERMAN = "Kapitel eins\n\nEs war einmal ein kleines Dorf am Fluss.\nDer Müller schlief noch, als die Sonne aufging.\n"

JAPANESE = "第一章\n\n夜明け前に、静かな町に鐘の音が響いた。\n老人は窓辺に立ち、遠い山を眺めた。\n"

KOREAN = "제1장\n\n새벽이 오기 전에 고요한 마을에 종소리가 울렸다.\n노인은 창가에 서서 먼 산을 바라보았다.\n"

CHINESE = "第一章\n\n黎明之前，寂静的小镇里响起了钟声。\n老人站在窗边，眺望远山。\n"

CASES = {
    "enc_utf16le.txt": ("utf-16-le", GROUND_TRUTH),
    "enc_utf16be.txt": ("utf-16-be", GROUND_TRUTH),
    "enc_utf8_bom.txt": ("utf-8-sig", GROUND_TRUTH),
    "enc_cp1251.txt": ("cp1251", RUSSIAN),
    "enc_koi8r.txt": ("koi8-r", RUSSIAN),
    "enc_cp1252.txt": ("cp1252", GROUND_TRUTH),
    "enc_iso8859_1.txt": ("iso8859-1", GROUND_TRUTH),
    "enc_shift_jis.txt": ("shift_jis", JAPANESE),
    "enc_gbk.txt": ("gbk", CHINESE),
    "enc_big5.txt": ("big5", "第一章\n\n黎明之前，寂靜的小鎮裡響起了鐘聲。\n老人站在窗邊，眺望遠山。\n"),
    "enc_euc_kr.txt": ("euc_kr", KOREAN),
    "enc_latin2.txt": ("iso8859-2", "Kapitel pierwszy\n\nBył sobie mały dom nad rzeką.\n"),
}

for fname, (enc, text) in CASES.items():
    with open(os.path.join(OUT, fname), "wb") as f:
        f.write(codecs.encode(text, enc))
    print("wrote", fname)

# Structural edge cases (UTF-8)
EDGE = {
    "edge_empty.txt": "",
    "edge_blank_lines.txt": GROUND_TRUTH.replace("\n\n", "\n\n\n\n\n"),
    "edge_crlf.txt": GROUND_TRUTH.replace("\n", "\r\n"),
    "edge_tabs.txt": "Chapter One\n\nCol\tumn\tone\tword\teach.\n",
    "edge_no_final_newline.txt": GROUND_TRUTH.rstrip("\n"),
    "edge_bom_only.txt": "\ufeff",
    "edge_rtf.txt": r"{\rtf1\ansi\deff0 {\fonttbl {\f0 Times New Roman;}}\f0\fs24 Chapter One\par\par It was a dark and stormy night in the city.\par}",
    "edge_stray_control.txt": "\x00\x01\x02Chapter One\x1f\x1e\n\nBody text with form feed\x0c here.\n",
    "edge_huge_line.txt": "word " * 2_000_000 + "\n",  # ~12 MB single line
    "edge_markdown.txt": "# Chapter One\n\nIt was a **dark** and *stormy* night.\n\n- item one\n- item two\n\n> a quote\n",
    "edge_roman_numerals.txt": "I\n\nPrologue text begins here.\n\nII\n\nSecond section text.\n\nIII\n\nThird section text.\n",
}
for fname, text in EDGE.items():
    with open(os.path.join(OUT, fname), "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print("wrote", fname)