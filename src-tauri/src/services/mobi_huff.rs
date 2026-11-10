//! HUFF/CDIC (Huffman) decompression for MOBI text records.
//!
//! The `mobi` crate 0.6.0 cannot decode Huffman-compressed books
//! (`record.rs:75` → `panic!("Huff compression is currently not supported")`).
//! This module is a vendored copy of the crate's own (dead, unused) huff
//! decoder — `load_huff` / `load_cdic` / `unpack` / `decompress` — with the
//! crate's `Reader` helper inlined as `MobiHuffReader`. License: MIT/Apache-2.0
//! (mobi-rs). Verified against a real HUFF/CDIC book (The Briar Club, 3.4 MB,
//! 307 records): produces clean HTML.
use std::io::{self, Read};

#[derive(Debug, Default, Clone)]
/// Helper struct for reading header values from content.
/// Only allows forward reads.
pub(crate) struct MobiHuffReader<R> {
    reader: R,
    position: usize,
}

impl<R: std::io::Read> MobiHuffReader<R> {
    pub(crate) fn new(content: R) -> MobiHuffReader<R> {
        MobiHuffReader {
            reader: content,
            position: 0,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn read_to_end(&mut self) -> io::Result<Vec<u8>> {
        let mut first_buf = vec![0; self.position];
        self.reader.read_to_end(&mut first_buf)?;
        self.position = first_buf.len();
        Ok(first_buf)
    }

    pub(crate) fn read_exact(&mut self, buf: &mut [u8]) -> io::Result<()> {
        self.reader.read_exact(buf)?;
        self.position += buf.len();
        Ok(())
    }

    #[inline]
    pub(crate) fn set_position(&mut self, p: usize) -> io::Result<()> {
        debug_assert!(p >= self.position, "{}, {}", p, self.position);

        if p >= self.position {
            std::io::copy(
                &mut self.reader.by_ref().take((p - self.position) as u64),
                &mut io::sink(),
            )?;
            self.position = p;
        }

        Ok(())
    }

    #[inline]
    pub(crate) fn read_u64_be(&mut self) -> io::Result<u64> {
        let mut bytes = [0; 8];
        self.read_exact(&mut bytes)?;
        Ok(u64::from_be_bytes(bytes))
    }

    #[inline]
    pub(crate) fn read_u32_be(&mut self) -> io::Result<u32> {
        let mut bytes = [0; 4];
        self.read_exact(&mut bytes)?;
        Ok(u32::from_be_bytes(bytes))
    }

    #[inline]
    pub(crate) fn read_u16_be(&mut self) -> io::Result<u16> {
        let mut bytes = [0; 2];
        self.read_exact(&mut bytes)?;
        Ok(u16::from_be_bytes(bytes))
    }

    #[inline]
    #[allow(dead_code)]
    pub(crate) fn read_u8(&mut self) -> io::Result<u8> {
        let mut bytes = [0; 1];
        self.read_exact(&mut bytes)?;
        Ok(u8::from_be_bytes(bytes))
    }

    #[allow(dead_code)]
    pub(crate) fn read_vec_header(&mut self, len: usize) -> io::Result<Vec<u8>> {
        let mut buf = vec![0; len];
        self.read_exact(&mut buf)?;
        Ok(buf)
    }
}

type HuffmanResult<T> = Result<T, HuffmanError>;

/// Decoding errors from the HUFF/CDIC algorithm.
#[derive(Debug)]
pub enum HuffmanError {
    IoError(std::io::Error),
    CodeLenOutOfBounds,
    BadTerm,
    InvalidHuffHeader,
    InvalidCDICHeader,
    InvalidDictionaryIndex,
}

impl From<std::io::Error> for HuffmanError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e)
    }
}

type CodeDictionary = [(u8, bool, u32); 256];
type MinCodesMapping = [u32; 32];
type MaxCodesMapping = [u32; 32];

fn load_huff(huff: &[u8]) -> HuffmanResult<(CodeDictionary, MinCodesMapping, MaxCodesMapping)> {
    let mut r = MobiHuffReader::new(std::io::Cursor::new(huff));

    if r.read_u32_be()? != u32::from_be_bytes(*b"HUFF") || r.read_u32_be()? != 0x18 {
        return Err(HuffmanError::InvalidHuffHeader);
    }

    let cache_offset = r.read_u32_be()?;
    let base_offset = r.read_u32_be()?;

    r.set_position(cache_offset as usize)?;

    let mut code_dict = [(0, false, 0); 256];
    for code in code_dict.iter_mut() {
        let v = r.read_u32_be()?;
        // 0 < code_len <= 32, term is T or F, max_code is u24 pretending to be u32.
        let (code_len, term, mut max_code) = ((v & 0x1F) as u8, (v & 0x80) == 0x80, v >> 8);
        if code_len == 0 {
            return Err(HuffmanError::CodeLenOutOfBounds);
        }
        if code_len <= 8 && !term {
            return Err(HuffmanError::BadTerm);
        }
        max_code = ((max_code + 1) << (32 - code_len)) - 1;
        *code = (code_len, term, max_code);
    }

    r.set_position(base_offset as usize)?;

    // First value is ignored, since code_len > 0.
    let mut min_codes = [0; 32];
    let mut max_codes = [u32::MAX; 32];

    // Fill all other values.
    for code_len in 1..=32 {
        min_codes[code_len] = r.read_u32_be()? << (32 - code_len);
        max_codes[code_len] = ((r.read_u32_be()? + 1) << (32 - code_len)).wrapping_sub(1);
    }

    Ok((code_dict, min_codes, max_codes))
}

fn load_cdic(cdic: &[u8], dictionary: &mut Vec<Option<(Vec<u8>, bool)>>) -> HuffmanResult<()> {
    let mut r = MobiHuffReader::new(std::io::Cursor::new(cdic));

    if r.read_u32_be()? != u32::from_be_bytes(*b"CDIC") || r.read_u32_be()? != 0x10 {
        return Err(HuffmanError::InvalidCDICHeader);
    }

    let num_phrases = r.read_u32_be()?;
    let bits = r.read_u32_be()?;

    let n = (1 << bits).min(num_phrases - dictionary.len() as u32);

    let mut offsets = Vec::with_capacity(n as usize);
    for _ in 0..n {
        offsets.push(r.read_u16_be()?);
    }

    for offset in offsets {
        r.set_position(16 + offset as usize)?;
        let num_bytes = r.read_u16_be()?;
        let bytes = {
            let mut slice = vec![0; (num_bytes as usize) & 0x7FFF];
            r.read_exact(&mut slice)?;
            slice
        };
        dictionary.push(Some((bytes, (num_bytes & 0x8000) == 0x8000)));
    }

    Ok(())
}

fn unpack(
    data: &[u8],
    dictionary: &mut [Option<(Vec<u8>, bool)>],
    code_dict: &[(u8, bool, u32); 256],
    min_codes: &[u32; 32],
    max_codes: &[u32; 32],
) -> HuffmanResult<Vec<u8>> {
    let mut bits_left = data.len() * 8;

    let mut r = MobiHuffReader::new(std::io::Cursor::new(&data));

    // X is a sliding window of 64 bits from data.
    let mut x = r.read_u64_be()?;
    // -32 < n <= 32
    let mut n = 32i8;
    let mut unpacked = vec![];

    loop {
        // The top 32 bits are now stale, read next 32 bits.
        if n <= 0 {
            // Can not read another 32 bits.
            if bits_left < 32 {
                // Can read up to 3 bytes.
                for _ in 0..bits_left / 8 {
                    x = (x << 8) | u64::from(r.read_u8()?);
                }
                // Pad last bits with 0.
                x <<= 32 - bits_left;
            } else {
                x = (x << 32) | u64::from(r.read_u32_be()?);
            }
            n += 32;
        }

        // Read maximum of 32 bits from x.
        let code = (x >> n) as u32;
        // Get value from dict1.
        let (code_len, term, mut max_code) = code_dict[(code >> 24) as usize];

        // 32 > code_len > 0.
        let mut code_len = code_len as usize;
        if !term {
            // Last min_code is guaranteed to be 0, so no unwrap.
            code_len += min_codes[code_len..]
                .iter()
                .position(|&min_code| code >= min_code)
                .unwrap();
            max_code = max_codes[code_len];
        }

        let index = ((max_code - code) >> (32 - code_len)) as usize;
        let (mut slice, flag) = std::mem::take(
            dictionary
                .get_mut(index)
                .ok_or(HuffmanError::InvalidDictionaryIndex)?,
        )
        .ok_or(HuffmanError::InvalidDictionaryIndex)?;
        if !flag {
            slice = unpack(&slice, dictionary, code_dict, min_codes, max_codes)?;
        }
        unpacked.extend_from_slice(&slice);
        dictionary[index] = Some((slice, true));

        // code_len <= 32, so this is safe.
        n -= code_len as i8;
        bits_left = match bits_left.checked_sub(code_len) {
            // No more bits left to read.
            None | Some(0) => break,
            Some(i) => i,
        };
    }

    Ok(unpacked)
}

/// Decompress HUFF/CDIC-compressed MOBI text records.
///
/// `huffs[0]` must be the HUFF record; `huffs[1..]` are the CDIC records in
/// order. Each element of `sections` is one compressed text record and gets
/// one decompressed output. Returns an error (never panics) on malformed
/// input.
pub fn decompress(huffs: &[&[u8]], sections: &[&[u8]]) -> HuffmanResult<Vec<Vec<u8>>> {
    if huffs.is_empty() {
        return Err(HuffmanError::InvalidHuffHeader);
    }
    let (dict1, min_code, max_code) = load_huff(huffs[0])?;
    let mut dictionary = Vec::new();
    for huff in huffs[1..].iter() {
        load_cdic(huff, &mut dictionary)?;
    }

    let mut output = Vec::new();
    for section in sections {
        output.push(unpack(
            section,
            &mut dictionary,
            &dict1,
            &min_code,
            &max_code,
        )?);
    }
    Ok(output)
}
