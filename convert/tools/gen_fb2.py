#!/usr/bin/env python3
"""Generate synthetic FB2 fixtures (Q-owned corpus tooling).

Builds valid FictionBook 2.1 files exercising: nested sections, epigraphs,
poems/stanzas, citations, annotations, a notes body with working links,
base64 inline images, two-title metadata and RTL-ish content.
"""
import base64
import io
import os
import struct
import zlib
import zipfile

OUT = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "fb2")
os.makedirs(OUT, exist_ok=True)

# 1x1 PNG (public-domain trivial artifact, self-generated)
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c62600000000003000200f24c0002"
    "00000049454e44ae426082"
)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_full_fb2():
    return """<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:xlink="http://www.w3.org/1999/xlink">
<description>
  <title-info>
    <genre>sf_history</genre>
    <author><first-name>Synthetic</first-name><last-name>Sample</last-name><id>auth-1</id></author>
    <book-title>The Test Engine</book-title>
    <annotation><p>A synthetic book used to exercise the conversion pipeline.</p></annotation>
    <keywords>test, conversion</keywords>
    <date>2024-01-15</date>
    <coverpage><image xlink:href="#cover.png"/></coverpage>
    <lang>en</lang>
    <src-lang>en</src-lang>
    <translator><first-name>None</first-name><last-name>None</last-name></translator>
    <sequence name="Engine Tests" number="3"/>
  </title-info>
  <document-info>
    <author><nickname>harness</nickname></author>
    <program-used>convert corpus generator</program-used>
    <date value="2024-01-15">2024-01-15</date>
    <id>synthetic-test-engine</id>
    <version>1.0</version>
  </document-info>
  <publish-info>
    <book-name>The Test Engine</book-name>
    <publisher>Synthetic Press</publisher>
    <year>2024</year>
    <isbn>978-0-00-000000-2</isbn>
  </publish-info>
</description>
<body>
  <title><p>The Test Engine</p></title>
  <epigraph>
    <p>All models are wrong.</p>
    <text-author>Some Statistician</text-author>
  </epigraph>
  <section id="ch1">
    <title><p>Chapter One</p></title>
    <p>It was a dark and stormy night when the engine first woke<sup><a l:href="#note1" type="note">[1]</a></sup>.</p>
    <p>The pistons hissed like snakes, and the boiler <emphasis>glowed</emphasis> with a terrible heat.</p>
    <cite><p>Quoted wisdom stands apart from the body.</p></cite>
    <poem id="p1">
      <stanza>
        <v>Hum of the wheels,</v>
        <v>whisper of steam,</v>
      </stanza>
      <stanza>
        <v>carrying cargo,</v>
        <v>carrying dream.</v>
      </stanza>
      <text-author>Engine Poem</text-author>
    </poem>
    <section id="ch1a">
      <title><p>A Sub-Section</p></title>
      <p>Nested sections must become nested TOC entries.</p>
      <image l:href="#img1" alt="A test image"/>
    </section>
  </section>
  <section id="ch2">
    <title><p>Chapter Two</p></title>
    <p>Morning came, pale and quiet. The tables below need care:</p>
    <table>
      <tr><th>Part</th><th>Torque</th></tr>
      <tr><td>A</td><td>100</td></tr>
      <tr><td>B</td><td>250</td></tr>
    </table>
    <empty-line/>
    <p>The machine stopped. <strong>Everything</strong> was silent.</p>
  </section>
</body>
<body name="notes">
  <title><p>Notes</p></title>
  <section id="note1">
    <title><p>1</p></title>
    <p>This is the footnote body for the awakening.</p>
  </section>
</body>
<binary id="cover.png" content-type="image/png">%s</binary>
<binary id="img1" content-type="image/png">%s</binary>
</FictionBook>
""" % (base64.b64encode(PNG_BYTES).decode(), base64.b64encode(PNG_BYTES).decode())


def build_sloppy_fb2():
    """Real-world-sloppy FB2: missing ids, unclosed tags, unknown elements,
    entity soup, CRLF line endings."""
    return (
        '<?xml version="1.0" encoding="windows-1251"?>\n'
        "<FictionBook xmlns=\"http://www.gribuser.ru/xml/fictionbook/2.0\">\n"
        "<description><title-info>"
        "<book-title>Русская Синтетика</book-title>"
        "<author><first-name>Тест</first-name><last-name>Пример</last-name></author>"
        "<lang>ru</lang>"
        "</title-info></description>\r\n"
        "<body>\r\n"
        "  <title><p>Русская Синтетика</p></title>\r\n"
        "  <section><title><p>Глава Первая</p></title>\r\n"
        "    <p>Ночь была тёмной, и фонари дрожали от ветра.</p>\r\n"
        "    <p>Снег падал на пустую площадь вне формат &amp; порядка.</p>\r\n"
        "    <custom-tag>unknown elements must be skipped or mapped</custom-tag>\r\n"
        "  </section>\r\n"
        "  <section><title><p>Глава Вторая</p></title>\r\n"
        "    <p>Утро пришло тихо. &quot;Кавычки&quot; и &apos;апострофы&apos; в порядке.</p>\r\n"
        "  </section>\r\n"
        "</body>\r\n"
        "</FictionBook>\r\n"
    )


def build_body2_fb2():
    """Multiple bodies: main + notes + comments body name=comments."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:xlink="http://www.w3.org/1999/xlink">
<description><title-info>
  <book-title>Two Bodies</book-title>
  <author><first-name>A</first-name><last-name>B</last-name></author>
  <lang>en</lang>
</title-info></description>
<body>
  <title><p>Two Bodies</p></title>
  <section><title><p>Main</p></title>
    <p>Body one refers to a comment<sup><a l:href="#c1" type="comment">[c1]</a></sup>.</p>
  </section>
</body>
<body name="comments">
  <title><p>Comments</p></title>
  <section id="c1"><title><p>c1</p></title><p>Commentary text lives here.</p></section>
</body>
</FictionBook>
"""


def main():
    files = {
        "synthetic_full.fb2": build_full_fb2().encode("utf-8"),
        "sloppy_cp1251.fb2": build_sloppy_fb2().encode("cp1251"),
        "two_bodies.fb2": build_body2_fb2().encode("utf-8"),
    }
    for name, data in files.items():
        path = os.path.join(OUT, name)
        with open(path, "wb") as f:
            f.write(data)
        print("wrote", path)

    # compressed variant: fb2.zip (zip containing one .fb2)
    zip_path = os.path.join(OUT, "synthetic_full.fb2.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("synthetic_full.fb2", files["synthetic_full.fb2"])
    print("wrote", zip_path)

    # gzipped raw variant (real gzip container, 1F 8B)
    gz_path = os.path.join(OUT, "synthetic_full.fb2.gz")
    import gzip as _gzip
    with _gzip.open(gz_path, "wb") as f:
        f.write(files["synthetic_full.fb2"])
    print("wrote", gz_path)


if __name__ == "__main__":
    main()