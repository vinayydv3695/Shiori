#!/usr/bin/env python3
"""Shiori perf seeder — Agent B (Phase 1).

Builds a deterministic heavy dataset against a COPY of the real library.db
(schema v50, all triggers/indexes in place). Never touches the live DB.

Usage: python3 perf/seed/seed_db.py [--profile small|large]
Output: perf/seed/bench.db (+ perf/seed/files/*.cbz real archives)
"""
import argparse, hashlib, os, random, shutil, sqlite3, struct, sys, zipfile, zlib

APP_DB = os.path.expanduser("~/.local/share/io.github.vinayydv3695.shiori/library.db")
HERE = os.path.dirname(os.path.abspath(__file__))

def tiny_png(w: int, h: int, rgb: tuple) -> bytes:
    """Minimal valid truecolor PNG, solid color."""
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))

def make_cbzs(files_dir: str, n=3, pages=20):
    os.makedirs(files_dir, exist_ok=True)
    made = []
    for i in range(1, n + 1):
        path = os.path.join(files_dir, f"Bench Piece - Chapter {i}.cbz")
        with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
            for p in range(1, pages + 1):
                z.writestr(f"{p:03d}.png", tiny_png(800, 1200, ((i * 40) % 255, (p * 12) % 255, 90)))
        made.append(path)
    return made

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="large", choices=["small", "large"])
    args = ap.parse_args()
    rng = random.Random(42)

    chapters = 1100 if args.profile == "large" else 220
    books_n = 2000 if args.profile == "large" else 300

    dst = os.path.join(HERE, "bench.db")
    for suffix in ("", "-wal", "-shm"):
        try: os.remove(dst + suffix)
        except FileNotFoundError: pass
    shutil.copyfile(APP_DB, dst)

    conn = sqlite3.connect(dst)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")

    cur = conn.cursor()
    # Deterministic clean slate (copy only; real DB untouched).
    for t in ("books_authors", "books_tags", "reading_progress", "books_fts",
              "books", "authors", "tags", "manga_series"):
        cur.execute(f"DELETE FROM {t}")
    cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('books','authors','tags','manga_series')")
    conn.commit()  # python sqlite3 auto-begins; close it before manual BEGIN

    cur.execute("BEGIN IMMEDIATE")

    # --- Authors / tags / publishers -------------------------------------
    authors = [(f"Author {i:03d}",) for i in range(1, 201)]
    cur.executemany("INSERT INTO authors (name) VALUES (?)", authors)
    tags = [(f"Tag{i:02d}",) for i in range(1, 61)] + [("Manga",), ("Seinen",), ("Action",)]
    cur.executemany("INSERT INTO tags (name) VALUES (?)", tags)
    publishers = [f"Publisher {i}" for i in range(1, 41)]
    LOREM = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod "
             "tempor incididunt ut labore et dolore magna aliqua enim ad minim ")

    def insert_book(row):
        cur.execute(
            """INSERT INTO books (uuid, title, sort_title, isbn, publisher, pubdate,
               series, series_index, rating, file_path, file_format, file_size, file_hash,
               cover_path, page_count, word_count, language, added_date, modified_date,
               last_opened, notes, reading_status, domain, is_wishlist, in_trash, duration,
               manga_series_id, anilist_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,?,?)""",
            row)

    # --- The 1000+ chapter series ----------------------------------------
    cur.execute("INSERT INTO manga_series (title, sort_title, status) VALUES ('Bench Piece','Bench Piece','ongoing')")
    series_id = cur.lastrowid
    for n in range(1, chapters + 1):
        status = "completed" if n <= int(chapters * 0.6) else ("reading" if n <= int(chapters * 0.7) else "planning")
        day = n % 28 + 1
        insert_book((
            f"bench-manga-{n:05d}", f"Bench Piece - Chapter {n}", f"Bench Piece {n:05d}",
            None, "Shueisha", f"20{10 + (n % 15):02d}-01-01",
            "Bench Piece", float(n), rng.randint(0, 10),
            f"/bench/manga/Bench Piece - Chapter {n}.cbz", "cbz",
            rng.randint(4_000_000, 18_000_000), hashlib.sha256(f"cbz{n}".encode()).hexdigest(),
            None, 15 + (n % 26), None, "eng",
            f"2025-{day % 12 + 1:02d}-{day:02d}T{8 + n % 10:02d}:00:00",
            f"2025-{day % 12 + 1:02d}-{day:02d}T{9 + n % 10:02d}:00:00",
            f"2026-08-{(n % 28) + 1:02d}T20:00:00" if status != "planning" else None,
            None, status, "manga", series_id, "30013"))
        if n % 200 == 0:
            for tag_id in (61, 62, 63):
                cur.execute("INSERT OR IGNORE INTO books_tags (book_id, tag_id) VALUES (?, ?)", (n, tag_id))

    # reading progress on some manga (current_page mid-chapter)
    for n in range(1, 160, 3):
        cur.execute("""INSERT INTO reading_progress (book_id, current_location, progress_percent, current_page, total_pages, last_read)
                       VALUES (?, ?, ?, ?, ?, '2026-09-01T10:00:00')""",
                    (n, str(15 + (n % 26)), min(95.0, (n % 80) + 5.0), (n % 20) + 1, 15 + (n % 26)))

    # --- Mixed books-domain library --------------------------------------
    fmts = [("epub", 55), ("pdf", 25), ("mobi", 12), ("fb2", 5), ("azw3", 3)]
    fmt_pool = [f for f, w in fmts for _ in range(w)]
    base_id = chapters
    for i in range(1, books_n + 1):
        bid = base_id + i
        fmt = rng.choice(fmt_pool)
        status = rng.choices(["completed", "reading", "planning", "on_hold"], weights=[35, 15, 45, 5])[0]
        desc = (LOREM * rng.randint(3, 12)).strip()
        insert_book((
            f"bench-book-{i:05d}", f"Bench Novel {i:04d} The {'Long ' * (i % 3)}Title of Book {i}",
            f"Bench Novel {i:05d}", f"978-1-{i % 9}{i % 7}{i % 5}{i % 3}-{i % 89:02d}{i % 9}-{(i * 7) % 10}",
            rng.choice(publishers), f"19{60 + i % 60}-0{i % 9 + 1}-15",
            None, None, rng.randint(0, 10),
            f"/bench/books/Bench Novel {i:04d}.{fmt}", fmt,
            rng.randint(300_000, 9_000_000), hashlib.sha256(f"book{i}".encode()).hexdigest(),
            None, rng.randint(80, 900), rng.randint(40_000, 250_000), "eng",
            f"2025-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}T07:00:00",
            f"2025-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}T08:00:00",
            f"2026-07-{(i % 28) + 1:02d}T18:00:00" if status in ("reading", "completed") else None,
            desc, status, "books", None, None))
        # 1-2 authors (each link fires books_authors_ai → FTS reindex, realistic)
        for k in range(rng.randint(1, 2)):
            cur.execute("INSERT OR IGNORE INTO books_authors (book_id, author_id, author_order) VALUES (?,?,?)",
                        (bid, rng.randint(1, 200), k))
        for t in rng.sample(range(1, 61), k=rng.randint(0, 3)):
            cur.execute("INSERT OR IGNORE INTO books_tags (book_id, tag_id) VALUES (?,?)", (bid, t))

    # Control series (50 volumes)
    cur.execute("INSERT INTO manga_series (title, sort_title, status) VALUES ('Control Manga','Control Manga','ongoing')")
    ctl = cur.lastrowid
    for n in range(1, 51):
        bid = base_id + books_n + n
        insert_book((
            f"bench-ctl-{n:03d}", f"Control Manga - Chapter {n}", f"Control Manga {n:03d}",
            None, "Kodansha", "2020-05-01", "Control Manga", float(n), 7,
            f"/bench/manga/Control Manga - Chapter {n}.cbz", "cbz", 8_000_000,
            hashlib.sha256(f"ctl{n}".encode()).hexdigest(), None, 20, None, "eng",
            "2025-06-01T10:00:00", "2025-06-01T10:00:00", None, None, "planning", "manga", ctl, None))

    conn.commit()

    # A few REAL cbz files for reader-path probes
    made = make_cbzs(os.path.join(HERE, "files"))

    cur.execute("PRAGMA optimize")
    conn.commit()
    conn.execute("ANALYZE")
    conn.commit()
    counts = {t: cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
              for t in ("books", "manga_series", "authors", "tags", "books_fts", "reading_progress")}
    conn.close()
    print("seeded:", counts, "| real cbz:", len(made), "| db:", dst)

if __name__ == "__main__":
    main()
