#[tokio::main]
async fn main() {
    let raw_html = "<p>Some text</p><img src=\"test.jpg\"/>\n<aside>Info</aside>";
    let stripped = crate::conversion::utils::strip_html_tags(raw_html);
    let sanitized = crate::conversion::utils::sanitize_html_for_epub(raw_html);
    println!("STRIPPED: {}", stripped);
    println!("SANITIZED: {}", sanitized);
}
