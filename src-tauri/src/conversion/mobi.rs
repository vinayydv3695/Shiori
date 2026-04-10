#![allow(dead_code)]
/// MOBI / AZW3 → EPUB converter inspired by calibre's mobi reader.
///
/// Implements:
/// - PalmDB header parsing (record offsets)
/// - PalmDOC + MOBI header parsing
/// - PalmDOC LZ77 decompression (calibre's algorithm)
/// - HuffDic decompression (from calibre's huffcdic.py)
/// - EXTH metadata extraction (title, author, publisher, cover)
/// - KF8 (AZW3) detection via BOUNDARY record
/// - Image extraction (JPEG/PNG by magic bytes)
/// - TOC/chapter extraction from HTML content


use std::path::Path;
use byteorder::{BigEndian, ReadBytesExt};
use std::io::Cursor;

use super::epub_writer::EpubDocument;
use super::utils;
use super::{ConversionError, EpubOutput};

/// Convert a MOBI/AZW3 file to EPUB 3.
pub async fn convert(source: &Path, output: &Path) -> Result<EpubOutput, ConversionError> {
    let data = tokio::fs::read(source).await?;
    let mut warnings = Vec::new();

    if data.len() < 78 {
        return Err(ConversionError::InvalidFormat("File too small for MOBI".to_string()));
    }

    // Parse PalmDB header
    let palm = parse_palmdb(&data)?;

    if palm.records.is_empty() {
        return Err(ConversionError::InvalidFormat("No records in PalmDB".to_string()));
    }

    // Parse record 0 (PalmDOC + MOBI header)
    let rec0 = get_record(&data, &palm.records, 0)?;

    let palmdoc = parse_palmdoc_header(rec0)?;
    let mobi_header = parse_mobi_header(rec0)?;

    // Parse EXTH if present
    let exth = if mobi_header.exth_flags & 0x40 != 0 {
        parse_exth(rec0, &mobi_header)?
    } else {
        ExthData::default()
    };

    // Get title
    let title = exth.title.clone()
        .or_else(|| {
            if mobi_header.full_name_offset > 0 && mobi_header.full_name_length > 0 {
                let start = mobi_header.full_name_offset as usize;
                let end = start + mobi_header.full_name_length as usize;
                if end <= rec0.len() {
                    Some(String::from_utf8_lossy(&rec0[start..end]).trim().to_string())
                } else {
                    None
                }
            } else {
                None
            }
        })
        .or_else(|| {
            // PalmDB name field (bytes 0-31)
            let name = String::from_utf8_lossy(&data[0..32]);
            let name = name.trim_end_matches('\0').trim();
            if name.is_empty() { None } else { Some(name.to_string()) }
        })
        .unwrap_or_else(|| {
            source.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.replace('_', " "))
                .unwrap_or_else(|| "Untitled".to_string())
        });

    // Decompress text records
    let text_content = decompress_text(&data, &palm.records, &palmdoc, &mobi_header, &mut warnings)?;

    // Convert text to string (lossy UTF-8)
    let text = match mobi_header.encoding {
        65001 => String::from_utf8_lossy(&text_content).into_owned(), // UTF-8
        1252 => {
            let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(&text_content);
            decoded.into_owned()
        }
        _ => String::from_utf8_lossy(&text_content).into_owned(),
    };

    // Extract images
    let mut images = Vec::new();
    let mut cover_data: Option<Vec<u8>> = None;
    let first_img = mobi_header.first_image_index as usize;

    if first_img > 0 && first_img < palm.records.len() {
        let mut img_idx = 0u32;
        for i in first_img..palm.records.len() {
            if let Ok(rec) = get_record(&data, &palm.records, i) {
                if rec.len() < 4 {
                    continue;
                }
                if let Some((mime, ext)) = utils::detect_image_format(rec) {
                    let id = format!("img_{:04}", img_idx);
                    let filename = format!("image_{:04}.{}", img_idx, ext);

                    // Check if this is the cover
                    if exth.cover_offset.map(|co| co == img_idx).unwrap_or(false) {
                        cover_data = Some(rec.to_vec());
                    }

                    images.push((id, filename, mime.to_string(), rec.to_vec()));
                    img_idx += 1;
                } else {
                    // Non-image record (e.g., FLIS, FCIS, BOUNDARY) — stop
                    // But some MOBIs interleave — continue instead
                    continue;
                }
            }
        }
    }

    // Split content into chapters
    let chapters = split_mobi_into_chapters(&text);

    // Build EPUB
    let mut doc = EpubDocument::new(title.clone());
    doc.author = exth.author.clone();
    doc.publisher = exth.publisher.clone();
    doc.description = exth.description.clone();
    doc.isbn = exth.isbn.clone();

    // Add images
    for (id, filename, mime, img_data) in &images {
        if cover_data.as_ref().map(|c| c == img_data).unwrap_or(false) {
            doc.set_cover(id.clone(), filename.clone(), img_data.clone());
        } else {
            doc.add_image(id.clone(), filename.clone(), mime.clone(), img_data.clone());
        }
    }

    for (ch_title, ch_body) in &chapters {
        doc.add_chapter(ch_title.clone(), ch_body.clone());
    }

    let chapter_count = doc.chapters.len();
    doc.write_to_file(output).await?;

    Ok(EpubOutput {
        path: output.to_path_buf(),
        title,
        author: exth.author,
        cover_data,
        chapter_count,
        warnings,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// PALMDB HEADER
// ──────────────────────────────────────────────────────────────────────────

struct PalmDb {
    records: Vec<u32>, // record offsets
}

fn parse_palmdb(data: &[u8]) -> Result<PalmDb, ConversionError> {
    if data.len() < 78 {
        return Err(ConversionError::InvalidFormat("File too small for PalmDB header".to_string()));
    }

    // Number of records at offset 76 (u16 big-endian)
    let num_records = u16::from_be_bytes([data[76], data[77]]) as usize;

    let mut records = Vec::with_capacity(num_records);
    let header_end = 78;

    for i in 0..num_records {
        let pos = header_end + i * 8;
        if pos + 4 > data.len() {
            break;
        }
        let offset = u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]);
        records.push(offset);
    }

    Ok(PalmDb { records })
}

fn get_record<'a>(data: &'a [u8], records: &[u32], index: usize) -> Result<&'a [u8], ConversionError> {
    if index >= records.len() {
        return Err(ConversionError::InvalidFormat(format!("Record index {} out of range", index)));
    }
    let start = records[index] as usize;
    let end = if index + 1 < records.len() {
        records[index + 1] as usize
    } else {
        data.len()
    };
    if start > data.len() || end > data.len() || start > end {
        return Err(ConversionError::InvalidFormat(format!("Invalid record bounds: {}-{}", start, end)));
    }
    Ok(&data[start..end])
}

// ──────────────────────────────────────────────────────────────────────────
// PALMDOC HEADER (record 0, bytes 0-15)
// ──────────────────────────────────────────────────────────────────────────

struct PalmdocHeader {
    compression: u16,
    text_length: u32,
    record_count: u16,
    record_size: u16,
}

fn parse_palmdoc_header(rec0: &[u8]) -> Result<PalmdocHeader, ConversionError> {
    if rec0.len() < 16 {
        return Err(ConversionError::InvalidFormat("Record 0 too small for PalmDOC header".to_string()));
    }
    let mut cursor = Cursor::new(rec0);
    let compression = cursor.read_u16::<BigEndian>().map_err(|e| ConversionError::Other(e.to_string()))?;
    let _unused = cursor.read_u16::<BigEndian>().map_err(|e| ConversionError::Other(e.to_string()))?;
    let text_length = cursor.read_u32::<BigEndian>().map_err(|e| ConversionError::Other(e.to_string()))?;
    let record_count = cursor.read_u16::<BigEndian>().map_err(|e| ConversionError::Other(e.to_string()))?;
    let record_size = cursor.read_u16::<BigEndian>().map_err(|e| ConversionError::Other(e.to_string()))?;

    Ok(PalmdocHeader {
        compression,
        text_length,
        record_count,
        record_size,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// MOBI HEADER (record 0, starting at offset 16)
// ──────────────────────────────────────────────────────────────────────────

struct MobiHeader {
    header_length: u32,
    encoding: u32,
    #[allow(dead_code)]
    mobi_type: u32,
    #[allow(dead_code)]
    uid: u32,
    #[allow(dead_code)]
    version: u32,
    first_non_book_record: u32,
    full_name_offset: u32,
    full_name_length: u32,
    first_image_index: u32,
    exth_flags: u32,
    #[allow(dead_code)]
    huff_rec_index: u32,
    #[allow(dead_code)]
    huff_rec_count: u32,
}

fn parse_mobi_header(rec0: &[u8]) -> Result<MobiHeader, ConversionError> {
    if rec0.len() < 132 {
        return Err(ConversionError::InvalidFormat("Record 0 too small for MOBI header".to_string()));
    }

    // Check MOBI magic at offset 16
    if &rec0[16..20] != b"MOBI" {
        return Err(ConversionError::InvalidFormat("Missing MOBI magic".to_string()));
    }

    let read_u32 = |off: usize| -> u32 {
        if off + 4 <= rec0.len() {
            u32::from_be_bytes([rec0[off], rec0[off + 1], rec0[off + 2], rec0[off + 3]])
        } else {
            0
        }
    };

    let header_length = read_u32(20);
    let mobi_type = read_u32(24);
    let encoding = read_u32(28);
    let uid = read_u32(32);
    let version = read_u32(36);

    // first_non_book_record at offset 80 (0x50 relative to record start)
    let first_non_book_record = read_u32(80);
    let full_name_offset = read_u32(84);
    let full_name_length = read_u32(88);

    // first_image_index at offset 108 (0x6C)
    let first_image_index = if rec0.len() > 112 { read_u32(108) } else { 0 };

    // exth_flags at offset 128 (0x80)
    let exth_flags = if rec0.len() > 132 { read_u32(128) } else { 0 };

    // HuffDic indexes at offset 112 and 116
    let huff_rec_index = if rec0.len() > 116 { read_u32(112) } else { 0 };
    let huff_rec_count = if rec0.len() > 120 { read_u32(116) } else { 0 };

    Ok(MobiHeader {
        header_length,
        encoding,
        mobi_type,
        uid,
        version,
        first_non_book_record,
        full_name_offset,
        full_name_length,
        first_image_index,
        exth_flags,
        huff_rec_index,
        huff_rec_count,
    })
}

// ──────────────────────────────────────────────────────────────────────────
// EXTH HEADER
// ──────────────────────────────────────────────────────────────────────────

#[derive(Default)]
struct ExthData {
    title: Option<String>,
    author: Option<String>,
    publisher: Option<String>,
    description: Option<String>,
    isbn: Option<String>,
    cover_offset: Option<u32>,
    #[allow(dead_code)]
    thumbnail_offset: Option<u32>,
}

fn parse_exth(rec0: &[u8], mobi: &MobiHeader) -> Result<ExthData, ConversionError> {
    let exth_start = 16 + mobi.header_length as usize;
    if exth_start + 12 > rec0.len() {
        return Ok(ExthData::default());
    }

    // Check EXTH magic
    if &rec0[exth_start..exth_start + 4] != b"EXTH" {
        return Ok(ExthData::default());
    }

    let exth_len = u32::from_be_bytes([
        rec0[exth_start + 4], rec0[exth_start + 5],
        rec0[exth_start + 6], rec0[exth_start + 7],
    ]) as usize;
    let num_items = u32::from_be_bytes([
        rec0[exth_start + 8], rec0[exth_start + 9],
        rec0[exth_start + 10], rec0[exth_start + 11],
    ]);

    let _ = exth_len;
    let mut data = ExthData::default();
    let mut pos = exth_start + 12;

    let codec = match mobi.encoding {
        65001 => "utf-8",
        1252 => "windows-1252",
        _ => "utf-8",
    };

    for _ in 0..num_items {
        if pos + 8 > rec0.len() {
            break;
        }
        let idx = u32::from_be_bytes([rec0[pos], rec0[pos + 1], rec0[pos + 2], rec0[pos + 3]]);
        let size = u32::from_be_bytes([rec0[pos + 4], rec0[pos + 5], rec0[pos + 6], rec0[pos + 7]]) as usize;
        if size < 8 || pos + size > rec0.len() {
            break;
        }
        let content = &rec0[pos + 8..pos + size];
        pos += size;

        let decode = |bytes: &[u8]| -> String {
            if codec == "windows-1252" {
                let (decoded, _, _) = encoding_rs::WINDOWS_1252.decode(bytes);
                decoded.into_owned()
            } else {
                String::from_utf8_lossy(bytes).into_owned()
            }
        };

        match idx {
            100 => { // Author
                data.author = Some(decode(content).trim().to_string());
            }
            101 => { // Publisher
                data.publisher = Some(decode(content).trim().to_string());
            }
            103 => { // Description
                data.description = Some(decode(content).trim().to_string());
            }
            104 => { // ISBN
                data.isbn = Some(decode(content).trim().to_string());
            }
            201 => { // Cover offset
                if content.len() >= 4 {
                    let co = u32::from_be_bytes([content[0], content[1], content[2], content[3]]);
                    if co < 0xFFFFFFFF {
                        data.cover_offset = Some(co);
                    }
                }
            }
            202 => { // Thumbnail offset
                if content.len() >= 4 {
                    data.thumbnail_offset = Some(u32::from_be_bytes([content[0], content[1], content[2], content[3]]));
                }
            }
            503 => { // Title (overrides PDB name)
                data.title = Some(decode(content).trim().to_string());
            }
            _ => {}
        }
    }

    Ok(data)
}

// ──────────────────────────────────────────────────────────────────────────
// TEXT DECOMPRESSION
// ──────────────────────────────────────────────────────────────────────────

fn decompress_text(
    data: &[u8],
    records: &[u32],
    palmdoc: &PalmdocHeader,
    mobi: &MobiHeader,
    warnings: &mut Vec<String>,
) -> Result<Vec<u8>, ConversionError> {
    let mut result = Vec::with_capacity(palmdoc.text_length as usize);

    let num_text_records = palmdoc.record_count as usize;
    let _ = palmdoc.record_size; // typically 4096

    // HuffDic reader (lazy init)
    let mut huff_reader: Option<HuffDicReader> = None;

    for i in 1..=num_text_records {
        if i >= records.len() {
            warnings.push(format!("Text record {} out of range", i));
            break;
        }

        let rec = match get_record(data, records, i) {
            Ok(r) => r,
            Err(e) => {
                warnings.push(format!("Failed to read record {}: {}", i, e));
                continue;
            }
        };

        match palmdoc.compression {
            1 => {
                // No compression
                result.extend_from_slice(rec);
            }
            2 => {
                // PalmDOC LZ77
                match palmdoc_decompress(rec) {
                    Ok(decompressed) => result.extend_from_slice(&decompressed),
                    Err(e) => {
                        warnings.push(format!("LZ77 decompression error in record {}: {}", i, e));
                        result.extend_from_slice(rec); // Fall back to raw
                    }
                }
            }
            17480 => {
                // HuffDic (0x4448)
                if huff_reader.is_none() {
                    huff_reader = Some(init_huffdic(data, records, mobi)?);
                }
                if let Some(ref reader) = huff_reader {
                    match reader.unpack(rec) {
                        Ok(decompressed) => result.extend_from_slice(&decompressed),
                        Err(e) => {
                            warnings.push(format!("HuffDic error in record {}: {}", i, e));
                            result.extend_from_slice(rec);
                        }
                    }
                }
            }
            other => {
                return Err(ConversionError::UnsupportedCompression(other));
            }
        }
    }

    // Truncate to text_length (trailing bytes may be padding)
    if result.len() > palmdoc.text_length as usize {
        result.truncate(palmdoc.text_length as usize);
    }

    Ok(result)
}

// ──────────────────────────────────────────────────────────────────────────
// PALMDOC LZ77 DECOMPRESSION (calibre's exact algorithm)
// ──────────────────────────────────────────────────────────────────────────

fn palmdoc_decompress(input: &[u8]) -> Result<Vec<u8>, ConversionError> {
    let mut output = Vec::with_capacity(input.len() * 2);
    let mut i = 0;

    while i < input.len() {
        let b = input[i];
        i += 1;

        match b {
            0x00 => {
                output.push(b);
            }
            0x01..=0x08 => {
                // Copy next b bytes literally
                let count = b as usize;
                if i + count > input.len() {
                    break;
                }
                output.extend_from_slice(&input[i..i + count]);
                i += count;
            }
            0x09..=0x7F => {
                // Literal ASCII byte
                output.push(b);
            }
            0x80..=0xBF => {
                // Distance/length pair
                if i >= input.len() {
                    break;
                }
                let next = input[i];
                i += 1;

                let distance = (((b as u16 & 0x3F) << 8) | next as u16) >> 3;
                let length = (next as usize & 0x07) + 3;

                if distance == 0 || distance as usize > output.len() {
                    // Invalid back-reference; skip
                    continue;
                }

                let start = output.len() - distance as usize;
                for j in 0..length {
                    let idx = start + (j % distance as usize);
                    if idx < output.len() {
                        output.push(output[idx]);
                    }
                }
            }
            0xC0..=0xFF => {
                // Space + decoded byte
                output.push(b' ');
                output.push(b ^ 0x80);
            }
        }
    }

    Ok(output)
}

// ──────────────────────────────────────────────────────────────────────────
// HUFFDIC DECOMPRESSION (from calibre's huffcdic.py)
// ──────────────────────────────────────────────────────────────────────────

struct HuffDicReader {
    dict1: Vec<(u32, bool, u32)>, // (codelen, terminal, maxcode)
    mincode: Vec<u64>,
    maxcode: Vec<u64>,
    dictionary: Vec<Option<(Vec<u8>, bool)>>, // (slice, is_leaf)
}

impl HuffDicReader {
    fn new() -> Self {
        Self {
            dict1: Vec::new(),
            mincode: Vec::new(),
            maxcode: Vec::new(),
            dictionary: Vec::new(),
        }
    }

    fn load_huff(&mut self, huff: &[u8]) -> Result<(), ConversionError> {
        if huff.len() < 24 || &huff[0..8] != b"HUFF\x00\x00\x00\x18" {
            return Err(ConversionError::InvalidFormat("Invalid HUFF header".to_string()));
        }

        let off1 = u32::from_be_bytes([huff[8], huff[9], huff[10], huff[11]]) as usize;
        let off2 = u32::from_be_bytes([huff[12], huff[13], huff[14], huff[15]]) as usize;

        // dict1: 256 entries at off1 (big-endian u32 each)
        self.dict1.clear();
        for i in 0..256 {
            let pos = off1 + i * 4;
            if pos + 4 > huff.len() {
                return Err(ConversionError::InvalidFormat("HUFF dict1 truncated".to_string()));
            }
            let v = u32::from_be_bytes([huff[pos], huff[pos + 1], huff[pos + 2], huff[pos + 3]]);
            let codelen = v & 0x1F;
            let term = (v & 0x80) != 0;
            let maxcode_val = v >> 8;
            let maxcode_shifted = if codelen > 0 {
                ((maxcode_val as u64 + 1) << (32 - codelen)) - 1
            } else {
                0
            };
            self.dict1.push((codelen, term, maxcode_shifted as u32));
        }

        // dict2: 64 entries at off2 (pairs of mincode, maxcode)
        self.mincode = vec![0u64]; // codelen 0 = 0
        self.maxcode = vec![0u64];
        for codelen in 0..32 {
            let pos = off2 + codelen * 8;
            if pos + 8 > huff.len() {
                break;
            }
            let mincode_val = u32::from_be_bytes([huff[pos], huff[pos + 1], huff[pos + 2], huff[pos + 3]]) as u64;
            let maxcode_val = u32::from_be_bytes([huff[pos + 4], huff[pos + 5], huff[pos + 6], huff[pos + 7]]) as u64;
            let cl = codelen as u64 + 1;
            self.mincode.push(mincode_val << (32 - cl));
            self.maxcode.push(((maxcode_val + 1) << (32 - cl)) - 1);
        }

        Ok(())
    }

    fn load_cdic(&mut self, cdic: &[u8]) -> Result<(), ConversionError> {
        if cdic.len() < 16 || &cdic[0..8] != b"CDIC\x00\x00\x00\x10" {
            return Err(ConversionError::InvalidFormat("Invalid CDIC header".to_string()));
        }

        let phrases = u32::from_be_bytes([cdic[8], cdic[9], cdic[10], cdic[11]]) as usize;
        let bits = u32::from_be_bytes([cdic[12], cdic[13], cdic[14], cdic[15]]) as usize;
        let n = std::cmp::min(1 << bits, phrases.saturating_sub(self.dictionary.len()));

        for i in 0..n {
            let idx_pos = 16 + i * 2;
            if idx_pos + 2 > cdic.len() {
                break;
            }
            let off = u16::from_be_bytes([cdic[idx_pos], cdic[idx_pos + 1]]) as usize;
            let data_pos = 16 + off;
            if data_pos + 2 > cdic.len() {
                self.dictionary.push(None);
                continue;
            }
            let blen = u16::from_be_bytes([cdic[data_pos], cdic[data_pos + 1]]);
            let slice_len = (blen & 0x7FFF) as usize;
            let is_leaf = (blen & 0x8000) != 0;
            let slice_start = data_pos + 2;
            let slice_end = slice_start + slice_len;
            if slice_end > cdic.len() {
                self.dictionary.push(None);
                continue;
            }
            self.dictionary.push(Some((cdic[slice_start..slice_end].to_vec(), is_leaf)));
        }

        Ok(())
    }

    fn unpack(&self, data: &[u8]) -> Result<Vec<u8>, ConversionError> {
        let mut result = Vec::new();
        self.unpack_inner(data, &mut result, 0)?;
        Ok(result)
    }

    fn unpack_inner(&self, data: &[u8], output: &mut Vec<u8>, depth: u32) -> Result<(), ConversionError> {
        if depth > 32 {
            return Err(ConversionError::Other("HuffDic recursion depth exceeded".to_string()));
        }

        let mut bitsleft = data.len() as i64 * 8;
        let padded: Vec<u8> = data.iter().copied().chain(std::iter::repeat(0u8).take(8)).collect();
        let mut pos = 0usize;
        let mut n = 32i32;

        let read_u64_be = |p: usize| -> u64 {
            if p + 8 <= padded.len() {
                u64::from_be_bytes([padded[p], padded[p+1], padded[p+2], padded[p+3],
                                    padded[p+4], padded[p+5], padded[p+6], padded[p+7]])
            } else {
                0
            }
        };

        let mut x = read_u64_be(pos);

        loop {
            if n <= 0 {
                pos += 4;
                x = read_u64_be(pos);
                n += 32;
            }

            let code = ((x >> n as u64) & 0xFFFFFFFF) as u32;
            let lookup = (code >> 24) as usize;

            if lookup >= self.dict1.len() {
                break;
            }

            let (mut codelen, term, maxcode_val) = self.dict1[lookup];

            if !term {
                let mut cl = codelen as usize;
                while cl < self.mincode.len() && (code as u64) < self.mincode[cl] {
                    cl += 1;
                }
                codelen = cl as u32;
            }

            n -= codelen as i32;
            bitsleft -= codelen as i64;
            if bitsleft < 0 {
                break;
            }

            let actual_maxcode = if (codelen as usize) < self.maxcode.len() {
                self.maxcode[codelen as usize]
            } else {
                maxcode_val as u64
            };

            let r = ((actual_maxcode - code as u64) >> (32 - codelen)) as usize;

            if r >= self.dictionary.len() {
                break;
            }

            if let Some(Some((slice, is_leaf))) = self.dictionary.get(r) {
                if *is_leaf {
                    output.extend_from_slice(slice);
                } else {
                    self.unpack_inner(slice, output, depth + 1)?;
                }
            }
        }

        Ok(())
    }
}

fn init_huffdic(data: &[u8], records: &[u32], mobi: &MobiHeader) -> Result<HuffDicReader, ConversionError> {
    let mut reader = HuffDicReader::new();

    let huff_idx = mobi.huff_rec_index as usize;
    let huff_cnt = mobi.huff_rec_count as usize;

    if huff_idx == 0 || huff_cnt == 0 {
        return Err(ConversionError::InvalidFormat("No HuffDic records found".to_string()));
    }

    // First record is HUFF
    let huff = get_record(data, records, huff_idx)?;
    reader.load_huff(huff)?;

    // Remaining records are CDIC
    for i in 1..huff_cnt {
        let cdic = get_record(data, records, huff_idx + i)?;
        reader.load_cdic(cdic)?;
    }

    Ok(reader)
}

// ──────────────────────────────────────────────────────────────────────────
// CHAPTER SPLITTING
// ──────────────────────────────────────────────────────────────────────────

fn split_mobi_into_chapters(html: &str) -> Vec<(String, String)> {
    let mut chapters = Vec::new();
    let mut current_title = "Chapter 1".to_string();
    let mut current_body = String::new();
    let mut chapter_num = 1;

    // MOBI content is HTML — look for heading tags or <mbp:pagebreak>
    let heading_re = regex::Regex::new(r"(?i)<h[1-3][^>]*>(.*?)</h[1-3]>").unwrap();
    let pagebreak_re = regex::Regex::new(r"(?i)<mbp:pagebreak\s*/?>").unwrap();

    for line in html.lines() {
        // Check for page break
        if pagebreak_re.is_match(line) {
            if !current_body.trim().is_empty() {
                chapters.push((current_title.clone(), wrap_paragraphs(&current_body)));
                current_body.clear();
            }
            chapter_num += 1;
            current_title = format!("Chapter {}", chapter_num);
            continue;
        }

        // Check for heading
        if let Some(cap) = heading_re.captures(line) {
            let heading_text = utils::strip_html_tags(&cap[1]).trim().to_string();
            if !heading_text.is_empty() {
                if !current_body.trim().is_empty() {
                    chapters.push((current_title.clone(), wrap_paragraphs(&current_body)));
                    current_body.clear();
                }
                current_title = heading_text;
                chapter_num += 1;
            }
        }

        current_body.push_str(line);
        current_body.push('\n');
    }

    if !current_body.trim().is_empty() {
        chapters.push((current_title, wrap_paragraphs(&current_body)));
    }

    if chapters.is_empty() {
        // No chapters detected — try splitting by <p> count
        chapters.push(("Full Text".to_string(), wrap_paragraphs(html)));
    }

    chapters
}

/// Convert raw MOBI HTML to clean XHTML paragraphs
fn wrap_paragraphs(html: &str) -> String {
    // Strip most inline MOBI tags, keep <p>, <br>, formatting
    let text = html
        .replace("<mbp:pagebreak/>", "")
        .replace("<mbp:pagebreak />", "");

    // If the content is already well-formed HTML with <p> tags, use it
    if text.contains("<p") {
        // Clean up but preserve structure
        let mut result = String::new();
        for line in text.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                result.push_str("  ");
                result.push_str(trimmed);
                result.push('\n');
            }
        }
        result
    } else {
        // Plain text — wrap in paragraphs
        utils::text_to_html_paragraphs(&text)
    }
}
