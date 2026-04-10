use crate::error::{ShioriError, Result};
use crate::services::renderer::{
    BookMetadata, BookReaderAdapter, Chapter, SearchResult, TocEntry,
};
use async_trait::async_trait;
use mobi::Mobi;
use regex::Regex;
use std::collections::HashMap;
use std::fs;

pub struct MobiAdapter {
    path: String,
    metadata: Option<BookMetadata>,
    chapters: Vec<Chapter>,
}

impl MobiAdapter {
    pub fn new() -> Self {
        Self {
            path: String::new(),
            metadata: None,
            chapters: Vec::new(),
        }
    }

    fn normalize_mobi_content(raw: &str) -> String {
        let normalized = raw
            .replace("\r\n", "\n")
            .replace('\r', "\n")
            .chars()
            .filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
            .collect::<String>();

        let normalized = Self::trim_garbage_tail(&normalized);

        // If content looks garbled, strip all HTML and present as plain text
        if Self::is_content_garbled(&normalized) {
            let plain = Self::strip_html_tags(&normalized);
            let clean_plain = Self::clean_garbled_plain_text(&plain);
            if clean_plain.trim().is_empty() {
                return Self::text_to_html("[This MOBI file could not be decoded. The content may be DRM-protected or use an unsupported encoding.]");
            }
            return Self::text_to_html(&clean_plain);
        }

        if normalized.contains('<') {
            let html = Self::extract_html_body_or_document(&normalized)
                .unwrap_or_else(|| normalized.to_string());
            let html = Self::trim_garbage_tail(&html);
            if html.trim().is_empty() {
                Self::text_to_html(&normalized)
            } else {
                html
            }
        } else {
            Self::text_to_html(&normalized)
        }
    }

    /// Detect if extracted MOBI content is garbled/corrupted.
    /// Checks for: low alpha ratio, broken HTML tags, excessive uppercase gibberish,
    /// and high density of control-like patterns.
    fn is_content_garbled(content: &str) -> bool {
        if content.len() < 100 {
            return false;
        }

        // Sample the first 2000 chars for performance
        let sample: String = content.chars().take(2000).collect();
        let sample_len = sample.len() as f64;
        if sample_len < 50.0 {
            return false;
        }

        let plain = Self::strip_html_tags(&sample);
        let plain_len = plain.len() as f64;
        if plain_len < 20.0 {
            return false;
        }

        // Check 1: Alpha ratio — readable text should have > 40% alphabetic chars
        let alpha_count = plain.chars().filter(|c| c.is_alphabetic()).count() as f64;
        let alpha_ratio = alpha_count / plain_len;

        // Check 2: Space ratio — readable text has reasonable spacing (> 8% spaces)
        let space_count = plain.chars().filter(|c| *c == ' ').count() as f64;
        let space_ratio = space_count / plain_len;

        // Check 3: Broken tag fragments like "tocrecinde>", "cinde>", ">NOT"
        let broken_tag_count = {
            let re = Regex::new(r"[a-z]{2,10}>").ok();
            re.map(|r| r.find_iter(&sample).count()).unwrap_or(0)
        };
        let broken_tag_density = broken_tag_count as f64 / (sample_len / 100.0);

        // Check 4: Very long "words" (>30 chars without space) indicate garbled data
        let long_word_count = plain
            .split_whitespace()
            .filter(|w| w.len() > 30)
            .count();
        let word_count = plain.split_whitespace().count().max(1);
        let long_word_ratio = long_word_count as f64 / word_count as f64;

        // Garbled if: poor alpha ratio + poor spacing, or lots of broken tags, or lots of gibberish words
        (alpha_ratio < 0.35 && space_ratio < 0.08)
            || broken_tag_density > 3.0
            || long_word_ratio > 0.3
            || (alpha_ratio < 0.45 && broken_tag_density > 1.5)
    }

    /// Clean garbled plain text by removing obvious binary/tag debris
    fn clean_garbled_plain_text(text: &str) -> String {
        // Remove fragments that look like broken tags
        let cleaned = if let Ok(re) = Regex::new(r"[a-zA-Z]{1,5}>") {
            re.replace_all(text, " ").to_string()
        } else {
            text.to_string()
        };

        // Collapse excessive whitespace
        let collapsed = if let Ok(re) = Regex::new(r"\s{3,}") {
            re.replace_all(&cleaned, "\n\n").to_string()
        } else {
            cleaned
        };

        collapsed.trim().to_string()
    }

    fn text_to_html(text: &str) -> String {
        let blocks = text
            .split("\n\n")
            .map(str::trim)
            .filter(|b| !b.is_empty())
            .map(|b| {
                let escaped = b
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;");
                format!("<p>{}</p>", escaped.replace('\n', "<br/>"))
            })
            .collect::<Vec<_>>();
        blocks.join("\n")
    }

    fn extract_html_body_or_document(input: &str) -> Option<String> {
        let mut candidates: Vec<String> = Vec::new();

        if let Ok(body_re) = Regex::new(r"(?is)<body[^>]*>(.*?)</body>") {
            for cap in body_re.captures_iter(input) {
                if let Some(m) = cap.get(1) {
                    candidates.push(m.as_str().to_string());
                }
            }
        }

        if let Ok(html_re) = Regex::new(r"(?is)<html[^>]*>.*?</html>") {
            for m in html_re.find_iter(input) {
                candidates.push(m.as_str().to_string());
            }
        }

        if candidates.is_empty() && input.contains('<') && input.contains('>') {
            candidates.push(input.to_string());
        }

        candidates
            .into_iter()
            .max_by_key(|c| Self::html_candidate_score(c))
    }

    fn html_candidate_score(candidate: &str) -> usize {
        let plain = Self::strip_html_tags(candidate);
        let plain_len = plain.len();
        let candidate_len = candidate.len();
        let tag_count = Regex::new(r"(?is)<[^>]+>")
            .ok()
            .map(|re| re.find_iter(candidate).count())
            .unwrap_or(0);
        let block_tag_count = Regex::new(r"(?is)<(p|div|h[1-6]|li|blockquote|article|section)\b")
            .ok()
            .map(|re| re.find_iter(candidate).count())
            .unwrap_or(0);

        let alpha_count = plain.chars().filter(|c| c.is_alphabetic()).count();
        let printable_count = plain.chars().filter(|c| !c.is_control()).count();
        let control_count = plain.chars().filter(|c| c.is_control()).count();
        let replacement_count = plain.chars().filter(|c| *c == '\u{FFFD}').count();

        let alpha_ratio_bonus = if printable_count > 0 {
            (alpha_count * 300) / printable_count
        } else {
            0
        };

        let readability_bonus = block_tag_count * 60;
        let structure_bonus = candidate_len.min(120_000) / 8;
        let control_penalty = control_count * 300;
        let replacement_penalty = replacement_count * 200;

        plain_len
            .saturating_mul(2)
            .saturating_add(readability_bonus)
            .saturating_add(alpha_ratio_bonus)
            .saturating_add(structure_bonus)
            .saturating_sub(tag_count * 4)
            .saturating_sub(control_penalty)
            .saturating_sub(replacement_penalty)
    }

    fn plain_text_readability_score(candidate: &str) -> usize {
        let text = candidate;
        let len = text.len();
        let alpha_count = text.chars().filter(|c| c.is_alphabetic()).count();
        let printable_count = text.chars().filter(|c| !c.is_control()).count();
        let control_count = text.chars().filter(|c| c.is_control()).count();
        let replacement_count = text.chars().filter(|c| *c == '\u{FFFD}').count();
        let punctuation_like = text
            .chars()
            .filter(|c| matches!(c, ' ' | '\n' | '\t' | '.' | ',' | ';' | ':' | '!' | '?' | '\'' | '"'))
            .count();

        let alpha_ratio_bonus = if printable_count > 0 {
            (alpha_count * 350) / printable_count
        } else {
            0
        };

        let punctuation_bonus = if printable_count > 0 {
            (punctuation_like * 150) / printable_count
        } else {
            0
        };

        len.saturating_mul(2)
            .saturating_add(alpha_ratio_bonus)
            .saturating_add(punctuation_bonus)
            .saturating_sub(control_count * 400)
            .saturating_sub(replacement_count * 240)
    }

    fn pick_best_decoded_candidate(candidates: Vec<String>) -> Option<String> {
        candidates
            .into_iter()
            .max_by_key(|s| {
                let normalized = Self::trim_garbage_tail(s);
                let html_score = Self::html_candidate_score(&normalized);
                let text_score = Self::plain_text_readability_score(&normalized);
                html_score.saturating_mul(3).saturating_add(text_score)
            })
    }

    fn score_is_poor(score: usize) -> bool {
        score < 700
    }

    fn trim_garbage_tail(input: &str) -> String {
        let lower = input.to_lowercase();
        let mut end = input.len();
        if let Some(pos) = lower.rfind("</html>") {
            end = (pos + "</html>".len()).min(input.len());
        } else if let Some(pos) = lower.rfind("</body>") {
            end = (pos + "</body>".len()).min(input.len());
        }

        let mut cleaned = input[..end].to_string();
        let binary_tail_re = Regex::new(r"(?s)[\u{0000}-\u{0008}\u{000B}\u{000C}\u{000E}-\u{001F}\u{007F}]{8,}.*$").ok();
        if let Some(re) = binary_tail_re {
            cleaned = re.replace(&cleaned, "").to_string();
        }

        cleaned.trim().to_string()
    }

    fn strip_html_tags(input: &str) -> String {
        let stripped = if let Ok(tag_re) = Regex::new(r"(?is)<[^>]+>") {
            tag_re.replace_all(input, "").to_string()
        } else {
            input.to_string()
        };

        stripped
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .trim()
            .to_string()
    }

    fn floor_char_boundary(s: &str, mut idx: usize) -> usize {
        idx = idx.min(s.len());
        while idx > 0 && !s.is_char_boundary(idx) {
            idx -= 1;
        }
        idx
    }

    fn split_into_chapters(html: &str) -> Vec<Chapter> {
        let heading_re = Regex::new(r"(?is)<h([1-6])[^>]*>(.*?)</h[1-6]>").ok();
        let pagebreak_re = Regex::new(r"(?is)<(?:mbp:pagebreak|pagebreak)\b[^>]*?/?>|<hr\b[^>]*pagebreak[^>]*?/?>").ok();

        let mut breakpoints: Vec<(usize, Option<String>)> = vec![(0, None)];

        if let Some(heading_re) = &heading_re {
            for cap in heading_re.captures_iter(html) {
                if let Some(m) = cap.get(0) {
                    let title = cap
                        .get(2)
                        .map(|g| Self::strip_html_tags(g.as_str()))
                        .filter(|t| !t.is_empty());
                    breakpoints.push((m.start(), title));
                }
            }
        }

        if let Some(pagebreak_re) = &pagebreak_re {
            for m in pagebreak_re.find_iter(html) {
                breakpoints.push((m.start(), None));
            }
        }

        breakpoints.sort_by_key(|(pos, _)| *pos);
        let mut merged_breakpoints: Vec<(usize, Option<String>)> = Vec::with_capacity(breakpoints.len());
        for (pos, title) in breakpoints {
            if let Some((last_pos, last_title)) = merged_breakpoints.last_mut() {
                if *last_pos == pos {
                    let has_non_empty = title
                        .as_ref()
                        .map(|t| !t.trim().is_empty())
                        .unwrap_or(false);
                    let last_empty = last_title
                        .as_ref()
                        .map(|t| t.trim().is_empty())
                        .unwrap_or(true);
                    if has_non_empty && last_empty {
                        *last_title = title;
                    }
                    continue;
                }
            }
            merged_breakpoints.push((pos, title));
        }
        breakpoints = merged_breakpoints;

        if breakpoints.len() <= 1 && html.len() > 20_000 {
            let mut pos = 12_000usize;
            while pos < html.len() {
                let safe_pos = Self::floor_char_boundary(html, pos);
                let next_break = html[safe_pos..]
                    .find('\n')
                    .map(|idx| safe_pos + idx)
                    .unwrap_or(safe_pos);
                breakpoints.push((next_break, None));
                pos = pos.saturating_add(12_000);
            }
            breakpoints.sort_by_key(|(start, _)| *start);
            breakpoints.dedup_by(|a, b| a.0 == b.0);
        }

        let mut chapters = Vec::new();
        for (idx, (start, explicit_title)) in breakpoints.iter().enumerate() {
            let end = breakpoints
                .get(idx + 1)
                .map(|(s, _)| *s)
                .unwrap_or(html.len());

            if *start >= end || *start >= html.len() {
                continue;
            }

            let safe_start = Self::floor_char_boundary(html, *start);
            let safe_end = Self::floor_char_boundary(html, end);
            if safe_start >= safe_end {
                continue;
            }

            let content = html[safe_start..safe_end].trim().to_string();
            if content.is_empty() {
                continue;
            }

            let fallback_title = format!("Chapter {}", chapters.len() + 1);
            let title = explicit_title
                .clone()
                .filter(|t| !t.trim().is_empty())
                .unwrap_or(fallback_title);

            chapters.push(Chapter {
                index: chapters.len(),
                title,
                content,
                location: format!("mobi-chapter-{}", chapters.len()),
            });
        }

        if chapters.is_empty() {
            return Self::split_text_fallback(html);
        }

        if chapters.len() == 1 {
            let plain = Self::strip_html_tags(html);
            if plain.len() > 35_000 || Self::has_text_chapter_markers(&plain) {
                return Self::split_text_fallback(html);
            }
        }

        chapters
    }

    fn has_text_chapter_markers(text: &str) -> bool {
        let chapter_line_re = Regex::new(r"(?im)^\s*(chapter|part|section)\s+[0-9ivxlcdm]+(?:[\.:\-\s].*)?$").ok();
        chapter_line_re
            .map(|re| re.find_iter(text).take(2).count() >= 2)
            .unwrap_or(false)
    }

    fn split_text_fallback(content: &str) -> Vec<Chapter> {
        let block_sep_re = Regex::new(r"(?is)</(p|div|h[1-6]|li|tr|section|article)>|<br\s*/?>").ok();
        let preprocessed = if let Some(re) = block_sep_re {
            re.replace_all(content, "\n").to_string()
        } else {
            content.to_string()
        };
        let plain = Self::strip_html_tags(&preprocessed);
        let mut chapters = Vec::new();
        let chapter_line_re = Regex::new(r"(?im)^\s*(chapter|part|section)\s+[0-9ivxlcdm]+[\.:\-\s].*$").ok();

        let mut starts = vec![(0usize, Some("Chapter 1".to_string()))];
        if let Some(re) = &chapter_line_re {
            let mut found_any = false;
            for m in re.find_iter(&plain) {
                starts.push((m.start(), Some(m.as_str().trim().to_string())));
                found_any = true;
            }
            if found_any {
                starts.sort_by_key(|(s, _)| *s);
                starts.dedup_by(|a, b| a.0 == b.0);
            }
        }

        if starts.len() <= 1 {
            let mut pos = 12_000usize;
            while pos < plain.len() {
                let safe = Self::floor_char_boundary(&plain, pos);
                starts.push((safe, None));
                pos += 12_000;
            }
            starts.sort_by_key(|(s, _)| *s);
            starts.dedup_by(|a, b| a.0 == b.0);
        }

        for (idx, (start, title)) in starts.iter().enumerate() {
            let end = starts.get(idx + 1).map(|(s, _)| *s).unwrap_or(plain.len());
            if *start >= end || *start >= plain.len() {
                continue;
            }
            let safe_start = Self::floor_char_boundary(&plain, *start);
            let safe_end = Self::floor_char_boundary(&plain, end);
            if safe_start >= safe_end {
                continue;
            }
            let text_chunk = plain[safe_start..safe_end].trim();
            if text_chunk.is_empty() {
                continue;
            }
            let html_chunk = Self::text_to_html(text_chunk);
            let fallback_title = format!("Chapter {}", chapters.len() + 1);
            chapters.push(Chapter {
                index: chapters.len(),
                title: title
                    .clone()
                    .filter(|t| !t.trim().is_empty())
                    .unwrap_or(fallback_title),
                content: html_chunk,
                location: format!("mobi-chapter-{}", chapters.len()),
            });
        }

        if chapters.is_empty() {
            chapters.push(Chapter {
                index: 0,
                title: "Content".to_string(),
                content: Self::text_to_html(&plain),
                location: "mobi-chapter-0".to_string(),
            });
        }

        chapters
    }

    fn read_be_u16(data: &[u8], offset: usize) -> Option<u16> {
        data.get(offset..offset + 2)
            .map(|b| u16::from_be_bytes([b[0], b[1]]))
    }

    fn read_be_u32(data: &[u8], offset: usize) -> Option<u32> {
        data.get(offset..offset + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn parse_pdb_record_offsets(data: &[u8]) -> Option<Vec<usize>> {
        let num_records = Self::read_be_u16(data, 76)? as usize;
        let record_table_start = 78usize;
        let table_bytes = num_records.checked_mul(8)?;
        if data.len() < record_table_start.checked_add(table_bytes)? {
            return None;
        }

        let mut offsets = Vec::with_capacity(num_records);
        for i in 0..num_records {
            let offset = Self::read_be_u32(data, record_table_start + (i * 8))? as usize;
            if offset >= data.len() {
                return None;
            }
            if let Some(prev) = offsets.last() {
                if offset < *prev {
                    return None;
                }
            }
            offsets.push(offset);
        }
        Some(offsets)
    }

    fn parse_pdb_extra_bytes_count(data: &[u8]) -> usize {
        let Some(num_records) = Self::read_be_u16(data, 76).map(|v| v as usize) else {
            return 0;
        };
        let record_table_start = 78usize;
        let Some(table_bytes) = num_records.checked_mul(8) else {
            return 0;
        };
        let footer_flags_offset = record_table_start.saturating_add(table_bytes);
        let Some(flags) = Self::read_be_u16(data, footer_flags_offset) else {
            return 0;
        };
        ((flags & 0xFFFE).count_ones() as usize) * 2
    }

    fn detect_image_format(data: &[u8]) -> Option<(&'static str, usize)> {
        for start in 0..data.len().min(32) {
            let tail = &data[start..];
            if tail.len() >= 3 && tail[0..3] == [0xFF, 0xD8, 0xFF] {
                return Some(("jpeg", start));
            }
            if tail.len() >= 8 && tail[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
                return Some(("png", start));
            }
            if tail.len() >= 6 && (&tail[0..6] == b"GIF87a" || &tail[0..6] == b"GIF89a") {
                return Some(("gif", start));
            }
            if tail.len() >= 12 && &tail[0..4] == b"RIFF" && &tail[8..12] == b"WEBP" {
                return Some(("webp", start));
            }
        }
        None
    }

    fn parse_first_image_index(data: &[u8], offsets: &[usize]) -> Option<usize> {
        let record0 = *offsets.first()?;
        let mobi_start = record0.saturating_add(16);
        if data.get(mobi_start..mobi_start + 4) != Some(b"MOBI") {
            return None;
        }
        let first_image_index = Self::read_be_u32(data, mobi_start + 92).unwrap_or(0) as usize;
        if first_image_index == 0 {
            None
        } else {
            Some(first_image_index)
        }
    }

    fn parse_text_record_range_and_flags(data: &[u8], offsets: &[usize]) -> Option<(usize, usize, u16, u32, u16, u32)> {
        let record0 = *offsets.first()?;
        let palm_start = record0;
        let compression = Self::read_be_u16(data, palm_start)?;
        let text_length = Self::read_be_u32(data, palm_start + 4)?;
        let text_record_count = Self::read_be_u16(data, palm_start + 8)?;

        let mobi_start = palm_start.saturating_add(16);
        let mut first_content_record = 1usize;
        let mut last_content_record = first_content_record
            .saturating_add(text_record_count as usize)
            .saturating_sub(1);
        let mut extra_flags = 0u16;
        let mut text_encoding = 65001u32;

        if data.get(mobi_start..mobi_start + 4) == Some(b"MOBI") {
            let mobi_header_len = Self::read_be_u32(data, mobi_start + 4).unwrap_or(0) as usize;
            if mobi_header_len >= 180 {
                if let Some(v) = Self::read_be_u16(data, mobi_start + 176) {
                    let vv = v as usize;
                    if vv > 0 && vv < offsets.len() {
                        first_content_record = vv;
                    }
                }
            }
            if mobi_header_len >= 180 {
                if let Some(v) = Self::read_be_u16(data, mobi_start + 178) {
                    let vv = v as usize;
                    if vv > 0 && vv < offsets.len() {
                        last_content_record = vv;
                    }
                }
            }
            if mobi_header_len >= 0xF4 {
                extra_flags = Self::read_be_u16(data, mobi_start + 0xF2).unwrap_or(0);
            }
            if mobi_header_len >= 32 {
                text_encoding = Self::read_be_u32(data, mobi_start + 28).unwrap_or(65001);
            }
        }

        if last_content_record < first_content_record {
            last_content_record = first_content_record
                .saturating_add(text_record_count as usize)
                .saturating_sub(1);
        }

        let max_record = offsets.len().saturating_sub(1);
        Some((
            first_content_record.min(max_record),
            last_content_record.min(max_record),
            compression,
            text_length,
            extra_flags,
            text_encoding,
        ))
    }

    fn read_backward_varint(data: &[u8], end: usize) -> Option<(usize, usize)> {
        if end == 0 {
            return None;
        }
        let mut pos = end;
        let mut shift = 0usize;
        let mut value = 0usize;
        let mut read = 0usize;

        while pos > 0 && read < 5 {
            let byte = data[pos - 1] as usize;
            value |= (byte & 0x7F) << shift;
            shift += 7;
            pos -= 1;
            read += 1;
            if (byte & 0x80) != 0 {
                return Some((value, pos));
            }
        }

        None
    }

    fn trim_record_extra_bytes(record: &[u8], extra_flags: u16) -> Vec<u8> {
        if record.is_empty() || extra_flags == 0 {
            return record.to_vec();
        }

        let mut end = record.len();
        for bit in 1..16 {
            if (extra_flags & (1 << bit)) == 0 || end == 0 {
                continue;
            }
            if let Some((sz, _new_end)) = Self::read_backward_varint(record, end) {
                if sz <= end {
                    end -= sz;
                }
            }
        }

        if (extra_flags & 1) != 0 && end > 0 {
            let multibyte = (record[end - 1] & 0x03) as usize;
            if multibyte <= end {
                end -= multibyte;
            }
        }

        record[..end].to_vec()
    }

    fn trim_record_fixed_extra_bytes(record: &[u8], extra_bytes: usize) -> Vec<u8> {
        let trimmed_end = record.len().saturating_sub(extra_bytes);
        record[..trimmed_end].to_vec()
    }

    fn palm_doc_decompress(data: &[u8]) -> Option<Vec<u8>> {
        let mut out = Vec::with_capacity(data.len() * 2);
        let mut i = 0usize;

        while i < data.len() {
            let c = data[i];
            i += 1;
            match c {
                0x00 => out.push(0x00),
                0x01..=0x08 => {
                    let count = c as usize;
                    if i + count > data.len() {
                        return None;
                    }
                    out.extend_from_slice(&data[i..i + count]);
                    i += count;
                }
                0x09..=0x7F => out.push(c),
                0x80..=0xBF => {
                    if i >= data.len() {
                        return None;
                    }
                    let c2 = data[i];
                    i += 1;
                    let pair = (((c as usize) << 8) | c2 as usize) & 0x3FFF;
                    let distance = pair >> 3;
                    let length = (pair & 0x07) + 3;
                    if distance == 0 || distance > out.len() {
                        return None;
                    }
                    let start = out.len() - distance;
                    for j in 0..length {
                        let b = out[start + j];
                        out.push(b);
                    }
                }
                0xC0..=0xFF => {
                    out.push(b' ');
                    out.push(c ^ 0x80);
                }
            }
        }

        Some(out)
    }

    fn decode_cp1252(raw: &[u8]) -> String {
        const CP1252_EXT: [char; 32] = [
            '€', '\u{0081}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{008D}', 'Ž', '\u{008F}',
            '\u{0090}', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{009D}', 'ž', 'Ÿ',
        ];

        let mut out = String::with_capacity(raw.len());
        for &b in raw {
            match b {
                0x80..=0x9F => out.push(CP1252_EXT[(b - 0x80) as usize]),
                _ => out.push(b as char),
            }
        }
        out
    }

    fn decode_text_bytes(raw: &[u8], text_encoding: u32) -> String {
        match text_encoding {
            65001 => String::from_utf8_lossy(raw).into_owned(),
            1252 | 0 => Self::decode_cp1252(raw),
            _ => {
                if std::str::from_utf8(raw).is_ok() {
                    String::from_utf8_lossy(raw).into_owned()
                } else {
                    Self::decode_cp1252(raw)
                }
            }
        }
    }

    fn extract_html_from_records(file_data: &[u8]) -> Option<String> {
        let offsets = Self::parse_pdb_record_offsets(file_data)?;
        let pdb_extra_bytes = Self::parse_pdb_extra_bytes_count(file_data);
        let (first_record, last_record, compression, text_length, extra_flags, text_encoding) =
            Self::parse_text_record_range_and_flags(file_data, &offsets)?;

        if first_record > last_record || first_record >= offsets.len() {
            return None;
        }

        let mut candidates: Vec<String> = Vec::new();

        let decode_with_strategy = |trim_mode: u8| -> Option<String> {
            let mut decoded = Vec::new();
            for idx in first_record..=last_record {
                let start = offsets[idx];
                let end = offsets.get(idx + 1).copied().unwrap_or(file_data.len());
                if start >= end || end > file_data.len() {
                    continue;
                }

                let rec_raw = &file_data[start..end];
                let rec = match trim_mode {
                    0 => rec_raw.to_vec(),
                    1 => Self::trim_record_fixed_extra_bytes(rec_raw, pdb_extra_bytes),
                    2 => Self::trim_record_extra_bytes(rec_raw, extra_flags),
                    _ => rec_raw.to_vec(),
                };

                match compression {
                    1 => decoded.extend_from_slice(&rec),
                    2 => {
                        let dec = Self::palm_doc_decompress(&rec)?;
                        decoded.extend_from_slice(&dec);
                    }
                    _ => return None,
                }
            }

            if decoded.is_empty() {
                return None;
            }
            if text_length > 0 && (text_length as usize) < decoded.len() {
                decoded.truncate(text_length as usize);
            }
            Some(Self::decode_text_bytes(&decoded, text_encoding))
        };

        match compression {
            1 => {
                if extra_flags == 0 {
                    if let Some(s) = decode_with_strategy(0) {
                        candidates.push(s);
                    }
                    if let Some(s) = decode_with_strategy(1) {
                        candidates.push(s);
                    }
                } else if let Some(s) = decode_with_strategy(2) {
                    candidates.push(s);
                }
            }
            2 => {
                if extra_flags > 0 {
                    if let Some(s) = decode_with_strategy(2) {
                        let score = Self::plain_text_readability_score(&s);
                        candidates.push(s);
                        if Self::score_is_poor(score) {
                            if let Some(fallback) = decode_with_strategy(0) {
                                candidates.push(fallback);
                            }
                        }
                    } else if let Some(fallback) = decode_with_strategy(0) {
                        candidates.push(fallback);
                    }
                } else if let Some(s) = decode_with_strategy(0) {
                    candidates.push(s);
                }
            }
            _ => return None,
        }

        Self::pick_best_decoded_candidate(candidates)
    }

    fn base64_encode(data: &[u8]) -> String {
        const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
        let mut i = 0;
        while i + 3 <= data.len() {
            let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8) | (data[i + 2] as u32);
            out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
            out.push(TABLE[(n & 0x3F) as usize] as char);
            i += 3;
        }
        let rem = data.len() - i;
        if rem == 1 {
            let n = (data[i] as u32) << 16;
            out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
            out.push('=');
            out.push('=');
        } else if rem == 2 {
            let n = ((data[i] as u32) << 16) | ((data[i + 1] as u32) << 8);
            out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
            out.push(TABLE[((n >> 6) & 0x3F) as usize] as char);
            out.push('=');
        }
        out
    }

    fn build_mobi_image_map(file_data: &[u8]) -> HashMap<String, String> {
        let mut map = HashMap::new();
        let Some(offsets) = Self::parse_pdb_record_offsets(file_data) else {
            return map;
        };
        let Some(first_image_index) = Self::parse_first_image_index(file_data, &offsets) else {
            return map;
        };

        for idx in first_image_index..offsets.len() {
            let start = offsets[idx];
            let end = offsets.get(idx + 1).copied().unwrap_or(file_data.len());
            if start >= end || end > file_data.len() {
                continue;
            }
            let rec = &file_data[start..end];
            let Some((mime_suffix, img_start)) = Self::detect_image_format(rec) else {
                continue;
            };
            let img = &rec[img_start..];
            if img.len() < 16 {
                continue;
            }
            let data_uri = format!(
                "data:image/{};base64,{}",
                mime_suffix,
                Self::base64_encode(img)
            );
            let rel = idx.saturating_sub(first_image_index);
            let one_based = rel.saturating_add(1);
            let is_jpeg = mime_suffix.eq_ignore_ascii_case("jpeg");

            map.insert(idx.to_string(), data_uri.clone());
            Self::insert_mobi_image_aliases(&mut map, &data_uri, rel, mime_suffix, is_jpeg);
            Self::insert_mobi_image_aliases(&mut map, &data_uri, one_based, mime_suffix, is_jpeg);
        }

        map
    }

    fn insert_mobi_image_aliases(
        map: &mut HashMap<String, String>,
        data_uri: &str,
        n: usize,
        mime_suffix: &str,
        is_jpeg: bool,
    ) {
        map.insert(n.to_string(), data_uri.to_string());
        map.insert(format!("{:04}", n), data_uri.to_string());
        map.insert(format!("{:05}", n), data_uri.to_string());
        map.insert(format!("image{}", n), data_uri.to_string());
        map.insert(format!("images/image{}.{}", n, mime_suffix), data_uri.to_string());
        map.insert(format!("images/{:05}.{}", n, mime_suffix), data_uri.to_string());
        if is_jpeg {
            map.insert(format!("images/image{}.jpg", n), data_uri.to_string());
            map.insert(format!("images/{:05}.jpg", n), data_uri.to_string());
        }
    }

    fn inline_mobi_images(html: &str, image_map: &HashMap<String, String>) -> String {
        let img_re =
            Regex::new(r#"(?is)<img\b([^>]*?)\bsrc\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s\"'=<>`]+))([^>]*)>"#).ok();
        let Some(img_re) = img_re else {
            return html.to_string();
        };

        let with_src_replaced = img_re
            .replace_all(html, |caps: &regex::Captures| {
                let src = caps
                    .get(2)
                    .or_else(|| caps.get(3))
                    .or_else(|| caps.get(4))
                    .map(|m| m.as_str().trim())
                    .unwrap_or_default();
                if src.starts_with("data:") {
                    return caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string();
                }

                let key_candidates = {
                    let mut keys = vec![src.to_string()];
                    if let Ok(rec_re) = Regex::new(r#"(?i)\brecindex\s*=\s*[\"']?(\d+)[\"']?"#) {
                        if let Some(cap) = rec_re.captures(caps.get(0).map(|m| m.as_str()).unwrap_or("")) {
                            if let Some(m) = cap.get(1) {
                                keys.push(m.as_str().to_string());
                            }
                        }
                    }
                    if let Some(last) = src.rsplit('/').next() {
                        keys.push(last.to_string());
                    }
                    if let Ok(embed_re) = Regex::new(r"(?i)kindle:embed:([0-9]+)") {
                        if let Some(cap) = embed_re.captures(src) {
                            if let Some(m) = cap.get(1) {
                                let raw = m.as_str().to_string();
                                keys.push(raw.clone());
                                if let Ok(parsed) = raw.parse::<usize>() {
                                    keys.push(parsed.to_string());
                                }
                            }
                        }
                    }
                    if let Ok(num_re) = Regex::new(r"(\d+)") {
                        if let Some(m) = num_re.find(src) {
                            keys.push(m.as_str().to_string());
                        }
                    }
                    let attrs = format!("{} {}", caps.get(1).map(|m| m.as_str()).unwrap_or(""), caps.get(5).map(|m| m.as_str()).unwrap_or(""));
                    if let Ok(rec_re) = Regex::new(r#"(?i)\brecindex\s*=\s*[\"']?(\d+)[\"']?"#) {
                        if let Some(cap) = rec_re.captures(&attrs) {
                            if let Some(m) = cap.get(1) {
                                keys.push(m.as_str().to_string());
                            }
                        }
                    }
                    keys
                };

                for key in key_candidates {
                    if let Some(uri) = image_map.get(&key) {
                        let before = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                        let after = caps.get(5).map(|m| m.as_str()).unwrap_or("");
                        return format!("<img{} src=\"{}\"{}>", before, uri, after);
                    }
                }

                caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string()
            })
            .to_string();

        let recindex_only_re = Regex::new(r#"(?is)<img\b((?:(?!\bsrc\s*=)[^>])*)>"#).ok();
        let Some(recindex_only_re) = recindex_only_re else {
            return with_src_replaced;
        };

        recindex_only_re
            .replace_all(&with_src_replaced, |caps: &regex::Captures| {
                let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
                let Ok(rec_re) = Regex::new(r#"(?i)\brecindex\s*=\s*[\"']?(\d+)"#) else {
                    return caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string();
                };
                let Some(cap) = rec_re.captures(attrs) else {
                    return caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string();
                };
                let Some(rec_idx) = cap.get(1).map(|m| m.as_str()) else {
                    return caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string();
                };
                let Some(uri) = image_map.get(rec_idx) else {
                    return caps.get(0).map(|m| m.as_str()).unwrap_or_default().to_string();
                };
                format!("<img{} src=\"{}\">", attrs, uri)
            })
            .to_string()
    }

    fn build_snippet(content: &str, first_match_pos: usize, query_char_count: usize) -> String {
        let char_indices: Vec<(usize, char)> = content.char_indices().collect();
        let char_idx = char_indices
            .iter()
            .position(|&(b_idx, _)| b_idx >= first_match_pos)
            .unwrap_or(0);
        let start_char_idx = char_idx.saturating_sub(50);
        let end_char_idx = (char_idx + query_char_count + 50).min(char_indices.len());
        let start_byte = char_indices.get(start_char_idx).map(|&(b, _)| b).unwrap_or(0);
        let end_byte = if end_char_idx >= char_indices.len() {
            content.len()
        } else {
            char_indices[end_char_idx].0
        };

        format!("...{}...", &content[start_byte..end_byte])
    }
}

unsafe impl Send for MobiAdapter {}
unsafe impl Sync for MobiAdapter {}

#[async_trait]
impl BookReaderAdapter for MobiAdapter {
    async fn load(&mut self, path: &str) -> Result<()> {
        let file_data = fs::read(path).map_err(|e| ShioriError::Io(e))?;
        
        let m = Mobi::from_read(&mut &file_data[..])
            .map_err(|e| ShioriError::Other(format!("Invalid MOBI file: {}", e)))?;
        
        // ── Multi-strategy content extraction ──
        // Try all methods and pick the best result using readability scoring.
        let mut candidates: Vec<String> = Vec::new();

        // Strategy 1: Custom PDB record extraction (handles compression, extra bytes, encoding)
        if let Some(content) = Self::extract_html_from_records(&file_data) {
            if !content.trim().is_empty() {
                candidates.push(content);
            }
        }

        // Strategy 2: mobi crate strict UTF-8
        if let Ok(content) = m.content_as_string() {
            if !content.trim().is_empty() {
                candidates.push(content);
            }
        }

        // Strategy 3: mobi crate lossy (replacement chars for invalid bytes)
        if let Ok(content) = m.content_as_string_lossy() {
            if !content.trim().is_empty() {
                candidates.push(content);
            }
        }

        if candidates.is_empty() {
            return Err(ShioriError::Other(
                "Failed to extract any readable content from this MOBI file. It may be DRM-protected or corrupted.".to_string()
            ));
        }

        // Pick the best candidate by readability score
        let html = Self::pick_best_decoded_candidate(candidates)
            .unwrap_or_else(|| "<p>Unable to decode MOBI content.</p>".to_string());

        let image_map = Self::build_mobi_image_map(&file_data);
        let normalized_html = Self::normalize_mobi_content(&html);
        let normalized_html = Self::inline_mobi_images(&normalized_html, &image_map);
        self.chapters = Self::split_into_chapters(&normalized_html);
        self.path = path.to_string();

        let title = {
            let raw = m.title();
            if raw.trim().is_empty() || raw == "Unknown" {
                std::path::Path::new(path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            } else {
                raw
            }
        };
        
        // Author extraction logic (same as the format_adapter one)
        let author = m.author().map(|a| {
            a.split(';')
             .map(|s| s.trim().to_string())
             .filter(|s| !s.is_empty())
             .collect::<Vec<String>>()
             .join(", ")
        });

        self.metadata = Some(BookMetadata {
            title,
            author,
            total_chapters: self.chapters.len(),
            total_pages: None,
            format: "mobi".to_string(),
        });

        Ok(())
    }

    fn get_metadata(&self) -> Result<BookMetadata> {
        self.metadata
            .clone()
            .ok_or_else(|| ShioriError::Other("Metadata not loaded".to_string()))
    }

    fn get_toc(&self) -> Result<Vec<TocEntry>> {
        Ok(self
            .chapters
            .iter()
            .map(|chapter| TocEntry {
                label: chapter.title.clone(),
                location: chapter.location.clone(),
                level: 0,
                children: Vec::new(),
            })
            .collect())
    }

    fn get_chapter(&self, index: usize) -> Result<Chapter> {
        self.chapters.get(index).cloned().ok_or_else(|| ShioriError::ChapterReadFailed {
            chapter_index: index,
            cause: format!("Chapter index out of range (count: {})", self.chapters.len()),
        })
    }

    fn chapter_count(&self) -> usize {
        self.chapters.len()
    }

    fn search(&self, query: &str) -> Result<Vec<SearchResult>> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for chapter in &self.chapters {
            let content_lower = chapter.content.to_lowercase();
            let matches: Vec<_> = content_lower.match_indices(&query_lower).collect();
            if matches.is_empty() {
                continue;
            }

            let first_match_pos = matches[0].0;
            let snippet = Self::build_snippet(&chapter.content, first_match_pos, query.chars().count());

            results.push(SearchResult {
                chapter_index: chapter.index,
                chapter_title: chapter.title.clone(),
                snippet,
                location: chapter.location.clone(),
                match_count: matches.len(),
            });
        }

        Ok(results)
    }

    fn get_resource(&self, _path: &str) -> Result<Vec<u8>> {
        Err(ShioriError::Other("MOBI resources not exposed natively yet".into()))
    }

    fn get_resource_mime(&self, _path: &str) -> Result<String> {
        Err(ShioriError::Other("MOBI resources not exposed natively yet".into()))
    }

    fn supports_pagination(&self) -> bool {
        false // Treat as flow
    }

    fn supports_images(&self) -> bool {
        true
    }
    
    async fn render_page(&self, _page_number: usize, _scale: f32) -> Result<Vec<u8>> {
        Err(ShioriError::UnsupportedFeature("MOBI does not support strict pagination rendering".into()))
    }

    fn get_page_dimensions(&self, _page_number: usize) -> Result<(f32, f32)> {
        Err(ShioriError::UnsupportedFeature("MOBI does not support strict pagination dimensions".into()))
    }

    fn page_count(&self) -> usize {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::MobiAdapter;
    use std::collections::HashMap;

    #[test]
    fn splits_on_headings_into_multiple_chapters() {
        let html = "<h1>Intro</h1><p>A</p><h2>Part 1</h2><p>B</p><h2>Part 2</h2><p>C</p>";
        let chapters = MobiAdapter::split_into_chapters(html);

        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].title, "Intro");
        assert_eq!(chapters[0].location, "mobi-chapter-0");
        assert_eq!(chapters[1].title, "Part 1");
        assert_eq!(chapters[2].title, "Part 2");
    }

    #[test]
    fn heading_at_start_is_not_regressed_to_start_title() {
        let html = "<h1>Intro</h1><p>A</p>";
        let chapters = MobiAdapter::split_into_chapters(html);

        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "Intro");
        assert_eq!(chapters[0].location, "mobi-chapter-0");
    }

    #[test]
    fn dedup_prefers_non_empty_heading_title() {
        let html = "<h1><span></span>Real Title</h1><p>Body</p>";
        let chapters = MobiAdapter::split_into_chapters(html);

        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "Real Title");
    }

    #[test]
    fn large_content_split_is_utf8_safe() {
        let html = format!("{}\n{}", "é".repeat(11_000), "中".repeat(11_000));
        let chapters = MobiAdapter::split_into_chapters(&html);

        assert!(chapters.len() >= 2);
        assert_eq!(chapters[0].location, "mobi-chapter-0");
    }

    #[test]
    fn normalizes_plain_text_into_paragraph_html() {
        let normalized = MobiAdapter::normalize_mobi_content("Line1\nLine2\n\nBlock2");
        assert!(normalized.contains("<p>Line1<br/>Line2</p>"));
        assert!(normalized.contains("<p>Block2</p>"));
    }

    #[test]
    fn trims_binary_garbage_tail_from_html() {
        let raw = "<html><body><h1>T</h1><p>Clean</p></body></html>\u{0000}\u{0001}\u{0002}\u{0003}\u{0004}\u{0005}\u{0006}\u{0007}GARBAGE";
        let normalized = MobiAdapter::normalize_mobi_content(raw);
        assert!(normalized.contains("<h1>T</h1>"));
        assert!(!normalized.contains("GARBAGE"));
    }

    #[test]
    fn fallback_text_chapter_split_handles_broken_html() {
        let html = "<p>CHAPTER 1: Start</p>\nLots of text\n\nCHAPTER 2: Continue\nMore text";
        let chapters = MobiAdapter::split_into_chapters(html);
        assert!(chapters.len() >= 2);
        assert_eq!(chapters[0].location, "mobi-chapter-0");
        assert_eq!(chapters[1].location, "mobi-chapter-1");
    }

    #[test]
    fn trims_extra_bytes_from_record_tail() {
        // "Hello" + 3 bytes trailer + trailer length varint(4 => 0x84)
        let rec = [b'H', b'e', b'l', b'l', b'o', 0xAA, 0xBB, 0xCC, 0x84];
        let trimmed = MobiAdapter::trim_record_extra_bytes(&rec, 1 << 1);
        assert_eq!(trimmed, b"Hello");
    }

    #[test]
    fn html_candidate_prefers_readable_body() {
        let input = concat!(
            "<html><body><p>x</p></body></html>",
            "<html><body><h1>Title</h1><p>",
            "This is much longer readable text with paragraphs and meaningful content.",
            "</p><p>Second paragraph with additional words.</p></body></html>"
        );
        let chosen = MobiAdapter::extract_html_body_or_document(input).unwrap_or_default();
        assert!(chosen.contains("Title"));
        assert!(chosen.contains("Second paragraph"));
    }

    #[test]
    fn recindex_image_replacement_inlines_data_uri() {
        let html = r#"<p><img recindex="12" src="images/missing.jpg" alt="x"></p>"#;
        let mut map = HashMap::new();
        map.insert("12".to_string(), "data:image/png;base64,AAAA".to_string());
        let out = MobiAdapter::inline_mobi_images(html, &map);
        assert!(out.contains("data:image/png;base64,AAAA"));
    }

    #[test]
    fn build_mobi_image_map_includes_one_based_aliases() {
        let mut data = vec![0u8; 380];
        data[76..78].copy_from_slice(&(2u16).to_be_bytes());

        let table_start = 78usize;
        let offsets = [100u32, 300u32];
        for (i, off) in offsets.iter().enumerate() {
            let entry = table_start + i * 8;
            data[entry..entry + 4].copy_from_slice(&off.to_be_bytes());
        }

        let record0 = offsets[0] as usize;
        let mobi_start = record0 + 16;
        data[mobi_start..mobi_start + 4].copy_from_slice(b"MOBI");
        data[mobi_start + 92..mobi_start + 96].copy_from_slice(&(1u32).to_be_bytes());

        let record1 = offsets[1] as usize;
        let jpeg = [
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, b'J', b'F', b'I', b'F', 0x00, 0x01, 0x02, 0x03,
            0x04, 0x05, 0x06, 0x07,
        ];
        data[record1..record1 + jpeg.len()].copy_from_slice(&jpeg);

        let map = MobiAdapter::build_mobi_image_map(&data);
        assert!(map.contains_key("image0"));
        assert!(map.contains_key("image1"));
        assert!(map.contains_key("0001"));
        assert!(map.contains_key("images/image1.jpeg"));
        assert!(map.contains_key("images/00001.jpeg"));
        assert!(map.contains_key("images/image1.jpg"));
    }

    #[test]
    fn kindle_embed_zero_padded_id_resolves_to_non_padded_key() {
        let html = r#"<img src="kindle:embed:0001">"#;
        let mut map = HashMap::new();
        map.insert("1".to_string(), "data:image/png;base64,AAAA".to_string());
        let out = MobiAdapter::inline_mobi_images(html, &map);
        assert!(out.contains("data:image/png;base64,AAAA"));
    }

    #[test]
    fn unquoted_src_attribute_is_inlined() {
        let html = r#"<p><img src=kindle:embed:1 alt=x></p>"#;
        let mut map = HashMap::new();
        map.insert("1".to_string(), "data:image/png;base64,AAAA".to_string());
        let out = MobiAdapter::inline_mobi_images(html, &map);
        assert!(out.contains("data:image/png;base64,AAAA"));
    }

    #[test]
    fn reads_first_last_content_record_from_mobi_header_offsets() {
        let mut data = vec![0u8; 512];
        data[76..78].copy_from_slice(&(4u16).to_be_bytes());

        let table_start = 78usize;
        let offsets = [120u32, 200u32, 280u32, 360u32];
        for (i, off) in offsets.iter().enumerate() {
            let entry = table_start + i * 8;
            data[entry..entry + 4].copy_from_slice(&off.to_be_bytes());
        }

        let record0 = offsets[0] as usize;
        data[record0..record0 + 2].copy_from_slice(&(1u16).to_be_bytes());
        data[record0 + 4..record0 + 8].copy_from_slice(&(128u32).to_be_bytes());
        data[record0 + 8..record0 + 10].copy_from_slice(&(2u16).to_be_bytes());

        let mobi_start = record0 + 16;
        data[mobi_start..mobi_start + 4].copy_from_slice(b"MOBI");
        data[mobi_start + 4..mobi_start + 8].copy_from_slice(&(232u32).to_be_bytes());
        data[mobi_start + 176..mobi_start + 178].copy_from_slice(&(2u16).to_be_bytes());
        data[mobi_start + 178..mobi_start + 180].copy_from_slice(&(3u16).to_be_bytes());

        let rec_offsets = MobiAdapter::parse_pdb_record_offsets(&data).unwrap();
        let (first, last, _, _, _, _) =
            MobiAdapter::parse_text_record_range_and_flags(&data, &rec_offsets).unwrap();
        assert_eq!((first, last), (2, 3));
    }

    #[test]
    fn trim_garbage_tail_does_not_cut_on_paragraph_end() {
        let raw = "<html><body><p>One</p><p>Two</p>Trailing";
        let trimmed = MobiAdapter::trim_garbage_tail(raw);
        assert!(trimmed.contains("<p>Two</p>"));
        assert!(trimmed.ends_with("Trailing"));
    }

    #[test]
    fn cp1252_decodes_smart_quotes() {
        let decoded = MobiAdapter::decode_text_bytes(&[0x93, b'H', b'i', 0x94], 1252);
        assert_eq!(decoded, "“Hi”");
    }

    #[test]
    fn readability_scoring_prefers_clean_candidate() {
        let clean = "<html><body><p>This is readable text with words and structure.</p></body></html>";
        let garbage = "<html><body>\u{0001}\u{0002}\u{0003}��\u{0004}\u{0005}</body></html>";
        let chosen = MobiAdapter::pick_best_decoded_candidate(vec![garbage.to_string(), clean.to_string()])
            .unwrap_or_default();
        assert_eq!(chosen, clean);
    }
}
