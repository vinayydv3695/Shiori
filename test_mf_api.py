from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # We will go to the filter page, wait for genres, and click one to see the API request
    requests = []
    page.on("request", lambda request: requests.append(request.url) if "/api/titles" in request.url else None)
    
    page.goto("https://mangafire.to/filter?genre[]=1&type[]=manga", wait_until="networkidle")
    print("API REQUESTS:", requests)
    browser.close()
