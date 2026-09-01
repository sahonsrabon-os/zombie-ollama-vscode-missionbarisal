# Browser Testing with Playwright

## How to Test Mission Barisal Like a Real User

This document explains how to test the chat system using Playwright
so you can verify it works like a real user would experience it.

---

## Why Playwright?

- Tests run in a real browser (Chromium, Firefox, WebKit)
- You can click, type, scroll — just like a human
- Takes screenshots for visual verification
- Runs headlessly in CI/CD pipelines
- No need to install anything in your project folder

---

## Setup

### 1. Install Playwright Globally

```bash
npm install -g playwright
npx playwright install chromium
```

### 2. Create Test File

Create `test-chat.js` in your project:

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Your test code here

  await browser.close();
})();
```

### 3. Run Test

```bash
node test-chat.js
```

---

## Test Scenarios

### Test 1: Basic Chat Flow

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Go to your chat app
  await page.goto('http://localhost:8080');

  // Wait for page to load
  await page.waitForSelector('#user-input');

  // Type a message
  await page.fill('#user-input', 'Hello, who are you?');

  // Click send button
  await page.click('#send-btn');

  // Wait for response
  await page.waitForSelector('.assistant', { timeout: 30000 });

  // Get the response text
  const response = await page.textContent('.assistant');
  console.log('Agent response:', response);

  // Take a screenshot
  await page.screenshot({ path: 'test-results/chat-basic.png' });

  await browser.close();
  console.log('Test 1 passed!');
})();
```

### Test 2: Multi-Turn Conversation

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080');
  await page.waitForSelector('#user-input');

  // Turn 1
  await page.fill('#user-input', 'What is Node.js?');
  await page.click('#send-btn');
  await page.waitForSelector('.assistant', { timeout: 30000 });
  console.log('Turn 1 complete');

  // Turn 2
  await page.fill('#user-input', 'How does the event loop work?');
  await page.click('#send-btn');
  await page.waitForSelector('.assistant:nth-of-type(2)', { timeout: 30000 });
  console.log('Turn 2 complete');

  // Turn 3
  await page.fill('#user-input', 'Show me an example');
  await page.click('#send-btn');
  await page.waitForSelector('.assistant:nth-of-type(3)', { timeout: 30000 });
  console.log('Turn 3 complete');

  // Take screenshot of full conversation
  await page.screenshot({ path: 'test-results/chat-multi-turn.png', fullPage: true });

  await browser.close();
  console.log('Test 2 passed!');
})();
```

### Test 3: Bengali Text Support

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080');
  await page.waitForSelector('#user-input');

  // Type in Bengali
  await page.fill('#user-input', 'বাংলায় বলো: মিশন বরিশাল কি?');
  await page.click('#send-btn');

  // Wait for Bengali response
  await page.waitForSelector('.assistant', { timeout: 30000 });

  const response = await page.textContent('.assistant');

  // Verify Bengali characters are preserved
  const hasBengali = /[\u0980-\u09FF]/.test(response);
  console.log('Bengali text preserved:', hasBengali);
  console.log('Response:', response.substring(0, 200));

  await page.screenshot({ path: 'test-results/chat-bengali.png' });

  await browser.close();
  console.log('Test 3 passed!');
})();
```

### Test 4: Streaming Response

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080');
  await page.waitForSelector('#user-input');

  // Enable streaming in your app first, then test
  await page.fill('#user-input', 'Tell me a story');
  await page.click('#send-btn');

  // Watch for content appearing progressively
  let previousLength = 0;
  let stableCount = 0;

  while (stableCount < 3) {
    await page.waitForTimeout(1000);
    const currentLength = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.assistant');
      return msgs[msgs.length - 1]?.textContent?.length || 0;
    });

    if (currentLength === previousLength && currentLength > 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    previousLength = currentLength;
    console.log(`Response length: ${currentLength} chars`);
  }

  await page.screenshot({ path: 'test-results/chat-streaming.png' });

  await browser.close();
  console.log('Test 4 passed!');
})();
```

### Test 5: Error Handling

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:8080');
  await page.waitForSelector('#user-input');

  // Send empty message
  await page.fill('#user-input', '');
  await page.click('#send-btn');

  // Should not crash
  await page.waitForTimeout(2000);

  // Send very long message
  const longMessage = 'A'.repeat(10000);
  await page.fill('#user-input', longMessage);
  await page.click('#send-btn');

  // Should handle gracefully
  await page.waitForTimeout(5000);

  await page.screenshot({ path: 'test-results/chat-errors.png' });

  await browser.close();
  console.log('Test 5 passed!');
})();
```

---

## Visual Testing Checklist

Before releasing, manually verify these in the browser:

### Layout
- [ ] Chat messages display correctly
- [ ] User messages align right (blue)
- [ ] Agent messages align left (white)
- [ ] Typing indicator shows while waiting
- [ ] Scroll works when messages overflow

### Text
- [ ] Bengali text renders correctly
- [ ] English text renders correctly
- [ ] Code blocks have syntax highlighting
- [ ] Links are clickable
- [ ] Emojis display properly

### Interaction
- [ ] Enter key sends message
- [ ] Send button works
- [ ] Can scroll through history
- [ ] Copy button works on code blocks
- [ ] Thinking process is collapsible

### Responsive
- [ ] Works on mobile screen sizes
- [ ] Works on tablet screen sizes
- [ ] Works on desktop screen sizes

---

## Screenshot Comparison

### Before and After

Take screenshots of:
1. Empty chat state
2. After first message
3. After multi-turn conversation
4. With code blocks
5. With Bengali text
6. On mobile view

Compare with expected screenshots to catch visual regressions.

---

## Automated CI/CD

### GitHub Actions Example

```yaml
name: Browser Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Playwright
        run: |
          npm install -g playwright
          npx playwright install chromium

      - name: Start Server
        run: |
          cd /home/sahon/Desktop/api
          PORT=5000 node hamba.js &
          sleep 5

      - name: Run Tests
        run: node test-chat.js

      - name: Upload Screenshots
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-screenshots
          path: test-results/
```

---

## Summary

1. Install Playwright globally (not in project)
2. Create test files with real browser interactions
3. Test Bengali text, streaming, multi-turn, errors
4. Take screenshots for visual verification
5. Run in CI/CD for automated testing

No project dependencies needed. Just Playwright and a running server.
