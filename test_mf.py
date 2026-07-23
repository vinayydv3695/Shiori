from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://mangafire.to/filter", wait_until="networkidle")
    
    # Save a screenshot
    page.screenshot(path="mangafire_filter.png")
    
    # Print the page title and body text
    print(page.title())
    print(page.evaluate('document.body.innerText')[:1000])
    browser.close()
