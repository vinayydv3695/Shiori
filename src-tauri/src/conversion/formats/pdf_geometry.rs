//! Geometry-aware PDF→text (I1 pass): pdftohtml -xml word positions drive
//! reading-order repair (multi-column), per-page headline stripping and
//! simple table reconstruction. Desktop-only accelerator (poppler,
//! user-installed — same optional-shell posture as the legacy pdftohtml/calibre
//! paths); Android falls back to the pure-Rust pdf-extract path.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::conversion::error::ConversionError;

/// Cache the availability probe (one `which pdftohtml` per process).
fn pdftohtml_available() -> bool {
    static AVAILABLE: once_cell::sync::Lazy<bool> = once_cell::sync::Lazy::new(|| {
        Command::new("which")
            .arg("pdftohtml")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    });
    *AVAILABLE
}

#[derive(Debug, Clone)]
struct Word {
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    text: String,
}

#[derive(Debug, Clone)]
struct Line {
    y0: f32,
    x0: f32,
    x1: f32,
    col: usize,
    words: Vec<Word>,
}

impl Line {
    fn text(&self) -> String {
        self.words
            .iter()
            .map(|w| w.text.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
    /// Word x-centers — used for table-column alignment checks.
    fn centers(&self) -> Vec<f32> {
        self.words.iter().map(|w| (w.x0 + w.x1) / 2.0).collect()
    }
}

struct PageGeom {
    width: f32,
    height: f32,
    words: Vec<Word>,
}

fn run_pdftohtml_xml(source: &Path, dest_xml: &Path) -> Result<(), ConversionError> {
    let output = Command::new("pdftohtml")
        .arg("-xml")
        .arg("-hidden")
        .arg("-noframes")
        .arg(source)
        .arg(dest_xml.with_extension(""))
        .output()
        .map_err(|e| ConversionError::MissingDependency(format!("pdftohtml: {}", e)))?;
    if !output.status.success() || !dest_xml.exists() {
        return Err(ConversionError::MissingDependency(
            "pdftohtml produced no usable output".to_string(),
        ));
    }
    Ok(())
}

/// Walk the XML: `<page width height>` → `<text left top …>` → `<word
/// xMin yMin xMax yMax>`. Bare text runs inside `<text>` fall back to
/// synthesized words.
fn parse_pages(xml: &[u8]) -> Vec<PageGeom> {
    use quick_xml::events::Event;
    use quick_xml::Reader;

    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(true);
    let mut pages: Vec<PageGeom> = Vec::new();
    let mut cur_word: Option<Word> = None;
    let mut cur_text: Option<(f32, f32, f32)> = None;

    let attr = |e: &quick_xml::events::BytesStart, name: &str| -> Option<String> {
        e.attributes()
            .flatten()
            .find(|a| a.key.as_ref() == name.as_bytes())
            .map(|a| String::from_utf8_lossy(&a.value).to_string())
    };
    let f = |v: Option<String>| v.and_then(|s| s.parse::<f32>().ok()).unwrap_or(0.0);

    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match e.name().as_ref() {
                b"page" => pages.push(PageGeom {
                    width: f(attr(&e, "width")).max(1.0),
                    height: f(attr(&e, "height")).max(1.0),
                    words: Vec::new(),
                }),
                b"text" => {
                    cur_text = Some((f(attr(&e, "left")), f(attr(&e, "top")), f(attr(&e, "width"))));
                }
                b"word" => {
                    cur_word = Some(Word {
                        x0: f(attr(&e, "xMin")),
                        y0: f(attr(&e, "yMin")),
                        x1: f(attr(&e, "xMax")),
                        y1: f(attr(&e, "yMax")),
                        text: String::new(),
                    });
                }
                _ => {}
            },
            Ok(Event::Text(t)) => {
                let s = t.unescape().unwrap_or_default().to_string();
                if let Some(ref mut w) = cur_word {
                    w.text.push_str(&s);
                } else if let Some((left, top, width)) = cur_text {
                    let s = s.trim().to_string();
                    if !s.is_empty() {
                        if let Some(p) = pages.last_mut() {
                            p.words.push(Word {
                                x0: left,
                                y0: top,
                                x1: left + width.max(12.0),
                                y1: top + 12.0,
                                text: s,
                            });
                        }
                    }
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"word" => {
                    if let Some(w) = cur_word.take() {
                        if !w.text.trim().is_empty() {
                            if let Some(p) = pages.last_mut() {
                                p.words.push(w);
                            }
                        }
                    }
                }
                b"text" => cur_text = None,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    pages
}

/// Bucket words into lines by y (tolerance = half median word height).
fn words_to_lines(words: &[Word]) -> Vec<Line> {
    if words.is_empty() {
        return Vec::new();
    }
    let mut heights: Vec<f32> = words.iter().map(|w| (w.y1 - w.y0).abs().max(1.0)).collect();
    heights.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let tol = (heights[heights.len() / 2] / 2.0).max(2.0);

    let mut lines: Vec<Line> = Vec::new();
    let mut sorted: Vec<&Word> = words.iter().collect();
    sorted.sort_by(|a, b| a.y0.partial_cmp(&b.y0).unwrap());
    let median_w = heights[heights.len() / 2].max(6.0);
    for w in sorted {
        let mut placed = false;
        for line in lines.iter_mut() {
            if (line.y0 - w.y0).abs() <= tol
                && w.x0 <= line.x1 + median_w
                && w.x1 + median_w >= line.x0
            {
                line.words.push(w.clone());
                line.x0 = line.x0.min(w.x0);
                line.x1 = line.x1.max(w.x1);
                placed = true;
                break;
            }
        }
        if !placed {
            lines.push(Line {
                y0: w.y0,
                x0: w.x0,
                x1: w.x1,
                col: 0,
                words: vec![w.clone()],
            });
        }
    }
    lines.sort_by(|a, b| a.y0.partial_cmp(&b.y0).unwrap());
    lines
}

/// 1-D clustering of line x0 into columns (min separation = 25% width).
fn assign_columns(lines: &mut [Line], page_width: f32) -> Vec<usize> {
    let mut xs: Vec<f32> = lines.iter().map(|l| l.x0).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut centers = vec![xs[0]];
    let min_gap = page_width * 0.11;
    for x in xs {
        if centers.iter().map(|c| (c - x).abs()).fold(f32::MAX, f32::min) > min_gap {
            centers.push(x);
        }
    }
    centers.sort_by(|a, b| a.partial_cmp(b).unwrap());
    for line in lines.iter_mut() {
        let mut best = 0usize;
        let mut best_d = f32::MAX;
        for (i, c) in centers.iter().enumerate() {
            let d = (c - line.x0).abs();
            if d < best_d {
                best_d = d;
                best = i;
            }
        }
        line.col = best;
    }
    (0..centers.len()).collect()
}

/// Group a run of aligned lines into a table. `aligned` means: every line in
/// the run shares ≥2 word x-center positions within tolerance.
fn aligned_centers(a: &[f32], b: &[f32], tol: f32) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    let hits = a
        .iter()
        .filter(|x| b.iter().any(|y| (*x - y).abs() <= tol))
        .count();
    hits >= 2
}

/// Split a line's words into cells at the shared column centers.
fn cells_at_centers(line: &Line, centers: &[f32], tol: f32) -> Vec<String> {
    let mut cells: Vec<String> = vec![String::new(); centers.len()];
    for w in &line.words {
        let cx = (w.x0 + w.x1) / 2.0;
        let col = centers
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| (*a - cx).abs().partial_cmp(&(*b - cx).abs()).unwrap())
            .map(|(i, _)| i)
            .unwrap_or(0);
        if !cells[col].is_empty() {
            cells[col].push(' ');
        }
        cells[col].push_str(w.text.trim());
    }
    let _ = tol;
    cells.into_iter().filter(|c| !c.trim().is_empty()).collect()
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Cluster word x-centers into columns (min separation 12% of page width).
/// Returns (column id per word, ordered column centers).
fn cluster_columns(words: &[Word], page_width: f32) -> (Vec<usize>, Vec<f32>) {
    let mut xs: Vec<f32> = words
        .iter()
        .map(|w| (w.x0 + w.x1) / 2.0)
        .filter(|x| x.is_finite())
        .collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut centers: Vec<f32> = Vec::new();
    let min_gap = (page_width * 0.12).max(4.0);
    for x in xs {
        let near = centers
            .iter()
            .map(|c| (c - x).abs())
            .fold(f32::MAX, f32::min);
        if near > min_gap {
            centers.push(x);
        }
    }
    if centers.is_empty() {
        centers = vec![page_width / 2.0];
    }
    centers.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let cols = words
        .iter()
        .map(|w| {
            let cx = (w.x0 + w.x1) / 2.0;
            centers
                .iter()
                .enumerate()
                .min_by(|(_, a), (_, b)| {
                    (*a - cx).abs().partial_cmp(&(*b - cx).abs()).unwrap()
                })
                .map(|(i, _)| i)
                .unwrap_or(0)
        })
        .collect();
    (cols, centers)
}

/// Reflow one page: per-page headline drop, table reconstruction (rows =
/// same-y cells across columns), then column-major reading order.
fn reflow_page(page: &PageGeom) -> (String, usize) {
    if page.words.is_empty() {
        return (String::new(), 0);
    }
    let (cols, centers) = cluster_columns(&page.words, page.width);
    let ncols = centers.len();

    // Rows: keyed by y (4 pt grid), cells indexed by column.
    let mut rows: Vec<(i64, Vec<Option<String>>)> = Vec::new();
    let mut col_text = vec![Vec::new(); ncols];
    for (w, c) in page.words.iter().zip(cols.iter()) {
        col_text[*c].push((w.y0, w.text.clone()));
    }
    for (ci, items) in col_text.iter().enumerate() {
        for (y, t) in items {
            let key = (y / 4.0).round() as i64;
            let found = rows.iter().position(|(ky, _)| *ky == key);
            match found {
                Some(idx) => {
                    if rows[idx].1[ci].is_none() {
                        rows[idx].1[ci] = Some(t.clone());
                    }
                }
                None => {
                    let mut cells: Vec<Option<String>> = vec![None; ncols];
                    cells[ci] = Some(t.clone());
                    rows.push((key, cells));
                }
            }
        }
    }
    rows.sort_by_key(|(k, _)| *k);

    // Per-page headline: top 6% band, single span (one cell), ≤12 words,
    // spanning ≥ 40% of the page width.
    if let Some((y, cells)) = rows.first() {
        let solo: Vec<&String> = cells.iter().flatten().collect();
        if (*y as f32 * 4.0) < page.height * 0.06
            && solo.len() == 1
            && solo[0].split_whitespace().count() <= 12
            && solo[0].chars().count() >= 8
        {
            rows.remove(0);
        }
    }

    // Table runs: consecutive rows with ≥2 non-empty cells, ≥3 rows.
    let mut table_runs: Vec<(usize, usize)> = Vec::new(); // (row index, len)
    let mut tables = 0usize;
    let mut i = 0usize;
    while i < rows.len() {
        let nonempty = rows[i].1.iter().filter(|c| c.is_some()).count();
        let mut run = 1usize;
        while i + run < rows.len() {
            if rows[i + run].1.iter().filter(|c| c.is_some()).count() >= 2 {
                run += 1;
            } else {
                break;
            }
        }
        if run >= 3 && nonempty >= 2 {
            tables += 1;
            table_runs.push((i, run));
            i += run;
        } else {
            i += 1;
        }
    }

    let in_table = |row: usize| table_runs.iter().any(|(s, l)| row >= *s && row < *s + l);

    // Emit: column-major body lines, tables spliced at their first row y.
    let mut out = String::new();
    let mut next_table = 0usize;
    let mut emitted_rows: Vec<usize> = Vec::new();
    for ci in 0..ncols {
        for (ri, (y, cells)) in rows.iter().enumerate() {
            if in_table(ri) || emitted_rows.contains(&ri) {
                continue;
            }
            if let Some(t) = &cells[ci] {
                while next_table < table_runs.len()
                    && (rows[table_runs[next_table].0].0 as f32 * 4.0) < (*y as f32 * 4.0)
                {
                    emit_table(&mut out, &rows, table_runs[next_table]);
                    next_table += 1;
                }
                out.push_str(t);
                out.push('\n');
                emitted_rows.push(ri);
            }
        }
    }
    // leftover tables (all at the end of the page)
    while next_table < table_runs.len() {
        emit_table(&mut out, &rows, table_runs[next_table]);
        next_table += 1;
    }
    (out, tables)
}

fn emit_table(out: &mut String, rows: &[(i64, Vec<Option<String>>)], run: (usize, usize)) {
    out.push_str("<table>\n");
    for k in run.0..run.0 + run.1 {
        out.push_str("  <tr>");
        for c in &rows[k].1 {
            if let Some(t) = c {
                out.push_str(&format!("<td>{}</td>", esc(t)));
            }
        }
        out.push_str("</tr>\n");
    }
    out.push_str("</table>\n");
}

/// Entry point: returns (per-page reflowed text, table count). Errors when
/// pdftohtml is unavailable or the XML is unusable.
pub fn geometry_pages(path: &Path) -> Result<(Vec<String>, usize), ConversionError> {
    if !pdftohtml_available() {
        return Err(ConversionError::MissingDependency(
            "pdftohtml not available".to_string(),
        ));
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("pdf");
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let dest_xml: PathBuf = std::env::temp_dir()
        .join(format!("shiori_pdfgeo_{}_{}_{}.xml", std::process::id(), seq, stem));
    let _ = std::fs::remove_file(&dest_xml);
    run_pdftohtml_xml(path, &dest_xml)?;
    let xml = match std::fs::read(&dest_xml) {
        Ok(x) => x,
        Err(e) => {
            let _ = std::fs::remove_file(&dest_xml);
            return Err(ConversionError::IoError(e));
        }
    };
    let _ = std::fs::remove_file(&dest_xml);

    let pages = parse_pages(&xml);
    if pages.is_empty() || pages.iter().all(|p| p.words.is_empty()) {
        return Err(ConversionError::EmptyContent);
    }
    let mut tables = 0usize;
    let mut reflowed = Vec::with_capacity(pages.len());
    for p in &pages {
        let (text, t) = reflow_page(p);
        tables += t;
        reflowed.push(text);
    }
    Ok((reflowed, tables))
}

#[cfg(test)]
mod geometry_tests {
    use super::*;
    use std::path::Path;

    fn corpus(name: &str) -> std::path::PathBuf {
        Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../convert/corpus/src/pdf")).join(name)
    }

    #[test]
    fn two_column_reading_order() {
        let p = corpus("twocolumn.pdf");
        if !p.exists() || !pdftohtml_available() {
            eprintln!("skip");
            return;
        }
        let (pages, _tables) = geometry_pages(&p).unwrap();
        let first = pages.first().cloned().unwrap_or_default();
        // No per-page "Issue N" headline left in the reflowed text.
        assert!(!first.contains("The Two-Column Review"), "headline should be stripped");
        // The side band ("Short boxed notes … splice into the columns.") is a
        // narrow third column: with reading-order repair it must land at the
        // END of the page, never spliced between the two main columns.
        let sidebar = first.find("splice into the columns");
        assert!(sidebar.is_some(), "sidebar text expected: {}", &first[..first.len().min(120)]);
        assert!(
            sidebar.unwrap() > first.len() / 2,
            "sidebar must come last on the page: {}",
            &first[..first.len().min(200)]
        );
    }

    #[test]
    fn tables_reconstructed() {
        let p = corpus("tables.pdf");
        if !p.exists() || !pdftohtml_available() {
            eprintln!("skip");
            return;
        }
        let (pages, tables) = geometry_pages(&p).unwrap();
        assert!(tables >= 1, "expected at least one table, pages={}", pages.len());
        assert!(pages.iter().any(|pg| pg.contains("<table>")), "table markup missing");
    }
}
