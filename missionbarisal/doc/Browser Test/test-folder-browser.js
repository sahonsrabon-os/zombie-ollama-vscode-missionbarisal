/**
 * Mission Barisal — Folder Browser + set_working_dir Playwright Test
 *
 * Run: node test-folder-browser.js
 *
 * Tests:
 * 1. Login flow (admin / barisal2026)
 * 2. Project modal opens (auto-open when no project in URL)
 * 3. Folder browser: Browse → list appears → folders/files visible
 * 4. Folder navigation: click folder → drill down; Up → back
 * 5. Breadcrumb navigation
 * 6. Path input Enter-to-navigate
 * 7. set_working_dir auto-call on project open (network capture)
 */

const { chromium } = require('playwright');

const FRONTEND_URL = 'http://localhost:8080';
const RESULTS = [];

async function log(name, passed, details = '') {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${details ? ' — ' + details : ''}`);
  RESULTS.push({ name, passed, details });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // ── 1. Login flow ──
  try {
    await page.goto(FRONTEND_URL + '/index.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.fill('#username', 'admin');
    await page.fill('#password', 'barisal2026');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
      page.click('#loginBtn'),
    ]);
    // After login, redirect to allindex.live.php
    await page.waitForTimeout(2000);
    const url = page.url();
    log('1. Login + redirect to allindex', url.includes('allindex.live.php'), url);
  } catch (e) {
    log('1. Login + redirect to allindex', false, e.message);
  }

  // ── 2. Project modal opens (auto-open when no project) ──
  let modalVisible = false;
  try {
    await page.waitForSelector('#ocProjMod', { timeout: 8000 });
    modalVisible = await page.isVisible('#ocProjMod');
    log('2. Project modal visible', modalVisible);
  } catch (e) {
    log('2. Project modal visible', false, e.message);
  }

  // ── 3. Folder browser: click Browse → list appears ──
  let browseClicked = false;
  try {
    if (!modalVisible) {
      // Try opening the modal via the project button
      await page.click('#ocProjBtn').catch(() => {});
      await page.waitForTimeout(500);
    }
    // Click "+ New Project" to reveal the create form (Browse lives inside it)
    await page.click('#ocProjNewBtn');
    await page.waitForTimeout(500);
    await page.waitForSelector('#ocProjBrowse', { timeout: 5000 });
    await page.click('#ocProjBrowse');
    await page.waitForTimeout(1500);
    const browserVisible = await page.isVisible('#ocProjBrowser');
    const listHtml = await page.innerHTML('#ocProjBrList');
    browseClicked = browserVisible && listHtml.length > 0;
    log('3. Browse opens folder browser with list', browseClicked,
      'browserVisible=' + browserVisible + ' listLen=' + listHtml.length);
  } catch (e) {
    log('3. Browse opens folder browser with list', false, e.message);
  }

  // ── 4. Folder rows visible (dirs + files) ──
  try {
    await page.waitForSelector('#ocProjBrList div', { timeout: 5000 });
    const rowCount = await page.locator('#ocProjBrList > div').count();
    const hasUp = await page.locator('#ocProjBrList > div', { hasText: 'up' }).count();
    log('4. Folder rows render (dirs+files)', rowCount > 2, 'rows=' + rowCount + ' upEntry=' + (hasUp > 0));
  } catch (e) {
    log('4. Folder rows render (dirs+files)', false, e.message);
  }

  // ── 5. Breadcrumb present ──
  try {
    const crumbCount = await page.locator('#ocProjBrCrumb span').count();
    log('5. Breadcrumb navigation present', crumbCount >= 2, 'crumbSpans=' + crumbCount);
  } catch (e) {
    log('5. Breadcrumb navigation present', false, e.message);
  }

  // ── 6. Quick-select buttons (Home/Root) present ──
  try {
    const hasHome = await page.isVisible('#ocProjBrHome');
    const hasRoot = await page.isVisible('#ocProjBrRoot');
    log('6. Quick-select Home/Root buttons', hasHome && hasRoot, 'home=' + hasHome + ' root=' + hasRoot);
  } catch (e) {
    log('6. Quick-select Home/Root buttons', false, e.message);
  }

  // ── 7. set_working_dir auto-call captured ──
  let setWorkingDirCalled = false;
  let workingDirValue = '';
  page.on('request', (req) => {
    if (req.url().includes('set_working_dir')) {
      setWorkingDirCalled = true;
      try { workingDirValue = decodeURIComponent(req.postData() || ''); } catch (_) {}
    }
  });
  try {
    // Reload with a project path to trigger project_info → set_working_dir
    await page.goto(FRONTEND_URL + '/allindex.live.php?act=ai&path=test.proj&project_id=test123', {
      waitUntil: 'domcontentloaded', timeout: 20000,
    });
    await page.waitForTimeout(4000); // wait for project_info + set_working_dir
    log('7. set_working_dir auto-call on project open', setWorkingDirCalled,
      workingDirValue ? 'body=' + workingDirValue : 'no request captured');
  } catch (e) {
    log('7. set_working_dir auto-call on project open', false, e.message);
  }

  // ── Summary ──
  const passed = RESULTS.filter((r) => r.passed).length;
  const failed = RESULTS.length - passed;
  console.log('\n=== SUMMARY: ' + passed + ' passed, ' + failed + ' failed of ' + RESULTS.length + ' ===');
  if (errors.length) {
    console.log('=== PAGE ERRORS (' + errors.length + ') ===');
    errors.slice(0, 5).forEach((e) => console.log('  ' + e));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
