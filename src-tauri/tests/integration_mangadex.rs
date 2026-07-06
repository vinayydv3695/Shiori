use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};
use shiori::sources::{Source, mangadex::MangaDexSource};

#[tokio::test]
async fn test_mangadex_search_flow() {
    // 1. Spin up Wiremock
    let mock_server = MockServer::start().await;
    
    // Override MANGADEX_API_BASE
    std::env::set_var("MANGADEX_API_BASE", &mock_server.uri());

    // 2. Setup mock response for search
    let search_json = serde_json::json!({
        "result": "ok",
        "response": "collection",
        "data": [
            {
                "id": "1234-abcd",
                "type": "manga",
                "attributes": {
                    "title": { "en": "Mocked Manga" },
                    "description": { "en": "A mocked manga for testing" },
                    "status": "ongoing",
                    "contentRating": "safe"
                },
                "relationships": []
            }
        ],
        "limit": 20,
        "offset": 0,
        "total": 1
    });

    Mock::given(method("GET"))
        .and(path("/manga"))
        .respond_with(ResponseTemplate::new(200).set_body_json(search_json))
        .mount(&mock_server)
        .await;

    // 3. Setup mock response for chapters (reproducing the bug by returning empty data or correctly formed data)
    let chapters_json = serde_json::json!({
        "result": "ok",
        "response": "collection",
        "data": [
            {
                "id": "chap-1",
                "type": "chapter",
                "attributes": {
                    "volume": "1",
                    "chapter": "1",
                    "title": "First Chapter",
                    "translatedLanguage": "en",
                    "pages": 20
                },
                "relationships": [
                    {
                        "id": "some-id",
                        "type": "scanlation_group",
                        "attributes": []
                    }
                ]
            }
        ],
        "limit": 100,
        "offset": 0,
        "total": 1
    });

    Mock::given(method("GET"))
        .and(path("/chapter"))
        .respond_with(ResponseTemplate::new(200).set_body_json(chapters_json))
        .mount(&mock_server)
        .await;

    // 4. Test the pipeline
    let source = MangaDexSource::new().expect("Failed to create source");
    
    // Search
    let search_results = source.search("Mocked", 1).await.expect("Search failed");
    assert_eq!(search_results.len(), 1);
    assert_eq!(search_results[0].title, "Mocked Manga");
    
    // Get Chapters
    let manga_id = &search_results[0].id;
    let chapters = source.get_chapters(manga_id).await.expect("Get chapters failed");
    
    // Right now there's a bug where chapters fail. This will fail if the bug exists.
    assert_eq!(chapters.len(), 1);
    assert_eq!(chapters[0].title, "Chapter 1: First Chapter");
}
