use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct MangaDexChapterRelationship {
    r#type: String,
    id: String,
    attributes: Option<MangaDexScanlationGroupAttributes>,
}

#[derive(Debug, Deserialize)]
struct MangaDexScanlationGroupAttributes {
    name: Option<String>,
}

#[test]
fn test_array() {
    let json_array = r#"
    {
        "type": "scanlation_group",
        "id": "123",
        "attributes": []
    }
    "#;
    let res1: Result<MangaDexChapterRelationship, _> = serde_json::from_str(json_array);
    println!("Array result: {:?}", res1);
    assert!(res1.is_err());
}
