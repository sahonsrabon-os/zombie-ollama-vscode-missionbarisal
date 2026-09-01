/**
 * Mission Barisal — Playwright Browser Tests
 * 
 * Run: npx playwright install chromium && node test-chat.js
 * 
 * Tests:
 * 1. Basic chat flow
 * 2. Multi-turn conversation
 * 3. Bengali text support
 * 4. Streaming response
 * 5. Error handling
 * 6. Agent identity verification
 */

const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:8080';
const TEST_TIMEOUT = 30000;

// Test results storage
const results = [];

async function log(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${testName}`);
  if (details) console.log(`   Details: ${details}`);
  results.push({ testName, passed, details });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// Test 1: Basic Chat Flow
// ═══════════════════════════════════════════════════════════════
async function testBasicChat(page) {
  console.log('\n--- Test 1: Basic Chat Flow ---');

  try {
    await page.goto(BASE_URL);
    await page.waitForSelector('#user-input', { timeout: 5000 });

    // Type message
    await page.fill('#user-input', 'Hello, who are you?');
    await page.click('#send-btn');

    // Wait for response
    await page.waitForSelector('.assistant', { timeout: TEST_TIMEOUT });

    const response = await page.textContent('.assistant');
    const hasContent = response && response.length > 0;
    const hasIdentity = response.includes('মনু') || response.includes('Monu') ||
                       response.includes('মিশন বরিশাল') || response.includes('Mission Barisal');

    await log('Basic Chat - Response received', hasContent, `Length: ${response?.length}`);
    await log('Basic Chat - Agent identity', hasIdentity, response?.substring(0, 100));

    // Take screenshot
    await page.screenshot({ path: 'test-results/01-basic-chat.png' });

  } catch (error) {
    await log('Basic Chat Flow', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Test 2: Multi-Turn Conversation
// ═══════════════════════════════════════════════════════════════
async function testMultiTurn(page) {
  console.log('\n--- Test 2: Multi-Turn Conversation ---');

  try {
    await page.goto(BASE_URL);
    await page.waitForSelector('#user-input', { timeout: 5000 });

    const messages = [
      'What is Node.js?',
      'How does the event loop work?',
      'Show me an example'
    ];

    for (let i = 0; i < messages.length; i++) {
      await page.fill('#user-input', messages[i]);
      await page.click('#send-btn');
      await page.waitForSelector(`.assistant:nth-of-type(${i + 1})`, { timeout: TEST_TIMEOUT });
      console.log(`   Turn ${i + 1} complete`);
    }

    const messageCount = await page.$$eval('.assistant', els => els.length);
    await log('Multi-Turn - All responses received', messageCount === 3, `Got ${messageCount} responses`);

    await page.screenshot({ path: 'test-results/02-multi-turn.png', fullPage: true });

  } catch (error) {
    await log('Multi-Turn Conversation', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Test 3: Bengali Text Support
// ═══════════════════════════════════════════════════════════════
async function testBengaliText(page) {
  console.log('\n--- Test 3: Bengali Text Support ---');

  try {
    await page.goto(BASE_URL);
    await page.waitForSelector('#user-input', { timeout: 5000 });

    // Type in Bengali
    await page.fill('#user-input', 'বাংলায় বলো: মিশন বরিশাল কি?');
    await page.click('#send-btn');

    await page.waitForSelector('.assistant', { timeout: TEST_TIMEOUT });

    const response = await page.textContent('.assistant');

    // Check Bengali characters preserved
    const hasBengali = /[\u0980-\u09FF]/.test(response);
    const hasZWNJ = response.includes('\u200C'); // Check for ZWNJ preservation

    await log('Bengali Text - Characters preserved', hasBengali, `Response: ${response?.substring(0, 100)}`);
    await log('Bengali Text - ZWNJ preserved', hasZWNJ || !hasBengali, 'ZWNJ check');

    await page.screenshot({ path: 'test-results/03-bengali-text.png' });

  } catch (error) {
    await log('Bengali Text Support', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Test 4: API Direct Test (No Browser)
// ═══════════════════════════════════════════════════════════════
async function testAPIDirect() {
  console.log('\n--- Test 4: API Direct Test ---');

  try {
    // Health check
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const health = await healthResponse.json();
    await log('API - Health check', health.healthy === true, `Agents: ${health.agents}`);

    // Chat completion
    const chatResponse = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': 'code-guru',
        'X-Device-Info': 'Playwright-Test',
        'X-Editor-Version': '1.0.0',
        'X-OS-Platform': 'linux'
      },
      body: JSON.stringify({
        model: 'mission',
        messages: [{ role: 'user', content: 'hello' }],
        stream: false
      })
    });

    const chat = await chatResponse.json();
    const hasResponse = chat.choices && chat.choices[0] && chat.choices[0].message;
    await log('API - Chat completion', hasResponse, `Session: ${chat.session_id?.substring(0, 8)}`);

    // Check session metadata
    const sessionResponse = await fetch(`${BASE_URL}/api/config`);
    const config = await sessionResponse.json();
    await log('API - Config accessible', config !== null, '');

  } catch (error) {
    await log('API Direct Test', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Test 5: Identity Verification
// ═══════════════════════════════════════════════════════════════
async function testIdentityVerification(page) {
  console.log('\n--- Test 5: Identity Verification ---');

  try {
    await page.goto(BASE_URL);
    await page.waitForSelector('#user-input', { timeout: 5000 });

    // Ask about identity
    await page.fill('#user-input', 'Are you Microsoft Copilot?');
    await page.click('#send-btn');

    await page.waitForSelector('.assistant', { timeout: TEST_TIMEOUT });

    const response = await page.textContent('.assistant');

    // Check NO identity leak
    const noMicrosoft = !response.toLowerCase().includes('microsoft copilot');
    const noGPT = !response.toLowerCase().includes('i am gpt');
    const noClaude = !response.toLowerCase().includes('i am claude');
    const hasOwnIdentity = response.includes('মিশন বরিশাল') || response.includes('Mission Barisal');

    await log('Identity - No Microsoft claim', noMicrosoft, response?.substring(0, 100));
    await log('Identity - No GPT claim', noGPT, '');
    await log('Identity - Has own identity', hasOwnIdentity, '');

    await page.screenshot({ path: 'test-results/05-identity.png' });

  } catch (error) {
    await log('Identity Verification', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Test 6: Error Handling
// ═══════════════════════════════════════════════════════════════
async function testErrorHandling(page) {
  console.log('\n--- Test 6: Error Handling ---');

  try {
    await page.goto(BASE_URL);
    await page.waitForSelector('#user-input', { timeout: 5000 });

    // Test empty message
    await page.fill('#user-input', '');
    await page.click('#send-btn');
    await sleep(1000);

    // Should not crash
    const isAlive = await page.$('#user-input') !== null;
    await log('Error - Empty message handled', isAlive, 'Page still responsive');

    // Test very long message
    const longMessage = 'A'.repeat(5000);
    await page.fill('#user-input', longMessage);
    await page.click('#send-btn');

    await sleep(3000);
    const stillAlive = await page.$('#user-input') !== null;
    await log('Error - Long message handled', stillAlive, 'Page still responsive');

    await page.screenshot({ path: 'test-results/06-error-handling.png' });

  } catch (error) {
    await log('Error Handling', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Test Runner
// ═══════════════════════════════════════════════════════════════
async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Mission Barisal — Playwright Tests      ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Create test results directory
  const fs = require('fs');
  if (!fs.existsSync('test-results')) {
    fs.mkdirSync('test-results');
  }

  // Run API tests (no browser needed)
  await testAPIDirect();

  // Run browser tests
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await testBasicChat(page);
    await testMultiTurn(page);
    await testBengaliText(page);
    await testIdentityVerification(page);
    await testErrorHandling(page);
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  TEST RESULTS SUMMARY                    ║');
  console.log('╚══════════════════════════════════════════╝');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.testName}: ${r.details}`);
    });
  }

  console.log('\nScreenshots saved in: test-results/');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(console.error);
