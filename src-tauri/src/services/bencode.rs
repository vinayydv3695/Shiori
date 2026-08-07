//! Minimal bencode decoder for .torrent files (dataset shard metadata).
//! Only handles what libgen/AA shard torrents contain — dicts, lists,
//! byte strings, integers; no support for non-UTF-8 edge cases beyond
//! lossy decoding of file names.

/// Return the `/`-joined file names listed in a bencoded .torrent file.
///
/// Extracts `info.files[].path` (multi-file form) or `info.name`
/// (single-file form). Malformed input yields an empty vec — never panics.
pub fn torrent_file_names(bytes: &[u8]) -> Vec<String> {
    let Some(Value::Dict(entries)) = parse_top_level(bytes) else {
        return Vec::new();
    };
    let Some((_, Value::Dict(info_entries))) = entries.iter().find(|(k, _)| k == b"info") else {
        return Vec::new();
    };

    // Multi-file form: info.files = [ { path: [...], length: N }, ... ]
    if let Some((_, Value::List(files))) = info_entries.iter().find(|(k, _)| k == b"files") {
        let mut names = Vec::new();
        for file in files {
            let Value::Dict(file_entries) = file else { continue };
            let Some((_, Value::List(path))) =
                file_entries.iter().find(|(k, _)| k == b"path")
            else {
                continue;
            };
            let parts = path
                .iter()
                .filter_map(|part| match part {
                    Value::Bytes(b) => Some(String::from_utf8_lossy(b).into_owned()),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if !parts.is_empty() {
                names.push(parts.join("/"));
            }
        }
        return names;
    }

    // Single-file form: info.name + info.length
    if let Some((_, Value::Bytes(name))) = info_entries.iter().find(|(k, _)| k == b"name") {
        return vec![String::from_utf8_lossy(name).into_owned()];
    }

    Vec::new()
}

enum Value {
    Bytes(Vec<u8>),
    // Parsed for structural correctness (dict/list alignment); values unused.
    #[allow(dead_code)]
    Int(i64),
    List(Vec<Value>),
    Dict(Vec<(Vec<u8>, Value)>),
}

fn parse_top_level(bytes: &[u8]) -> Option<Value> {
    let mut cursor = Cursor { bytes, pos: 0 };
    let value = cursor.parse_value()?;
    // Trailing garbage is tolerated; we only need the leading structure.
    Some(value)
}

struct Cursor<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn parse_value(&mut self) -> Option<Value> {
        match self.peek()? {
            b'i' => self.parse_int(),
            b'l' => self.parse_list(),
            b'd' => self.parse_dict(),
            b'0'..=b'9' => self.parse_bytes(),
            _ => None,
        }
    }

    fn parse_int(&mut self) -> Option<Value> {
        self.pos += 1; // consume 'i'
        let rest = &self.bytes[self.pos..];
        let end = rest.iter().position(|&b| b == b'e')?;
        let digits = &rest[..end];
        self.pos += end + 1;
        let text = std::str::from_utf8(digits).ok()?;
        Some(Value::Int(text.parse::<i64>().ok()?))
    }

    fn parse_bytes(&mut self) -> Option<Value> {
        let rest = &self.bytes[self.pos..];
        let colon = rest.iter().position(|&b| b == b':')?;
        let len_text = std::str::from_utf8(&rest[..colon]).ok()?;
        let len = len_text.parse::<usize>().ok()?;
        self.pos += colon + 1;
        let end = self.pos.checked_add(len)?;
        if end > self.bytes.len() {
            return None;
        }
        let data = self.bytes[self.pos..end].to_vec();
        self.pos = end;
        Some(Value::Bytes(data))
    }

    fn parse_list(&mut self) -> Option<Value> {
        self.pos += 1; // consume 'l'
        let mut items = Vec::new();
        loop {
            match self.peek()? {
                b'e' => {
                    self.pos += 1;
                    return Some(Value::List(items));
                }
                _ => items.push(self.parse_value()?),
            }
        }
    }

    fn parse_dict(&mut self) -> Option<Value> {
        self.pos += 1; // consume 'd'
        let mut entries = Vec::new();
        loop {
            match self.peek()? {
                b'e' => {
                    self.pos += 1;
                    return Some(Value::Dict(entries));
                }
                _ => {
                    let key = match self.parse_bytes()? {
                        Value::Bytes(bytes) => bytes,
                        _ => return None,
                    };
                    let value = self.parse_value()?;
                    entries.push((key, value));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::torrent_file_names;

    fn bencode_str(s: &str) -> Vec<u8> {
        format!("{}:{}", s.len(), s).into_bytes()
    }

    fn bencode_int(n: i64) -> Vec<u8> {
        format!("i{}e", n).into_bytes()
    }

    /// Hand-build `d...e` from alternating key/value byte fragments.
    fn bencode_dict(entries: &[(&[u8], Vec<u8>)]) -> Vec<u8> {
        let mut out = vec![b'd'];
        for (key, value) in entries {
            out.extend_from_slice(&bencode_str(&String::from_utf8_lossy(key)));
            out.extend_from_slice(value);
        }
        out.push(b'e');
        out
    }

    fn file_entry(name: &str, length: i64) -> Vec<u8> {
        let path = {
            let mut p = vec![b'l'];
            for part in name.split('/') {
                p.extend_from_slice(&bencode_str(part));
            }
            p.push(b'e');
            p
        };
        bencode_dict(&[
            (b"path", path),
            (b"length", bencode_int(length)),
        ])
    }

    #[test]
    fn parses_multi_file_info() {
        let md5 = "0123456789abcdef0123456789abcdef";
        let files = {
            let mut l = vec![b'l'];
            l.extend_from_slice(&file_entry(&format!("{}.epub", md5), 1234));
            l.extend_from_slice(&file_entry("another_book.pdf", 5678));
            l.push(b'e');
            l
        };
        let info = bencode_dict(&[
            (b"name", bencode_str("some dataset shard")),
            (b"files", files),
        ]);
        let torrent = bencode_dict(&[(b"info", info)]);

        let names = torrent_file_names(&torrent);
        assert_eq!(
            names,
            vec![
                format!("{}.epub", md5),
                "another_book.pdf".to_string()
            ]
        );
    }

    #[test]
    fn parses_nested_paths_and_single_file_form() {
        // Multi-file with nested directory path.
        let files = {
            let mut l = vec![b'l'];
            l.extend_from_slice(&file_entry("dir/subdir/abc.epub", 10));
            l.push(b'e');
            l
        };
        let info = bencode_dict(&[(b"name", bencode_str("nested")), (b"files", files)]);
        let torrent = bencode_dict(&[(b"info", info)]);
        assert_eq!(torrent_file_names(&torrent), vec!["dir/subdir/abc.epub"]);

        // Single-file form: only info.name + info.length.
        let single_info = bencode_dict(&[
            (b"name", bencode_str("single.epub")),
            (b"length", bencode_int(42)),
        ]);
        let single = bencode_dict(&[(b"info", single_info)]);
        assert_eq!(torrent_file_names(&single), vec!["single.epub"]);
    }

    #[test]
    fn malformed_input_returns_empty() {
        assert!(torrent_file_names(b"").is_empty());
        assert!(torrent_file_names(b"garbage").is_empty());
        assert!(torrent_file_names(b"d4:infod4:name5:hello").is_empty()); // unterminated
        assert!(torrent_file_names(b"li1e").is_empty()); // unterminated list
        assert!(torrent_file_names(b"d5:valuei-1e").is_empty()); // no info key
        assert!(torrent_file_names(b"999999999999:toolong").is_empty()); // length exceeds input
        assert!(torrent_file_names(b"d4:infoi123e").is_empty()); // info is an int, not a dict
    }
}
