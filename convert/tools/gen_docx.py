#!/usr/bin/env python3
"""Generate a minimal but valid DOCX (Q-owned corpus tooling).

Built from the OPC spec directly: [Content_Types].xml, _rels/.rels,
word/document.xml with a few paragraphs and one heading.
"""
import os
import zipfile

OUT = os.path.join(os.path.dirname(__file__), "..", "corpus", "src", "docx")
os.makedirs(OUT, exist_ok=True)

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOC = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>The Synthetic Document</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
<w:p><w:r><w:t>It was a dark and stormy night in the city.</w:t></w:r></w:p>
<w:p><w:r><w:t>The rain fell in sheets, and the wind howled.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter Two</w:t></w:r></w:p>
<w:p><w:r><w:t>Morning came, pale and quiet.</w:t></w:r></w:p>
</w:body>
</w:document>"""


def main():
    path = os.path.join(OUT, "synthetic.docx")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", DOC)
    print("wrote", path)


if __name__ == "__main__":
    main()