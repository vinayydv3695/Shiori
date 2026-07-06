#[tokio::test]
async fn test_mangadex_live() {
    let source = shiori::sources::mangadex::MangaDexSource::new().unwrap();
    use shiori::sources::Source;
    // f9c33607-9180-4ba6-b85c-e4b5faee7192 has english chapters
    match source.get_chapters("f9c33607-9180-4ba6-b85c-e4b5faee7192").await {
        Ok(chapters) => println!("Success: {} chapters", chapters.len()),
        Err(e) => {
            println!("Error: {:?}", e);
            panic!("Live test failed!");
        }
    }
}
