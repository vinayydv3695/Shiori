#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx.json?download=true";
    let res = client.get(url).send().await?;
    println!("Status: {}", res.status());
    let bytes = res.bytes().await?;
    println!("Bytes length: {}", bytes.len());
    Ok(())
}
