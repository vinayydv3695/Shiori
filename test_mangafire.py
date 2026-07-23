from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto("https://mangafire.to/filter", wait_until="networkidle")
    content = page.content()
    with open("mangafire_filter_dump.html", "w", encoding="utf-8") as f:
        f.write(content)
    browser.close()
