use epub::doc::EpubDoc;
fn test() {
    let doc = EpubDoc::new("test").unwrap();
    for (id, res) in &doc.resources {
        let _: () = res;
    }
}
