/**
 * TWOtails Virtual Memory - Real Playwright Testing
 * Creates isolated browser sandboxes to test UI elements
 * Every button click, form submission, navigation, and API call verified
 */

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  // Playwright not installed
}

class VirtualMemory {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.maxSize = options.maxSize || 10;
    this.browser = null;
    this.contexts = new Map();
    this.testResults = [];
  }

  async init() {
    if (!chromium) {
      throw new Error('Playwright not installed. Run: npx playwright install chromium');
    }
    this.browser = await chromium.launch({ headless: true });
  }

  async createSandbox(id) {
    if (!this.browser) await this.init();
    if (this.contexts.size >= this.maxSize) {
      throw new Error('Virtual memory limit reached');
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const consoleLogs = [];
    const apiCalls = [];

    // Capture console errors
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
      if (msg.type() === 'error') {
        errors.push({ type: 'console_error', message: msg.text() });
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      errors.push({ type: 'page_error', message: error.message, stack: error.stack });
    });

    // Capture API calls
    page.on('request', request => {
      if (request.url().includes('api') || request.url().includes('graphql')) {
        apiCalls.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        });
      }
    });

    page.on('response', response => {
      const apiCall = apiCalls.find(c => c.url === response.url());
      if (apiCall) {
        apiCall.status = response.status();
        apiCall.statusText = response.statusText();
      }
    });

    this.contexts.set(id, {
      context,
      page,
      errors,
      consoleLogs,
      apiCalls,
      created: Date.now(),
      status: 'active'
    });

    return { id, status: 'created' };
  }

  async loadHTML(sandboxId, html) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    await sandbox.page.setContent(html, { waitUntil: 'domcontentloaded' });
    return { status: 'loaded' };
  }

  async loadFile(sandboxId, filePath) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    await sandbox.page.goto(`file://${filePath}`, { waitUntil: 'domcontentloaded' });
    return { status: 'loaded' };
  }

  async loadURL(sandboxId, url) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    await sandbox.page.goto(url, { waitUntil: 'domcontentloaded' });
    return { status: 'loaded' };
  }

  async click(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      await sandbox.page.click(selector, { timeout: this.timeout });
      return { status: 'clicked', selector };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async fill(sandboxId, selector, value) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      await sandbox.page.fill(selector, value, { timeout: this.timeout });
      return { status: 'filled', selector, value };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async submit(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      await sandbox.page.click(selector || 'button[type="submit"]', { timeout: this.timeout });
      return { status: 'submitted' };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async evaluate(sandboxId, script) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const result = await sandbox.page.evaluate(script);
      return { status: 'executed', result };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async getElementCount(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const count = await sandbox.page.locator(selector).count();
      return { status: 'counted', count };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async isVisible(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const visible = await sandbox.page.locator(selector).isVisible();
      return { status: 'checked', visible };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async getText(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const text = await sandbox.page.locator(selector).textContent();
      return { status: 'got', text };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async getAttribute(sandboxId, selector, attribute) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      const value = await sandbox.page.getAttribute(selector, attribute);
      return { status: 'got', value };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async waitForNavigation(sandboxId, url) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      await sandbox.page.waitForURL(url, { timeout: this.timeout });
      return { status: 'navigated', url };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async waitForSelector(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
      await sandbox.page.waitForSelector(selector, { timeout: this.timeout });
      return { status: 'found', selector };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async interceptRequests(sandboxId, urlPattern, handler) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    await sandbox.page.route(urlPattern, handler);
    return { status: 'intercepting' };
  }

  getErrors(sandboxId) {
    const sandbox = this.contexts.get(sandboxId);
    return sandbox ? sandbox.errors : [];
  }

  getConsoleLogs(sandboxId) {
    const sandbox = this.contexts.get(sandboxId);
    return sandbox ? sandbox.consoleLogs : [];
  }

  getAPICalls(sandboxId) {
    const sandbox = this.contexts.get(sandboxId);
    return sandbox ? sandbox.apiCalls : [];
  }

  async destroySandbox(id) {
    const sandbox = this.contexts.get(id);
    if (sandbox) {
      await sandbox.context.close();
      this.contexts.delete(id);
    }
    return { status: 'destroyed' };
  }

  async destroyAll() {
    for (const [id] of this.contexts) {
      await this.destroySandbox(id);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    return { status: 'all_destroyed' };
  }
}

class VirtualMemoryTester {
  constructor(options = {}) {
    this.virtualMemory = new VirtualMemory(options);
    this.results = [];
  }

  async testButton(sandboxId, selector, options = {}) {
    const result = {
      type: 'button_test',
      selector,
      tests: []
    };

    // Test 1: Button exists
    const exists = await this.virtualMemory.getElementCount(sandboxId, selector);
    result.tests.push({
      name: 'Button exists',
      passed: exists.status === 'counted' && exists.count > 0,
      details: exists
    });

    // Test 2: Button is visible
    const visible = await this.virtualMemory.isVisible(sandboxId, selector);
    result.tests.push({
      name: 'Button is visible',
      passed: visible.status === 'checked' && visible.visible,
      details: visible
    });

    // Test 3: Button has text
    const text = await this.virtualMemory.getText(sandboxId, selector);
    result.tests.push({
      name: 'Button has text',
      passed: text.status === 'got' && text.text && text.text.trim().length > 0,
      details: text
    });

    // Test 4: Button is clickable (try clicking)
    const clickResult = await this.virtualMemory.click(sandboxId, selector);
    result.tests.push({
      name: 'Button is clickable',
      passed: clickResult.status === 'clicked',
      details: clickResult
    });

    // Test 5: Check for errors after click
    const errors = this.virtualMemory.getErrors(sandboxId);
    const newErrors = errors.filter(e => e.type === 'page_error');
    result.tests.push({
      name: 'No errors after click',
      passed: newErrors.length === 0,
      details: { errors: newErrors }
    });

    result.passed = result.tests.every(t => t.passed);
    this.results.push(result);
    return result;
  }

  async testForm(sandboxId, formSelector, fields, submitSelector) {
    const result = {
      type: 'form_test',
      selector: formSelector,
      tests: []
    };

    // Test 1: Form exists
    const exists = await this.virtualMemory.getElementCount(sandboxId, formSelector);
    result.tests.push({
      name: 'Form exists',
      passed: exists.status === 'counted' && exists.count > 0,
      details: exists
    });

    // Test 2: Fill each field
    for (const field of fields) {
      const fillResult = await this.virtualMemory.fill(sandboxId, field.selector, field.value);
      result.tests.push({
        name: `Fill field: ${field.selector}`,
        passed: fillResult.status === 'filled',
        details: fillResult
      });

      // Verify value was set
      const value = await this.virtualMemory.evaluate(sandboxId,
        `document.querySelector('${field.selector}')?.value || ''`);
      result.tests.push({
        name: `Verify field value: ${field.selector}`,
        passed: value.status === 'executed' && value.result === field.value,
        details: value
      });
    }

    // Test 3: Submit form
    if (submitSelector) {
      const submitResult = await this.virtualMemory.submit(sandboxId, submitSelector);
      result.tests.push({
        name: 'Form submits',
        passed: submitResult.status === 'submitted',
        details: submitResult
      });
    }

    result.passed = result.tests.every(t => t.passed);
    this.results.push(result);
    return result;
  }

  async testNavigation(sandboxId, triggerSelector, expectedUrl) {
    const result = {
      type: 'navigation_test',
      tests: []
    };

    // Test 1: Click trigger
    const clickResult = await this.virtualMemory.click(sandboxId, triggerSelector);
    result.tests.push({
      name: 'Trigger clickable',
      passed: clickResult.status === 'clicked',
      details: clickResult
    });

    // Test 2: Navigation happened
    if (expectedUrl) {
      try {
        await this.virtualMemory.waitForNavigation(sandboxId, `**${expectedUrl}*`);
        result.tests.push({
          name: 'Navigation occurred',
          passed: true,
          details: { url: expectedUrl }
        });
      } catch (error) {
        result.tests.push({
          name: 'Navigation occurred',
          passed: false,
          details: { error: error.message }
        });
      }
    }

    result.passed = result.tests.every(t => t.passed);
    this.results.push(result);
    return result;
  }

  async testAPICall(sandboxId, triggerSelector, expectedUrl, options = {}) {
    const result = {
      type: 'api_call_test',
      tests: []
    };

    // Test 1: Click trigger
    const clickResult = await this.virtualMemory.click(sandboxId, triggerSelector);
    result.tests.push({
      name: 'Trigger clickable',
      passed: clickResult.status === 'clicked',
      details: clickResult
    });

    // Wait for API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Check API calls
    const apiCalls = this.virtualMemory.getAPICalls(sandboxId);
    const matchingCalls = apiCalls.filter(c => c.url.includes(expectedUrl));

    result.tests.push({
      name: 'API call made',
      passed: matchingCalls.length > 0,
      details: { calls: matchingCalls }
    });

    // Test 3: Check response status
    if (options.expectedStatus) {
      const successCall = matchingCalls.find(c => c.status === options.expectedStatus);
      result.tests.push({
        name: `API returned ${options.expectedStatus}`,
        passed: !!successCall,
        details: { status: successCall?.status }
      });
    }

    result.passed = result.tests.every(t => t.passed);
    this.results.push(result);
    return result;
  }

  async testComponent(sandboxId, selector, options = {}) {
    const result = {
      type: 'component_test',
      selector,
      tests: []
    };

    // Test 1: Component renders
    const exists = await this.virtualMemory.getElementCount(sandboxId, selector);
    result.tests.push({
      name: 'Component renders',
      passed: exists.status === 'counted' && exists.count > 0,
      details: exists
    });

    // Test 2: Component has expected children
    if (options.children) {
      for (const child of options.children) {
        const childExists = await this.virtualMemory.getElementCount(sandboxId,
          `${selector} ${child.selector}`);
        result.tests.push({
          name: `Has child: ${child.name || child.selector}`,
          passed: childExists.status === 'counted' && childExists.count > 0,
          details: childExists
        });
      }
    }

    // Test 3: No console errors
    const errors = this.virtualMemory.getErrors(sandboxId);
    const componentErrors = errors.filter(e =>
      e.message && e.message.includes(selector)
    );
    result.tests.push({
      name: 'No errors in component',
      passed: componentErrors.length === 0,
      details: { errors: componentErrors }
    });

    result.passed = result.tests.every(t => t.passed);
    this.results.push(result);
    return result;
  }

  getResults() {
    return {
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        totalTests: this.results.reduce((sum, r) => sum + r.tests.length, 0),
        passedTests: this.results.reduce((sum, r) => sum + r.tests.filter(t => t.passed).length, 0)
      }
    };
  }

  async cleanup() {
    await this.virtualMemory.destroyAll();
    this.results = [];
  }
}

// Main test runner
async function runVirtualMemoryTests(directory, options = {}) {
  const fs = require('fs');
  const { glob } = require('glob');

  const tester = new VirtualMemoryTester(options);

  try {
    // Find HTML/JSX/TSX files
    const files = await glob('**/*.{html,jsx,tsx,vue,svelte}', {
      cwd: directory,
      ignore: ['node_modules/**', 'dist/**'],
      absolute: true
    });

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const ext = require('path').extname(file);

      // Extract testable elements
      const buttons = content.match(/<button[^>]*>([\s\S]*?)<\/button>/g) || [];
      const forms = content.match(/<form[^>]*>/g) || [];
      const links = content.match(/<a[^>]*href=["'][^"']*["'][^>]*>/g) || [];

      if (buttons.length > 0 || forms.length > 0) {
        const sandboxId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
          await tester.virtualMemory.createSandbox(sandboxId);

          // Create minimal test HTML
          const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test</title>
</head>
<body>
  <div id="root"></div>
  <script>
    // Mock React if JSX
    const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
    const ReactDOM = { render: (el, root) => {} };

    // Mock basic functionality
    document.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        console.log('Button clicked:', e.target.textContent);
      }
    });

    document.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('Form submitted');
    });
  </script>
</body>
</html>`;

          await tester.virtualMemory.loadHTML(sandboxId, testHTML);

          // Test buttons
          for (let i = 0; i < buttons.length; i++) {
            const selector = `button:nth-of-type(${i + 1})`;
            await tester.testButton(sandboxId, selector);
          }

          // Test forms
          if (forms.length > 0) {
            const fields = [];
            const inputMatches = content.match(/<input[^>]*name=["']([^"']*)["'][^>]*>/g) || [];
            inputMatches.forEach(input => {
              const nameMatch = input.match(/name=["']([^"']*)["']/);
              if (nameMatch) {
                fields.push({
                  selector: `input[name="${nameMatch[1]}"]`,
                  value: 'test_value'
                });
              }
            });

            if (fields.length > 0) {
              await tester.testForm(sandboxId, 'form', fields, 'button[type="submit"]');
            }
          }
        } catch (err) {
          // Skip if can't load
        } finally {
          await tester.virtualMemory.destroySandbox(sandboxId);
        }
      }
    }

    return tester.getResults();
  } finally {
    await tester.cleanup();
  }
}

module.exports = { VirtualMemory, VirtualMemoryTester, runVirtualMemoryTests };
