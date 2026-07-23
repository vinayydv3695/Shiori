from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://mangafire.to/filter", wait_until="networkidle")
    html = page.content()
    with open("mf_filter.html", "w") as f:
        f.write(html)
    browser.close()
