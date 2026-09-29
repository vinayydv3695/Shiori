#!/usr/bin/env python3
"""Generate synthetic MOBI fixtures (Q-owned corpus tooling).

Writes a minimal-but-valid PalmDB / PalmDOC / MOBI7 file: PDB header,
record 0 (PalmDOC + MOBI headers + EXTH with title/author), one text record
(PalmDOC LZ77), no DRM. Enough for the Shiori and Calibre readers to open it.
"""
import os
import re
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "mobi")
os.makedirs(OUT, exist_ok=True)
BASE = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "txt")

TITLE = "The Test Engine"
AUTHOR = "Synthetic Author"


def palmdoc_compress(data: bytes) -> bytes:
    """PalmDOC LZ77: copies of 1-10 bytes back 1-2048; literal bytes 0x01..0xFF."""
    out = bytearray()
    i = 0
    n = len(data)
    while i < n:
        best_dist = best_len = 0
        window_start = max(0, i - 2048)
        # greedy search
        max_len = min(10, n - i)
        for l in range(max_len, 0, -1):
            for d in range(1, min(2048, i - window_start) + 1):
                # ensure back-copy stays within file
                cand = i - d
                if cand >= 0 and data[cand:cand + l] == data[i:i + l]:
                    best_dist, best_len = d, l
                    break
            if best_len:
                break
        if best_len >= 3:
            dist = best_dist - 1
            length = best_len - 1
            out.append(0x00)
            out.append((dist >> 8) & 0xFF)
            out.append(dist & 0xFF)
            out.append((length << 4) | (best_len - 3))  # packed length nibble
            i += best_len
        else:
            out.append(0x01 if data[i] == 0x00 else data[i])
            i += 1
    return bytes(out)


def build_mobi(text: str) -> bytes:
    payload = text.encode("utf-8")
    text_len = len(payload)

    # --- Palmdoc header (16 bytes) — compression=1 (none; LZ77/HUFF paths are
    # covered by the repo's real-world MOBI unit tests) ---
    palmdoc = struct.pack(">HH", 1, 0) + struct.pack(">I", text_len) + struct.pack(">HH", 3, 4096) + struct.pack(">HH", 0, 0)

    # --- EXTH block (title=100, author=101, description=103) ---
    def exth_rec(t, data):
        return struct.pack(">II", t, len(data) + 8) + data

    title_b = TITLE.encode("utf-8")
    author_b = AUTHOR.encode("utf-8")
    desc_b = b"A synthetic conversion fixture."
    exth_records = exth_rec(100, title_b) + exth_rec(101, author_b) + exth_rec(103, desc_b)
    exth = b"EXTH" + struct.pack(">II", 12 + len(exth_records), 3) + exth_records
    exth += b"\x00" * ((4 - len(exth) % 4) % 4)

    # --- MOBI header (offsets per the public MOBI format spec, relative to "MOBI") ---
    h = bytearray()
    h += b"MOBI"
    h += struct.pack(">I", 0xE8)          # 0x04 header length (232)
    h += struct.pack(">I", 2)             # 0x08 mobi type: BOOK
    h += struct.pack(">I", 65001)         # 0x0C text encoding UTF-8
    h += struct.pack(">I", 0)             # 0x10 unique id (0 = deterministic)
    h += struct.pack(">I", 0xFFFFFFFF)    # 0x14 file version
    h += b"\x00" * 40                      # 0x18 ortho, 0x1C inflect, 0x20 names, 0x24 keys, 0x28..0x3C extra0..extra5
    h += struct.pack(">I", 1)             # 0x40 first non-book index (no index records)
    h += struct.pack(">I", 0xFFFFFFFF)    # 0x44 full name offset (in EXTH)
    h += struct.pack(">I", 0xFFFFFFFF)    # 0x48 full name length
    h += struct.pack(">I", 0)             # 0x4C locale (en-US)
    h += struct.pack(">I", 0)             # 0x50 input language
    h += struct.pack(">I", 0)             # 0x54 output language
    h += struct.pack(">I", 0)             # 0x58 min version
    h += struct.pack(">I", 0xFFFFFFFF)    # 0x5C first image index (none)
    h += struct.pack(">I", 0xFFFFFFFF)    # 0x60 huffman record offset (none)
    h += struct.pack(">I", 0)             # 0x64 huffman record count
    h += struct.pack(">I", 0)             # 0x68 huffman table offset
    h += struct.pack(">I", 0)             # 0x6C huffman table length
    h += struct.pack(">I", 0x40)          # 0x70 EXTH flags: EXTH present
    h += b"\x00" * 32                      # 0x74 unknown (8 fields)
    h += struct.pack(">I", 0)             # 0x94 unknown
    h += struct.pack(">I", 0)             # 0x98 DRM offset
    h += struct.pack(">I", 0)             # 0x9C DRM count
    h += struct.pack(">I", 0)             # 0xA0 DRM size
    h += struct.pack(">I", 0)             # 0xA4 DRM flags
    h += struct.pack(">HH", 1, 1)         # 0xA8 first/last content record (record 1 only)
    h += struct.pack(">I", 1)             # 0xAC unused
    h += struct.pack(">I", 0)             # 0xB0 FCIS record
    h += struct.pack(">I", 1)             # 0xB4 unused
    h += struct.pack(">I", 0)             # 0xB8 FLIS record
    h += struct.pack(">I", 0)             # 0xBC unused
    h += b"\x00" * (0xE8 - len(h))         # pad to full 232-byte header
    assert len(h) == 0xE8, len(h)

    # Full name lives inside record 0 right after EXTH (mobi crate requires a
    # real name_offset/name_length; KindleGen real files do the same).
    name_off = 16 + 0xE8 + len(exth)
    h[0x44:0x48] = struct.pack(">I", name_off)
    h[0x48:0x4C] = struct.pack(">I", len(title_b))
    rec0 = palmdoc + bytes(h) + exth + title_b
    rec0 += b"\x00" * ((4 - len(rec0) % 4) % 4)
    rec1 = payload

    # --- PalmDB file ---
    db_name = TITLE.encode("latin-1", "replace")[:31]
    pdb = bytearray()
    pdb += db_name + b"\x00" * (32 - len(db_name))
    pdb += struct.pack(">HH", 0, 0)             # attributes, version
    pdb += b"\x00" * 8                          # creation + modification dates (0 = deterministic)
    pdb += b"\x00" * 4                          # last backup date
    pdb += struct.pack(">I", 0)                 # modification number
    pdb += struct.pack(">I", 0)                 # app info offset
    pdb += struct.pack(">I", 0)                 # sort info offset
    pdb += b"BOOK"
    pdb += b"MOBI"
    pdb += struct.pack(">I", 0)                 # unique id seed
    pdb += struct.pack(">I", 0)                 # next record list id
    pdb += struct.pack(">H", 2)                 # record count
    # Record-info list, then the 2-byte "extra bytes" field (the mobi crate
    # expects it here; real KindleGen files have it too), then record 0.
    rec0_off = len(pdb) + 8 * 2 + 2
    rec1_off = rec0_off + len(rec0)
    for off in (rec0_off, rec1_off):
        # Ambidextrous record entry, valid for BOTH PalmDB layouts:
        #  - mobi crate (offset:u32, id:u32)   → off=off, id=off
        #  - standard  (id:u32, attr:u8, off:u24) → id=off, attr=0, off=off
        pdb += off.to_bytes(4, "big") + b"\x00" + off.to_bytes(3, "big")
    pdb += b"\x00\x00"                   # extra bytes field
    pdb += rec0 + rec1
    return bytes(pdb)


def main():
    with open(os.path.join(BASE, "pg84.txt"), encoding="utf-8") as f:
        text = f.read()
    cut = text.find("*** START OF THE PROJECT GUTENBERG")
    start = text.find("*** START OF THE PROJECT GUTENBERG", cut + 10)
    if start == -1:
        start = 200
    body = text[start:start + 30000]
    # make it suitable: strip Gutenberg header/footer noise into clean chapters
    body = re.sub(r"(\*\*\*.*?\*\*\*)", "", body, flags=re.S)
    mobi = build_mobi(body.strip())
    path = os.path.join(OUT, "synthetic.mobi")
    with open(path, "wb") as f:
        f.write(mobi)
    print("wrote", path, len(mobi), "bytes")


if __name__ == "__main__":
    main()