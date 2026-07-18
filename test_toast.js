import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  
  // Try to find the sonner toaster in the DOM
  const toasterExists = await page.evaluate(() => {
    return !!document.querySelector('[data-sonner-toaster]');
  });
  console.log('Toaster exists on load:', toasterExists);
  
  await browser.close();
})();
