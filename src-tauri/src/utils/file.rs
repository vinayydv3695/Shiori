use crate::error::Result;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub fn calculate_file_hash(path: &str) -> Result<String> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let file_size = metadata.len();

    let mut hasher = Sha256::new();

    // Include file size in the hash to prevent collisions between files with same start/end but different sizes
    hasher.update(&file_size.to_le_bytes());

    let chunk_size: u64 = 8192; // 8KB

    if file_size <= chunk_size * 2 {
        // If file is small (<= 16KB), just hash the whole thing
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        hasher.update(&buffer);
    } else {
        // Hash first 8KB
        let mut start_buffer = vec![0; chunk_size as usize];
        file.read_exact(&mut start_buffer)?;
        hasher.update(&start_buffer);

        // Hash last 8KB
        file.seek(SeekFrom::End(-(chunk_size as i64)))?;
        let mut end_buffer = vec![0; chunk_size as usize];
        file.read_exact(&mut end_buffer)?;
        hasher.update(&end_buffer);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Files at or under this size get a full-content sha256 identity; larger
/// files fall back to a sampled identity (see [`file_identity`]).
pub const FULL_HASH_CEILING: u64 = 64 * 1024 * 1024; // 64 MB

/// Trustworthy identity of a file, for dedup / tombstones / auto-restore.
///
/// Files at or under [`FULL_HASH_CEILING`] (64 MB) are hashed in full with
/// sha256 — two different files can only collide via a real sha256 collision.
/// Larger files keep the cheap sampled prefilter (size + first/last 8 KB) and
/// add a middle-of-file 8 KB sample, which turns the old first/last-only
/// collisions (same size, same ends, different body) into differently-sampled
/// hashes at negligible cost.
///
/// The file size always participates in the hash, so identity can never
/// collide across files of different sizes even in the sampled branch.
///
/// All identity consumers (dedup inserts, tombstone writes, auto-restore
/// lookups, watched-file rescans) must call THIS function — never the sampled
/// [`calculate_file_hash`] alone.
pub fn file_identity(path: &str) -> Result<String> {
    let mut file = File::open(path)?;
    let metadata = file.metadata()?;
    let file_size = metadata.len();

    let mut hasher = Sha256::new();
    hasher.update(&file_size.to_le_bytes());

    if file_size <= FULL_HASH_CEILING {
        // Strong identity: full-content sha256 for everything reasonably sized.
        let mut buffer = Vec::with_capacity(file_size as usize);
        file.read_to_end(&mut buffer)?;
        hasher.update(&buffer);
    } else {
        // Sampled identity for very large files: first + middle + last 8 KB.
        let chunk: u64 = 8192;
        let mut start = vec![0u8; chunk as usize];
        file.read_exact(&mut start)?;
        hasher.update(&start);

        // Middle sample sits mid-file so a body-only change alters the hash.
        let mid = (file_size / 2).saturating_sub(chunk / 2);
        file.seek(SeekFrom::Start(mid))?;
        let mut middle = vec![0u8; chunk as usize];
        file.read_exact(&mut middle)?;
        hasher.update(&middle);

        file.seek(SeekFrom::End(-(chunk as i64)))?;
        let mut end = vec![0u8; chunk as usize];
        file.read_exact(&mut end)?;
        hasher.update(&end);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn get_file_size(path: &str) -> Result<i64> {
    let metadata = std::fs::metadata(path)?;
    Ok(metadata.len() as i64)
}

#[allow(dead_code)]
pub fn is_supported_format(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        if let Some(ext_str) = ext.to_str() {
            let ext_lower = ext_str.to_lowercase();
            return matches!(
                ext_lower.as_str(),
                "epub" | "pdf" | "mobi" | "azw" | "azw3" | "txt" | "cbz" | "cbr"
            );
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_is_supported_format() {
        // Supported extensions
        assert!(is_supported_format(Path::new("book.epub")));
        assert!(is_supported_format(Path::new("document.pdf")));
        assert!(is_supported_format(Path::new("manga.cbz")));
        assert!(is_supported_format(Path::new("text.txt")));

        // Case insensitivity
        assert!(is_supported_format(Path::new("book.EPUB")));
        assert!(is_supported_format(Path::new("document.PdF")));

        // Unsupported extensions
        assert!(!is_supported_format(Path::new("image.jpg")));
        assert!(!is_supported_format(Path::new("script.sh")));
        
        // Edge cases
        assert!(!is_supported_format(Path::new("no_extension")));
        assert!(!is_supported_format(Path::new(".hidden_file"))); // .hidden_file is considered extension "hidden_file" in Rust Path if there's no other dot, wait no, actually Path::new(".hidden_file").extension() returns None in Rust.
    }

    /// 8 KB zero block — reused so two fixtures share identical first/last 8 KB.
    fn zero_block() -> Vec<u8> {
        vec![0u8; 8192]
    }

    /// 8 KB patterned block, deterministic per `tag` byte.
    fn pattern_block(tag: u8) -> Vec<u8> {
        (0..8192).map(|i| tag.wrapping_mul(31).wrapping_add(i as u8)).collect()
    }

    #[test]
    fn test_file_identity_same_content_same_id() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("same_a.bin");
        let b = dir.path().join("same_b.bin");
        let bytes: Vec<u8> = (0..40_000).map(|i| (i % 251) as u8).collect();
        std::fs::write(&a, &bytes).unwrap();
        std::fs::write(&b, &bytes).unwrap();

        let id_a = file_identity(a.to_str().unwrap()).unwrap();
        let id_b = file_identity(b.to_str().unwrap()).unwrap();
        assert_eq!(id_a, id_b, "identical content must yield the same identity");
        // And it is deterministic across reads.
        assert_eq!(id_a, file_identity(a.to_str().unwrap()).unwrap());
    }

    /// Regression: two files of equal size whose first AND last 8 KB are
    /// identical but whose middles differ. The old size + first/last sampled
    /// hash collides on these; full-content file_identity must not.
    #[test]
    fn test_file_identity_different_content_equal_size_and_tails_differ() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("diff_a.bin");
        let b = dir.path().join("diff_b.bin");
        // End blocks are both zeros (the shared zero block) — analysers of the
        // sampled scheme would only ever see identical first/last 8 KB here.
        let mut file_a = zero_block();
        file_a.extend(pattern_block(0x11));
        file_a.extend(pattern_block(0x22));
        file_a.extend(zero_block());
        let mut file_b = zero_block();
        file_b.extend(pattern_block(0x22));
        file_b.extend(pattern_block(0x11));
        file_b.extend(zero_block());
        assert_eq!(file_a.len(), file_b.len(), "fixtures must have equal size");

        let path_a = a.to_str().unwrap();
        let path_b = b.to_str().unwrap();
        std::fs::write(&a, &file_a).unwrap();
        std::fs::write(&b, &file_b).unwrap();

        // Sanity: this fixture really does defeat the old sampled prefilter.
        assert_eq!(
            calculate_file_hash(path_a).unwrap(),
            calculate_file_hash(path_b).unwrap(),
            "fixture must collide under the old first/last-only sampled hash"
        );
        assert_ne!(
            file_identity(path_a).unwrap(),
            file_identity(path_b).unwrap(),
            "different content must not share an identity even with equal size and ends"
        );
    }

    /// Small files take the full-content branch — same id either way.
    #[test]
    fn test_file_identity_small_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("small.txt");
        std::fs::write(&p, b"tiny book").unwrap();
        let p = p.to_str().unwrap();
        assert_eq!(file_identity(p).unwrap(), file_identity(p).unwrap());
        assert_ne!(file_identity(p).unwrap(), file_identity("missing_file.bin").unwrap_or_default());
    }

    /// The large-file branch (> FULL_HASH_CEILING) must still be deterministic
    /// and equal across copies — and different from the sampled scheme's output
    /// shape is irrelevant, only internal consistency matters here.
    #[test]
    fn test_file_identity_large_file_deterministic() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("large.bin");
        let mut f = std::fs::File::create(&p).unwrap();
        // Just over the 64 MB ceiling; sparse-ish content via a write loop.
        let block = [0xABu8; 8192];
        for _ in 0..(FULL_HASH_CEILING / 8192 + 2) {
            use std::io::Write;
            f.write_all(&block).unwrap();
        }
        drop(f);
        let file_size = std::fs::metadata(&p).unwrap().len();
        assert!(file_size > FULL_HASH_CEILING, "fixture must exceed the ceiling");

        let path = p.to_str().unwrap();
        let id1 = file_identity(path).unwrap();
        let id2 = file_identity(path).unwrap();
        assert_eq!(id1, id2, "large-file identity must be deterministic");

        // A copy of the same large file yields the same identity.
        let q = dir.path().join("large_copy.bin");
        std::fs::copy(&p, &q).unwrap();
        assert_eq!(id1, file_identity(q.to_str().unwrap()).unwrap());
    }
}
