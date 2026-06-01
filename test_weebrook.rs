use reqwest;

#[tokio::main]
async fn main() {
    let url = "https://weebrook.com/toon/?m_orderby=latest&genre[0]=manhwa";
    let res = reqwest::Client::new().get(url).build();
    println!("{:?}", res);
}
