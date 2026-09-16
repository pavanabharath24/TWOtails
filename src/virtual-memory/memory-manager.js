/**
 * TWOtails Virtual Memory Manager
 * Creates and manages isolated testing sandboxes
 */

const { chromium } = require('playwright');

class VirtualMemory {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.maxSize = options.maxSize || 100;
    this.browser = null;
    this.contexts = new Map();
    this.snapshots = new Map();
  }

  async createSandbox(id) {
    if (this.contexts.size >= this.maxSize) {
      throw new Error('Virtual memory limit reached');
    }

    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }

    const context = await this.browser.newContext();
    const page = await context.newPage();

    this.contexts.set(id, {
      context,
      page,
      created: Date.now(),
      status: 'active'
    });

    return { id, status: 'created' };
  }

  async loadContent(sandboxId, html) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await sandbox.page.setContent(html, { waitUntil: 'networkidle' });

    return { status: 'loaded' };
  }

  async loadFile(sandboxId, filePath) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await sandbox.page.goto(`file://${filePath}`, { waitUntil: 'networkidle' });

    return { status: 'loaded' };
  }

  async clickElement(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await sandbox.page.click(selector, { timeout: this.timeout });
      return { status: 'clicked', selector };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async fillForm(sandboxId, selector, value) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await sandbox.page.fill(selector, value, { timeout: this.timeout });
      return { status: 'filled', selector, value };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async submitForm(sandboxId, selector) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await sandbox.page.click(selector || 'button[type="submit"]', { timeout: this.timeout });
      return { status: 'submitted' };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async navigate(sandboxId, url) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      await sandbox.page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });
      return { status: 'navigated', url };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async evaluate(sandboxId, script) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    try {
      const result = await sandbox.page.evaluate(script);
      return { status: 'executed', result };
    } catch (error) {
      return { status: 'failed', error: error.message };
    }
  }

  async takeSnapshot(sandboxId) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    const html = await sandbox.page.content();
    const snapshot = {
      id: `${sandboxId}_${Date.now()}`,
      html,
      timestamp: Date.now()
    };

    this.snapshots.set(snapshot.id, snapshot);

    return snapshot;
  }

  async restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const sandboxId = snapshotId.split('_')[0];
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    await sandbox.page.setContent(snapshot.html, { waitUntil: 'networkidle' });

    return { status: 'restored' };
  }

  async destroySandbox(id) {
    const sandbox = this.contexts.get(id);
    if (sandbox) {
      await sandbox.context.close();
      this.contexts.delete(id);
    }

    // Clean up related snapshots
    for (const [snapshotId] of this.snapshots) {
      if (snapshotId.startsWith(id)) {
        this.snapshots.delete(snapshotId);
      }
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

  getStatus() {
    return {
      browser: this.browser ? 'running' : 'not_started',
      sandboxes: this.contexts.size,
      snapshots: this.snapshots.size,
      maxSize: this.maxSize
    };
  }
}

class MemoryManager {
  constructor() {
    this.virtualMemory = new VirtualMemory();
    this.testResults = new Map();
  }

  async runTests(directory, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const { glob } = require('glob');

    const results = [];

    // Find test files
    const testFiles = await glob('**/*.{test,spec}.{js,jsx,ts,tsx}', {
      cwd: directory,
      absolute: true
    });

    for (const testFile of testFiles) {
      const result = await this.runTestFile(testFile, options);
      results.push(result);
    }

    return results;
  }

  async runTestFile(testFile, options = {}) {
    const sandboxId = `test_${Date.now()}`;

    try {
      // Create sandbox
      await this.virtualMemory.createSandbox(sandboxId);

      // Load test file
      const result = await this.virtualMemory.loadFile(sandboxId, testFile);

      // Run test assertions
      const testResult = await this.executeTest(sandboxId, testFile);

      // Cleanup
      await this.virtualMemory.destroySandbox(sandboxId);

      return {
        file: testFile,
        status: testResult.passed ? 'PASSED' : 'FAILED',
        details: testResult
      };
    } catch (error) {
      await this.virtualMemory.destroySandbox(sandboxId);
      return {
        file: testFile,
        status: 'ERROR',
        error: error.message
      };
    }
  }

  async executeTest(sandboxId, testFile) {
    const sandbox = this.virtualMemory.contexts.get(sandboxId);
    if (!sandbox) {
      return { passed: false, error: 'Sandbox not found' };
    }

    try {
      // Execute test script
      const result = await sandbox.page.evaluate(() => {
        // Look for test functions
        const testFunctions = Object.keys(window).filter(k => k.startsWith('test'));

        if (testFunctions.length === 0) {
          return { passed: false, error: 'No test functions found' };
        }

        const results = [];
        for (const fn of testFunctions) {
          try {
            const result = window[fn]();
            results.push({ name: fn, passed: result !== false });
          } catch (e) {
            results.push({ name: fn, passed: false, error: e.message });
          }
        }

        return {
          passed: results.every(r => r.passed),
          tests: results
        };
      });

      return result;
    } catch (error) {
      return { passed: false, error: error.message };
    }
  }

  async cleanup() {
    await this.virtualMemory.destroyAll();
    this.testResults.clear();
  }

  getStatus() {
    return {
      virtualMemory: this.virtualMemory.getStatus(),
      testResults: this.testResults.size
    };
  }
}

async function testVirtualMemory(directory, options = {}) {
  const manager = new MemoryManager();

  try {
    const results = await manager.runTests(directory, options);

    // Format results as table
    return results.map(r => ({
      file: require('path').relative(directory, r.file),
      status: r.status,
      details: r.error || (r.details?.tests?.length ? `${r.details.tests.length} tests` : '—')
    }));
  } finally {
    await manager.cleanup();
  }
}

module.exports = { VirtualMemory, MemoryManager, testVirtualMemory };
