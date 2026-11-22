import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:5173/';
const executablePath = process.env.CHROME_PATH ?? '/usr/bin/chromium';
const captureRoot = resolve('.impeccable/review/routes');
const viewports = [
  { name: 'tablet-800x1280', width: 800, height: 1280, isMobile: false, hasTouch: true },
  { name: 'phone-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
];

async function seedSettings(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('tegakko', 6);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('settings', 'readwrite');
      transaction.objectStore('settings').put(
        { widthPreset: 'expressive', idleTimeoutMs: 300_000, penCheckShown: true },
        'singleton',
      );
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
}

async function capture(page, directory, name, fullPage = false) {
  await page.screenshot({ path: resolve(directory, `${name}.png`), fullPage });
}

async function captureBottom(page, directory, name) {
  await page.locator('main').evaluate((main) => main.scrollTo(0, main.scrollHeight));
  await page.waitForTimeout(100);
  await capture(page, directory, name);
  await page.locator('main').evaluate((main) => main.scrollTo(0, 0));
}

async function captureViewport(viewport) {
  const directory = resolve(captureRoot, viewport.name);
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Check your stylus' }).waitFor();
    await capture(page, directory, 'first-run');
    await captureBottom(page, directory, 'first-run-bottom');

    await seedSettings(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'What would you like to write?' }).waitFor();
    await capture(page, directory, 'scope-picker');
    await captureBottom(page, directory, 'scope-picker-bottom');

    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('heading', { name: 'History' }).waitFor();
    await page.locator('main .section-title').first().waitFor();
    await capture(page, directory, 'history-empty');

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await capture(page, directory, 'settings');
    await captureBottom(page, directory, 'settings-bottom');

    const backup = {
      version: 3,
      exportedAt: new Date().toISOString(),
      tallies: [],
      attempts: [],
      sessions: [],
    };
    await page.locator('[data-testid="import-file"]').setInputFiles({
      name: 'empty-progress.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.getByRole('alertdialog').waitFor();
    await capture(page, directory, 'settings-import-warning');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('heading', { name: 'What would you like to write?' }).waitFor();
    await page.getByRole('radio', { name: '10', exact: true }).click();
    await page.getByRole('button', { name: 'Start writing' }).click();
    await page.getByText('Write from memory').waitFor();
    await capture(page, directory, 'drill', false);

    await page.getByRole('button', { name: 'Reveal' }).click();
    await capture(page, directory, 'drill-reveal', false);
    await page.getByRole('button', { name: 'Missed' }).click();
    await page.getByText('Marked missed').waitFor();
    await capture(page, directory, 'drill-feedback', false);

    await page.getByRole('button', { name: "I'm done" }).click();
    await page.getByRole('main').getByRole('heading', { name: 'Session summary' }).waitFor();
    await capture(page, directory, 'session-summary');

    await page.getByRole('button', { name: 'History' }).click();
    await page.getByRole('heading', { name: 'History' }).waitFor();
    await page.locator('main .section-title').first().waitFor();
    await capture(page, directory, 'history-populated');

    console.log(`${viewport.name}: captured First Run, Scope Picker, Drill, Summary, History, and Settings states in ${directory}`);
  } finally {
    await browser.close();
  }
}

for (const viewport of viewports) await captureViewport(viewport);
