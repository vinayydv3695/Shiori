import { chromium } from 'playwright';
import readline from 'readline';

async function main() {
    // Launch headless chromium
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to mangafire filter page where extendClient is loaded
    await page.goto('https://mangafire.to/filter', { waitUntil: 'networkidle' });
    
    // Wait for Cloudflare challenge to pass
    let attempts = 0;
    while (attempts < 60) {
        const hasChallenge = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            return text.includes('Just a moment') || 
                   text.includes('Checking your browser') ||
                   !!document.querySelector('#challenge-running') ||
                   document.title.includes('Just a moment');
        });
        if (!hasChallenge) break;
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    // Give it a brief moment after challenge disappears to initialize site scripts
    await new Promise(r => setTimeout(r, 2000));

    // Wait for extendClient to be available (MangaFire site JS)
    let siteJsAttempts = 0;
    while (siteJsAttempts < 20) {
        const hasExtendClient = await page.evaluate(() => typeof window.extendClient !== 'undefined');
        if (hasExtendClient) break;
        await new Promise(r => setTimeout(r, 1000));
        siteJsAttempts++;
    }

    // Inject axios
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js' });

    // Initialize our axios instance
    await page.evaluate(() => {
        window.myAxios = axios.create({ 
            baseURL: `/`, 
            withCredentials: true, 
            headers: { 
                Accept: `application/json`, 
                "X-Requested-With": `XMLHttpRequest` 
            } 
        });
        if (window.extendClient) {
            window.extendClient(window.myAxios);
        } else {
            console.error("extendClient not found");
        }
    });

    // Notify that we are ready
    console.log(JSON.stringify({ ready: true }));

    // Read lines from stdin
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on('line', async (line) => {
        if (!line.trim()) return;
        try {
            const req = JSON.parse(line);
            
            if (req.method === 'fetch') {
                const { url, params } = req.params;
                const result = await page.evaluate(async ({ url, params: passedParams }) => {
                    try {
                        const [path, queryString] = url.split('?');
                        const queryParams = {};
                        if (queryString) {
                            const searchParams = new URLSearchParams(queryString);
                            for (const [key, value] of searchParams.entries()) {
                                queryParams[key] = value;
                            }
                        }
                        const combinedParams = { ...queryParams, ...(passedParams || {}) };

                        const res = await window.myAxios.get(path, { params: combinedParams });
                        return { data: res.data };
                    } catch (e) {
                        return { error: e.message, status: e.response?.status };
                    }
                }, { url, params });
                
                console.log(JSON.stringify({ id: req.id, result }));
            }
        } catch (e) {
            // Ignore non-json or malformed lines silently or print debug to stderr
            console.error("Error processing line:", e);
        }
    });
    
    // Exit when parent closes stdin
    rl.on('close', async () => {
        await browser.close();
        process.exit(0);
    });
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
