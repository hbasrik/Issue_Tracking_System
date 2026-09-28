/**
 * Mobile IssueCard (real source via react-native-web, see build.mjs): pressing
 * any spot of the card — photo included — navigates to IssueDetail, and no
 * fullscreen modal opens on the card.
 * Usage: node verify-mobile-card-press.mjs <bundleDir>
 */
import { chromium } from '../../../../web/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../card-photo-navigation');
const bundle = path.resolve(process.argv[2]);
const url = `${pathToFileURL(path.join(bundle, 'index.html')).href}?theme=light&locale=tr`;

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`ok   ${msg}`);
  else {
    failures++;
    console.error(`FAIL ${msg}`);
  }
}

const browser = await chromium.launch({ headless: true });
const spots = ['photo', 'description', 'classification', 'duration', 'severity', 'chevron'];

for (const width of [375, 430]) {
  for (const spot of spots) {
    const page = await browser.newPage({ viewport: { width, height: 2600 }, deviceScaleFactor: 2 });
    await page.goto(url);
    await page.waitForSelector('text=Sol ön kapı');
    const card = page.locator('[role="button"]', { hasText: 'Sol ön kapı' }).last();
    const photo = card.locator('[data-testid="issue-card-photo"]');
    // react-native-web draws <Image> as a div with a background-image.
    await photo.first().waitFor({ timeout: 10_000 });
    const loaded = await page
      .waitForFunction(
        () => {
          const box = document.querySelector('[data-testid="issue-card-photo"]');
          return [...box.querySelectorAll('div')].some((d) => d.style.backgroundImage.includes('data:'));
        },
        null,
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (spot === 'photo') check(loaded, `mobile ${width}px: card photo image rendered`);
    if (spot === 'photo' && width === 375) {
      await card.screenshot({ path: path.join(out, 'mobile-375-card.png') });
    }
    const target = {
      photo: () => photo,
      description: () => card.getByText('Sol ön kapı menteşesinde boşluk'),
      classification: () => card.getByText('Ön kapı · Boşluk'),
      duration: () => card.getByText(/^\d+g \d+s$/),
      severity: () => card.locator('[role="img"][aria-label="Kritik"]'),
      chevron: () => card.locator('svg').last(),
    }[spot]();
    await target.first().click();
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => ({
      nav: window.__nav,
      modals: document.querySelectorAll('[aria-modal="true"], [role="dialog"]').length,
    }));
    const last = result.nav[result.nav.length - 1];
    check(
      result.nav.length === 1 && last.name === 'IssueDetail' && last.params?.id === 101,
      `mobile ${width}px: press ${spot} → IssueDetail #101 (${JSON.stringify(result.nav)})`,
    );
    check(result.modals === 0, `mobile ${width}px: press ${spot} opens no fullscreen modal`);
    await page.close();
  }
}

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('verify-mobile-card-press: all checks passed');
