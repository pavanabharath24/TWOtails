/**
 * TWOtails Virtual Memory - Core Browser Management
 * Creates isolated browser sandboxes to test UI elements
 * Every click, form submit, navigation, API call verified
 */

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  // Playwright not installed
}

class VirtualMemory {
  constructor(options = {}) {
    this.timeout = options.timeout || 15000;
    this.maxSize = options.maxSize || 10;
    this.browser = null;
    this.contexts = new Map();
  }

  async init() {
    if (!chromium) {
      throw new Error('Playwright not installed. Run: npm install playwright && npx playwright install chromium');
    }
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this;
  }

  async createSandbox(id) {
    if (!this.browser) await this.init();
    if (this.contexts.size >= this.maxSize) {
      throw new Error(`Virtual memory limit reached (max ${this.maxSize} sandboxes)`);
    }

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    const sandbox = {
      id,
      context,
      page,
      created: Date.now(),
      status: 'active',
      errors: [],
      consoleLogs: [],
      apiCalls: [],
      navigations: []
    };

    // Capture console output
    page.on('console', msg => {
      sandbox.consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now()
      });
      if (msg.type() === 'error') {
        sandbox.errors.push({
          type: 'console_error',
          message: msg.text(),
          timestamp: Date.now()
        });
      }
    });

    // Capture page errors (uncaught exceptions)
    page.on('pageerror', error => {
      sandbox.errors.push({
        type: 'page_error',
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });
    });

    // Capture API calls
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('/graphql') || url.includes('jsonplaceholder')) {
        sandbox.apiCalls.push({
          url,
          method: request.method(),
          headers: request.headers(),
          postData: request.postData(),
          timestamp: Date.now()
        });
      }
    });

    page.on('response', response => {
      const call = sandbox.apiCalls.find(c => c.url === response.url() && !c.status);
      if (call) {
        call.status = response.status();
        call.statusText = response.statusText();
        call.headers = response.headers();
      }
    });

    // Track navigations
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) {
        sandbox.navigations.push({
          url: frame.url(),
          timestamp: Date.now()
        });
      }
    });

    this.contexts.set(id, sandbox);
    return { id, status: 'created' };
  }

  getSandbox(id) {
    const sandbox = this.contexts.get(id);
    if (!sandbox) throw new Error(`Sandbox "${id}" not found`);
    return sandbox;
  }

  // ─── Page Loading ──────────────────────────────────────────────
  async loadHTML(sandboxId, html) {
    const sandbox = this.getSandbox(sandboxId);
    const prevErrorCount = sandbox.errors.length;

    await sandbox.page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Wait a bit for any async errors
    await sandbox.page.waitForTimeout(500);

    const newErrors = sandbox.errors.slice(prevErrorCount);
    return {
      status: 'loaded',
      errors: newErrors,
      hasErrors: newErrors.length > 0
    };
  }

  async loadFile(sandboxId, filePath) {
    const sandbox = this.getSandbox(sandboxId);
    const prevErrorCount = sandbox.errors.length;

    await sandbox.page.goto(`file://${filePath}`, { waitUntil: 'domcontentloaded' });
    await sandbox.page.waitForTimeout(500);

    const newErrors = sandbox.errors.slice(prevErrorCount);
    return {
      status: 'loaded',
      errors: newErrors,
      hasErrors: newErrors.length > 0
    };
  }

  async loadURL(sandboxId, url) {
    const sandbox = this.getSandbox(sandboxId);
    const prevErrorCount = sandbox.errors.length;

    await sandbox.page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    await sandbox.page.waitForTimeout(500);

    const newErrors = sandbox.errors.slice(prevErrorCount);
    return {
      status: 'loaded',
      url: sandbox.page.url(),
      errors: newErrors,
      hasErrors: newErrors.length > 0
    };
  }

  // ─── Interaction Methods ──────────────────────────────────────
  async click(sandboxId, selector, options = {}) {
    const sandbox = this.getSandbox(sandboxId);
    const prevErrorCount = sandbox.errors.length;

    try {
      await sandbox.page.click(selector, { timeout: this.timeout, ...options });
      await sandbox.page.waitForTimeout(200);

      const newErrors = sandbox.errors.slice(prevErrorCount);
      return {
        status: 'clicked',
        selector,
        errors: newErrors,
        hasErrors: newErrors.length > 0
      };
    } catch (error) {
      return {
        status: 'failed',
        selector,
        error: error.message
      };
    }
  }

  async fill(sandboxId, selector, value, options = {}) {
    const sandbox = this.getSandbox(sandboxId);

    try {
      await sandbox.page.fill(selector, value, { timeout: this.timeout, ...options });
      return { status: 'filled', selector, value };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async type(sandboxId, selector, text, options = {}) {
    const sandbox = this.getSandbox(sandboxId);

    try {
      await sandbox.page.type(selector, text, { timeout: this.timeout, ...options });
      return { status: 'typed', selector, text };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async select(sandboxId, selector, value) {
    const sandbox = this.getSandbox(sandboxId);

    try {
      await sandbox.page.selectOption(selector, value, { timeout: this.timeout });
      return { status: 'selected', selector, value };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async check(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);

    try {
      await sandbox.page.check(selector, { timeout: this.timeout });
      return { status: 'checked', selector };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async submit(sandboxId, selector = 'form') {
    const sandbox = this.getSandbox(sandboxId);
    const prevErrorCount = sandbox.errors.length;

    try {
      // Try to find submit button inside form
      const submitBtn = await sandbox.page.$(`${selector} button[type="submit"], ${selector} input[type="submit"]`);
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await sandbox.page.click(selector, { timeout: this.timeout });
      }
      await sandbox.page.waitForTimeout(300);

      const newErrors = sandbox.errors.slice(prevErrorCount);
      return {
        status: 'submitted',
        selector,
        errors: newErrors,
        hasErrors: newErrors.length > 0
      };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  // ─── Assertion Methods ─────────────────────────────────────────
  async getElementCount(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const count = await sandbox.page.locator(selector).count();
      return { status: 'counted', selector, count };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async isVisible(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const visible = await sandbox.page.locator(selector).isVisible();
      return { status: 'checked', selector, visible };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async isHidden(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const hidden = await sandbox.page.locator(selector).isHidden();
      return { status: 'checked', selector, hidden };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async getText(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const text = await sandbox.page.locator(selector).textContent();
      return { status: 'got', selector, text: text?.trim() || '' };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async getInnerHtml(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const html = await sandbox.page.locator(selector).innerHTML();
      return { status: 'got', selector, html };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async getValue(sandboxId, selector) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const value = await sandbox.page.inputValue(selector);
      return { status: 'got', selector, value };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async getAttribute(sandboxId, selector, attribute) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const value = await sandbox.page.getAttribute(selector, attribute);
      return { status: 'got', selector, attribute, value };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async getCSSProperty(sandboxId, selector, property) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const value = await sandbox.page.locator(selector).evaluate(
        (el, prop) => getComputedStyle(el).getPropertyValue(prop),
        property
      );
      return { status: 'got', selector, property, value };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  // ─── Navigation Methods ────────────────────────────────────────
  async waitForNavigation(sandboxId, options = {}) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      await sandbox.page.waitForNavigation({ timeout: this.timeout, ...options });
      return { status: 'navigated', url: sandbox.page.url() };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async waitForURL(sandboxId, urlPattern, options = {}) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      await sandbox.page.waitForURL(urlPattern, { timeout: this.timeout, ...options });
      return { status: 'navigated', url: sandbox.page.url() };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async waitForSelector(sandboxId, selector, options = {}) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      await sandbox.page.waitForSelector(selector, { timeout: this.timeout, ...options });
      return { status: 'found', selector };
    } catch (error) {
      return { status: 'failed', selector, error: error.message };
    }
  }

  async waitForTimeout(sandboxId, ms) {
    const sandbox = this.getSandbox(sandboxId);
    await sandbox.page.waitForTimeout(ms);
    return { status: 'waited', ms };
  }

  // ─── Evaluation Methods ────────────────────────────────────────
  async evaluate(sandboxId, script, ...args) {
    const sandbox = this.getSandbox(sandboxId);
    try {
      const result = await sandbox.page.evaluate(script, ...args);
      return { status: 'executed', result };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async interceptRequests(sandboxId, urlPattern, handler) {
    const sandbox = this.getSandbox(sandboxId);
    await sandbox.page.route(urlPattern, handler);
    return { status: 'intercepting', urlPattern };
  }

  async mockAPI(sandboxId, urlPattern, response) {
    const sandbox = this.getSandbox(sandboxId);
    await sandbox.page.route(urlPattern, route => {
      route.fulfill({
        status: response.status || 200,
        contentType: response.contentType || 'application/json',
        body: JSON.stringify(response.body || {})
      });
    });
    return { status: 'mocked', urlPattern };
  }

  // ─── Error/Log Accessors ──────────────────────────────────────
  getErrors(sandboxId) {
    return this.getSandbox(sandboxId).errors;
  }

  getConsoleLogs(sandboxId) {
    return this.getSandbox(sandboxId).consoleLogs;
  }

  getAPICalls(sandboxId) {
    return this.getSandbox(sandboxId).apiCalls;
  }

  getNavigations(sandboxId) {
    return this.getSandbox(sandboxId).navigations;
  }

  // ─── Screenshot ────────────────────────────────────────────────
  async screenshot(sandboxId, options = {}) {
    const sandbox = this.getSandbox(sandboxId);
    const buffer = await sandbox.page.screenshot({
      fullPage: options.fullPage || false,
      path: options.path
    });
    return { status: 'screenshot', buffer, path: options.path };
  }

  // ─── Cleanup ───────────────────────────────────────────────────
  async destroySandbox(id) {
    const sandbox = this.contexts.get(id);
    if (sandbox) {
      await sandbox.context.close().catch(() => {});
      this.contexts.delete(id);
    }
    return { status: 'destroyed', id };
  }

  async destroyAll() {
    const count = this.contexts.size;
    for (const [id] of this.contexts) {
      await this.destroySandbox(id);
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    return { status: 'all_destroyed', count };
  }

  get activeSandboxCount() {
    return this.contexts.size;
  }
}

module.exports = { VirtualMemory };
