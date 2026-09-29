#!/usr/bin/env python3
"""Calibre oracle comparison (Q-owned, dev-only; never bundled/shipped).

Runs `ebook-convert` (Calibre CLI — GPL-3, USER-INSTALLED, behavioral
reference only, per LICENSES.md) over the corpus and scores its output with
the same metrics as score.py. Run:

    python3 convert/tools/compare_calibre.py

Requires: `ebook-convert` on PATH (is_available() checks), java + epubcheck
in convert/tools. Writes convert/out-calibre/ and prints a per-file table
(validity / fidelity / TOC sanity) plus an aggregate verdict vs the native
pipeline's numbers in convert/BASELINE.md.

Not runnable on this dev box until Calibre is installed (no sudo, no package
in repo) — the script is the reference harness for when it is.
"""
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out-calibre"
CORPUS = ROOT / "corpus" / "src"
EPUBCHECK = ROOT / "tools" / "epubcheck-5.2.1" / "epubcheck.jar"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from score import epub_text, epub_meta, epubcheck, norm  # noqa: E402

TRUTH = {  # same ground truths as score.py (headings included)
    "enc_cp1251.txt": "Глава первая\n\nВойна началась в полдень, когда колокола зазвонили. Старый дом на холме тихо смотрел на дорогу.",
    "enc_utf16le.txt": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.",
    "enc_shift_jis.txt": "第一章\n\n夜明け前に、静かな町に鐘の音が響いた。老人は窓辺に立ち、遠い山を眺めた。",
}


def is_available() -> bool:
    return shutil.which("ebook-convert") is not None


def main() -> int:
    if not is_available():
        print("ebook-convert not found — install Calibre, then re-run.")
        print("The native-pipeline scores to compare against live in convert/BASELINE.md.")
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    import difflib

    rows = []
    for src in sorted(CORPUS.rglob("*")):
        if not src.is_file():
            continue
        ext = src.suffix.lower().lstrip(".")
        if ext not in ("txt", "pdf", "fb2", "mobi", "azw3", "docx"):
            continue
        out = OUT / (src.stem + ".epub")
        r = subprocess.run(
            ["ebook-convert", str(src), str(out), "--enable-heuristics"],
            capture_output=True, text=True, timeout=600,
        )
        if not out.exists() or r.returncode != 0:
            rows.append((src.name, "FAIL", "", "", ""))
            continue
        errs, warns = epubcheck(out)
        meta = epub_meta(out)
        fid = "-"
        if src.name in TRUTH:
            got = norm(epub_text(out))
            want = norm(TRUTH[src.name])
            fid = f"{difflib.SequenceMatcher(None, got, want).ratio():.3f}"
        rows.append((src.name, f"{errs}/{warns}", fid, meta.get("toc_entries", "-"), meta.get("language", "-")))

    print(f"{'file':32} {'epubcheck':>10} {'fid':>6} {'toc':>5} {'lang':>6}")
    for row in rows:
        print(f"{row[0]:32} {row[1]:>10} {row[2]:>6} {str(row[3]):>5} {str(row[4]):>6}")
    print("\nCompare with the native column in convert/BASELINE.md (after) — same corpus.")
    return 0


if __name__ == "__main__":
    sys.exit(main())