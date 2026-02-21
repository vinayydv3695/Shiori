fn main() {
    let doc = epub::doc::EpubDoc::new("dummy.epub").unwrap();
    for (_id, item) in &doc.resources {
        println!("{:?}", item.0); // If tuple, this works. If struct, item.0 fails.
    }
}
