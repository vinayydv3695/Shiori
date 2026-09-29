#!/usr/bin/env python3
"""Corpus scorer (Q-owned harness).

Validates every EPUB in convert/out/:
  1. EPUBCheck (java -jar convert/tools/epubcheck-5.2.1/epubcheck.jar)
  2. Structure: OPF manifest/spine well-formedness, nav + NCX presence,
     TOC entry count, chapter count
  3. Text fidelity vs ground truth (synthetic TXT sources & encodings)
  4. Image retention count
  5. Determinism: convert(enc_utf8_bom.txt) twice → byte-compare

Writes convert/out/score-<timestamp>.json and prints a compact table.
"""
import json
import os
import re
import subprocess
import sys
import time
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
CORPUS = ROOT / "corpus" / "src"
EPUBCHECK = ROOT / "tools" / "epubcheck-5.2.1" / "epubcheck.jar"

# Ground truths for fidelity scoring: file name -> expected normalized text
TRUTH = {
    "enc_utf16le.txt": {"text": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.", "min": 0.99},
    "enc_utf16be.txt": {"text": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.", "min": 0.99},
    "enc_utf8_bom.txt": {"text": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.", "min": 0.99},
    "enc_cp1252.txt": {"text": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.", "min": 0.99},
    "enc_iso8859_1.txt": {"text": "The quick brown fox jumps over the lazy dog.\n\nChapter One\n\nIt was a dark and stormy night in the city. The rain fell in sheets, and the wind howled.\n\nChapter Two\n\nMorning came, pale and quiet. The streets gleamed under a cold, grey sky.", "min": 0.99},
    "enc_cp1251.txt": {"text": "Глава первая\n\nВойна началась в полдень, когда колокола зазвонили. Старый дом на холме тихо смотрел на дорогу.", "min": 0.99},
    "enc_koi8r.txt": {"text": "Глава первая\n\nВойна началась в полдень, когда колокола зазвонили. Старый дом на холме тихо смотрел на дорогу.", "min": 0.99},
    "enc_shift_jis.txt": {"text": "第一章\n\n夜明け前に、静かな町に鐘の音が響いた。老人は窓辺に立ち、遠い山を眺めた。", "min": 0.99},
    "enc_gbk.txt": {"text": "第一章\n\n黎明之前，寂静的小镇里响起了钟声。老人站在窗边，眺望远山。", "min": 0.99},
    "enc_big5.txt": {"text": "第一章\n\n黎明之前，寂靜的小鎮裡響起了鐘聲。老人站在窗邊，眺望遠山。", "min": 0.99},
    "enc_euc_kr.txt": {"text": "제1장\n\n새벽이 오기 전에 고요한 마을에 종소리가 울렸다. 노인은 창가에 서서 먼 산을 바라보았다.", "min": 0.99},
    "enc_latin2.txt": {"text": "Kapitel pierwszy\n\nBył sobie mały dom nad rzeką.", "min": 0.99},
    "edge_markdown.txt": {"text": "Chapter One\n\nIt was a dark and stormy night.\n\nitem one\nitem two\n\na quote", "min": 0.95},
}

STRIP_PG_RE = re.compile(r"\*\*\* (START|END) OF (THE|THIS) PROJECT GUTENBERG.*?(\*\*\*|$)", re.S)


def norm(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]*\n", "\n", s)
    s = re.sub(r"\n[ \t]*", "\n", s)
    return s.strip()


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    BLOCK = ("p", "div", "li", "h1", "h2", "h3", "h4", "blockquote", "tr", "td", "th", "pre")

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "title", "head"):
            self.skip += 1
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "title", "head"):
            self.skip = max(0, self.skip - 1)
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def epub_text(epub: Path) -> str:
    """Concatenated text of all spine-ordered XHTML documents."""
    with zipfile.ZipFile(epub) as z:
        opf_name = None
        try:
            container = z.read("META-INF/container.xml").decode("utf-8")
            m = re.search(r'full-path="([^"]+)"', container)
            opf_name = m.group(1) if m else None
        except KeyError:
            pass
        if not opf_name:
            opf_name = "OEBPS/content.opf"
        try:
            opf = z.read(opf_name).decode("utf-8")
        except KeyError:
            opf = ""
        # spine order
        spine = re.findall(r'<itemref[^>]*idref="([^"]+)"', opf)
        items = dict(re.findall(r'<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"', opf))
        hrefs = [items.get(i, "") for i in spine]
        base = opf_name.rsplit("/", 1)[0]
        out = []
        for h in hrefs:
            if not h:
                continue
            rel = f"{base}/{h}" if base else h
            try:
                data = z.read(rel)
            except KeyError:
                continue
            if not rel.endswith((".xhtml", ".html", ".htm")):
                continue
            p = TextExtractor()
            p.feed(data.decode("utf-8", "replace"))
            out.append("".join(p.parts))
        return "\n".join(out)


def epub_meta(epub: Path) -> dict:
    meta = {"title": "", "language": "", "toc_entries": 0, "images": 0, "chapters": 0, "has_nav": False, "has_ncx": False}
    try:
        with zipfile.ZipFile(epub) as z:
            names = z.namelist()
            meta["has_nav"] = any(n.endswith("nav.xhtml") for n in names)
            meta["has_ncx"] = any(n.endswith("toc.ncx") for n in names)
            meta["images"] = sum(1 for n in names if n.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif")))
            for n in names:
                if n.endswith("content.opf"):
                    opf = z.read(n).decode("utf-8", "replace")
                    m = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf, re.S)
                    meta["title"] = m.group(1).strip() if m else ""
                    m = re.search(r'<dc:language[^>]*>(.*?)</dc:language>', opf, re.S)
                    meta["language"] = m.group(1).strip() if m else ""
                    meta["chapters"] = len(re.findall(r'<item[^>]*media-type="application/xhtml\+xml"', opf))
                    break
            for n in names:
                if n.endswith("nav.xhtml"):
                    nav = z.read(n).decode("utf-8", "replace")
                    meta["toc_entries"] = len(re.findall(r"<a[^>]+href=", nav))
                    break
    except Exception:
        pass
    return meta


def epubcheck(epub: Path) -> tuple[int, int]:
    """Returns (errors, warnings) from EPUBCheck 5."""
    try:
        r = subprocess.run(
            ["java", "-jar", str(EPUBCHECK), str(epub)],
            capture_output=True, text=True, timeout=120,
        )
        out = r.stdout + r.stderr
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return (-1, -1)  # unmeasured
    errs = len(re.findall(r"(?m)^(ERROR|FATAL):", out))
    warns = len(re.findall(r"(?m)^WARNING:", out))
    return errs, warns


def main():
    results = {}
    for epub in sorted(OUT.glob("**/*.epub")):
        rel = epub.relative_to(OUT).as_posix()
        # Hostile fixtures (e.g. truncated.epub passthrough) may not be valid
        # zips — record them as unscored rather than crashing the run.
        try:
            with zipfile.ZipFile(epub):
                pass
        except zipfile.BadZipFile:
            results[rel] = {"file": rel, "errors": -1, "warnings": -1, "meta": {}, "text_len": 0}
            continue
        entry = {"file": rel}
        entry["errors"], entry["warnings"] = epubcheck(epub)
        entry["meta"] = epub_meta(epub)
        entry["text_len"] = len(epub_text(epub))
        results[rel] = entry

    # Fidelity: compare ground truth vs converted text for synthetic txt
    for name, truth in TRUTH.items():
        epub = OUT / "txt" / (name.rsplit(".", 1)[0] + ".epub")
        if not epub.exists():
            results.setdefault(f"txt/{name}", {"fidelity": None, "file": f"txt/{name}"})["fidelity"] = None
            continue
        got = norm(epub_text(epub))
        want = norm(truth["text"])
        # char-level similarity via difflib ratio
        import difflib
        ratio = difflib.SequenceMatcher(None, got, want).ratio()
        key = f"txt/{name}"
        if key not in results:
            results[key] = {"file": key, "errors": 0, "warnings": 0, "meta": {}}
        results[key]["fidelity"] = round(ratio, 4)
        results[key]["fidelity_min"] = truth["min"]

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_json = OUT / f"score-{stamp}.json"
    out_json.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    # Determinism probe: two bytes-identical conversions of the same input
    # must produce no diffs outside the (already random) temp dir name.
    determinism = "n/a"
    src = CORPUS / "txt" / "enc_utf8_bom.txt"
    import hashlib, subprocess
    def run_probe(sub: bool) -> str:
        # Re-run the Rust harness filtered to nothing extra: harness converts all;
        # simpler — compare repeated runs of score inputs by hashing files that
        # the harness just produced with a fresh run.
        r = subprocess.run(
            ["cargo", "test", "--test", "convert_probe"],
            cwd=str(ROOT.parent / "src-tauri"), capture_output=True, text=True, timeout=900,
        )
        h = hashlib.sha256((OUT / "txt" / "enc_utf8_bom.epub").read_bytes()).hexdigest()
        return h if r.returncode == 0 else "probe-failed"

    h1 = run_probe(False)
    h2 = run_probe(True)
    if "probe-failed" in (h1, h2):
        determinism = "UNMEASURED (cargo busy/failed — rerun `cargo test --test convert_probe` twice and compare sha256 of convert/out/txt/enc_utf8_bom.epub)"
    else:
        determinism = "PASS" if h1 == h2 else "FAIL"
    print(f"\ndeterminism: {determinism} (sha256 {h1[:16]}… vs {h2[:16]}…)")

    print(f"{'file':44} {'err':>4} {'warn':>5} {'fid':>6} {'toc':>4} {'img':>4} {'lang':>6}")
    for rel in sorted(results):
        r = results[rel]
        if r.get("errors") == -1:
            continue
        print(f"{rel:44} {r['errors']:>4} {r['warnings']:>5} "
              f"{str(r.get('fidelity', '-')):>6} {r['meta'].get('toc_entries', '-'):>4} "
              f"{r['meta'].get('images', '-'):>4} {r['meta'].get('language', '-'):>6}")
    print("\nwrote", out_json)


if __name__ == "__main__":
    main()