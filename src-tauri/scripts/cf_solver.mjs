#!/usr/bin/env node
/**
 * cf_solver.mjs  —  Shiori Cloudflare Challenge Solver  (v4 — final)
 *
 * Usage:
 *   node cf_solver.mjs <url> [headless|visible] [timeout_secs]
 *
 * Output (stdout, last JSON line):
 *   { "cookies": [...], "user_agent": "...", "final_url": "..." }
 *
 * Exit codes:  0 = success   1 = challenge not solved
 *
 * KEY FINDINGS:
 *   ✓ System Chrome (google-chrome-stable) passes CF Turnstile automatically.
 *   ✗ addInitScript() stealth patches break Turnstile (it detects the injection).
 *   ✗ --disable-gpu, --no-zygote, --disable-dev-shm-usage change fingerprint.
 *   ✓ Only 2 extra args needed: --no-sandbox --disable-blink-features=AutomationControlled
 *   ✓ Turnstile auto-resolves in ~5-15 seconds with a real Chrome binary.
 */

import { chromium }   from 'playwright';
import { execSync }   from 'child_process';
import { existsSync } from 'fs';

const [, , targetUrl, modeArg, timeoutArg] = process.argv;

if (!targetUrl) {
  console.error('Usage: node cf_solver.mjs <url> [headless|visible] [timeout_secs]');
  process.exit(1);
}

const wantHeadless = (modeArg === 'headless');
const timeoutMs   = parseInt(timeoutArg || '120', 10) * 1000;

// ─── Find system Chrome ───────────────────────────────────────────────────────

const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-beta',
  '/opt/google/chrome/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findSystemChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) {
      console.error(`[solver] Using: ${p}`);
      return p;
    }
  }
  for (const cmd of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    try {
      const p = execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
      if (p) { console.error(`[solver] Using (PATH): ${p}`); return p; }
    } catch (_) { /* skip */ }
  }
  console.error('[solver] WARNING: No system Chrome found — bundled Chromium may not pass CF Turnstile');
  return null;
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function transformCookies(browserCookies) {
  return browserCookies.map(c => ({
    name:      c.name,
    value:     c.value,
    domain:    c.domain.startsWith('.') ? c.domain.slice(1) : c.domain,
    path:      c.path || '/',
    expires:   c.expires > 0 ? Math.floor(c.expires) : 0,
    http_only: c.httpOnly  || false,
    secure:    c.secure    || false,
    same_site: c.sameSite  || null,
  }));
}

function findClearanceFor(cookies, targetHost) {
  // Extract just the TLD+1 from targetHost for matching.
  const parts = targetHost.replace(/^https?:\/\//, '').split('/')[0].split('.');
  const tld1  = parts.slice(-2).join('.');
  return cookies.find(c => {
    const d = c.domain.replace(/^\./, '');
    return c.name === 'cf_clearance' && (d === tld1 || d.endsWith('.' + tld1));
  });
}

// ─── Main solver ──────────────────────────────────────────────────────────────

async function runSolver(headless) {
  const executablePath = findSystemChrome();

  const browser = await chromium.launch({
    headless,
    executablePath: executablePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Removes the "Chrome is being controlled by automated software" banner
      // and the navigator.webdriver=true flag that CF Turnstile checks.
      '--disable-blink-features=AutomationControlled',
      `--window-size=1366,768`,
      '--lang=en-US',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    // Do NOT use slowMo — it doesn't help and slows us down.
  });

  const context = await browser.newContext({
    locale:            'en-US',
    timezoneId:        'America/New_York',
    viewport:          { width: 1366, height: 768 },
    acceptDownloads:   false,
    javaScriptEnabled: true,
    // Do NOT call addInitScript here — any script injection is detected by Turnstile.
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  let finalUrl  = targetUrl;
  let userAgent = '';

  try {
    console.error(`[solver] Navigating (${headless ? 'headless' : 'visible'}) → ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

    userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '');
    console.error(`[solver] UA: ${userAgent.slice(0, 100)}`);

    if (!headless) {
      console.error('[solver] ▶ Browser window is open. Turnstile usually auto-solves in ~10s.');
      console.error('[solver] ▶ If a checkbox appears, click "Verify you are human".');
    }

    const deadline  = Date.now() + timeoutMs;
    let   lastLog   = 0;

    while (Date.now() < deadline) {
      const raw     = await context.cookies().catch(() => []);
      const cookies = transformCookies(raw);

      // Check for cf_clearance on the target domain.
      const clearance = findClearanceFor(cookies, targetUrl);
      if (clearance) {
        console.error(`[solver] ✓ cf_clearance: ${clearance.value.slice(0, 30)}…`);
        finalUrl = page.url();

        // Short settle wait for any trailing cookies.
        await page.waitForTimeout(1000);
        const settled = transformCookies(await context.cookies().catch(() => raw));

        // Return only relevant cookies (target domain + CF cookies).
        const host = new URL(targetUrl).hostname.split('.').slice(-2).join('.');
        const relevant = settled.filter(c =>
          c.domain.includes(host) ||
          c.name === 'cf_clearance' ||
          c.name === '__cf_bm'      ||
          c.name === '__cflb'       ||
          c.name === '__cfruid'
        );

        const result = {
          cookies:    relevant.length ? relevant : settled,
          user_agent: userAgent,
          final_url:  page.url(),
        };
        console.log(JSON.stringify(result));
        await browser.close().catch(() => {});
        return true;
      }

      // Log status every 5s.
      const now = Date.now();
      if (now - lastLog > 5000) {
        lastLog = now;
        const remaining = Math.ceil((deadline - now) / 1000);
        const content   = await page.content().catch(() => '');
        const lo        = content.toLowerCase();

        if (lo.includes('just a moment') || lo.includes('checking your browser') || lo.includes('challenge-platform')) {
          console.error(`[solver] CF challenge visible — ${remaining}s left`);
        } else if (lo.includes('verify you are human')) {
          console.error(`[solver] Turnstile waiting for click — ${remaining}s left`);
        } else if (content.length > 5000 && !lo.includes('challenge')) {
          // Real content without cf_clearance (CF not enforcing on this request).
          console.error('[solver] Real content loaded without cf_clearance — accepting');
          const result = { cookies, user_agent: userAgent, final_url: page.url() };
          console.log(JSON.stringify(result));
          await browser.close().catch(() => {});
          return true;
        } else {
          console.error(`[solver] Waiting for cf_clearance — ${remaining}s left | ${page.url().slice(0, 60)}`);
        }
      }

      await page.waitForTimeout(1000);
    }

    // Timeout — collect whatever we have.
    const raw     = await context.cookies().catch(() => []);
    const cookies = transformCookies(raw);
    console.error(`[solver] Timed out. Cookies collected: ${cookies.filter(c => c.name === 'cf_clearance').length} cf_clearance`);
    console.log(JSON.stringify({ cookies, user_agent: userAgent, final_url: page.url() }));

  } catch (err) {
    console.error(`[solver] Error: ${err.message}`);
    const raw = await context.cookies().catch(() => []);
    console.log(JSON.stringify({ cookies: transformCookies(raw), user_agent: userAgent, final_url: finalUrl }));
  } finally {
    await browser.close().catch(() => {});
  }

  return false;
}

async function main() {
  const ok = await runSolver(wantHeadless);
  process.exit(ok ? 0 : 1);
}

main();
