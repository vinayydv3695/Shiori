use std::{ffi::OsString, path::Path, sync::Mutex};

pub fn enqueue(queue: &Mutex<Vec<String>>, args: impl IntoIterator<Item = OsString>, cwd: &Path) {
    let mut pending = queue.lock().unwrap();
    for arg in args.into_iter().skip(1) {
        if arg.to_string_lossy().starts_with('-') {
            continue;
        }
        let path = if let Some(text) = arg.to_str().filter(|s| s.contains("://")) {
            let Ok(url) = url::Url::parse(text) else {
                continue;
            };
            if url.scheme() != "file" {
                continue;
            }
            let Ok(path) = url.to_file_path() else {
                continue;
            };
            path
        } else {
            cwd.join(arg)
        };
        let Ok(path) = path.canonicalize() else {
            continue;
        };
        if !path.is_file() {
            continue;
        }
        let Some(path) = path.to_str() else { continue };
        if !pending.iter().any(|p| p == path) {
            pending.push(path.to_owned());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_file_uri_and_warm_reopen() {
        let dir = std::env::temp_dir().join(format!("shiori-windows-open-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("space 日本.epub");
        std::fs::write(&path, b"test").unwrap();
        let uri = url::Url::from_file_path(&path).unwrap();
        assert_eq!(uri.to_file_path().unwrap(), path);
        let canonical = path.canonicalize().unwrap().into_os_string().into_string().unwrap();
        let queue = Mutex::new(Vec::new());
        enqueue(&queue, ["shiori".into(), uri.to_string().into()], &dir);
        assert_eq!(*queue.lock().unwrap(), vec![canonical.clone()]);
        queue.lock().unwrap().clear();
        enqueue(&queue, ["shiori".into(), "space 日本.epub".into()], &dir);
        assert_eq!(*queue.lock().unwrap(), vec![canonical.clone()]);
        queue.lock().unwrap().clear();
        enqueue(&queue, ["shiori".into(), canonical.clone().into()], &dir);
        assert_eq!(*queue.lock().unwrap(), vec![canonical]);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn cold_warm_and_reopen() {
        let dir = std::env::temp_dir().join(format!("shiori-open-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = dir.join("space 日本.epub");
        let second = dir.join("second.epub");
        std::fs::write(&first, b"test").unwrap();
        std::fs::write(&second, b"test").unwrap();
        let queue = Mutex::new(Vec::new());
        let args = vec![
            "shiori".into(),
            "--flag".into(),
            "space 日本.epub".into(),
            url::Url::from_file_path(&first).unwrap().to_string().into(),
            second.clone().into_os_string(),
            "https://example.com/book.epub".into(),
            "file://remote/book.epub".into(),
            "file://%".into(),
            dir.clone().into_os_string(),
        ];
        enqueue(&queue, args, &dir);
        assert_eq!(queue.lock().unwrap().len(), 2);
        enqueue(
            &queue,
            ["shiori".into(), first.clone().into_os_string()],
            &dir,
        );
        assert_eq!(queue.lock().unwrap().len(), 2);
        queue.lock().unwrap().clear();
        enqueue(&queue, ["shiori".into(), first.into_os_string()], &dir);
        assert_eq!(queue.lock().unwrap().len(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
