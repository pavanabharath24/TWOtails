/**
 * TWOtails Virtual Memory Tests
 * Tests the Playwright-based virtual memory testing system
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { VirtualMemory } = require('../src/virtual-memory/memory-manager');
const { SandboxRunner } = require('../src/virtual-memory/sandbox-runner');
const { MemoryCleanup, globalCleanup } = require('../src/virtual-memory/memory-cleanup');
const { runVirtualMemoryTests } = require('../src/virtual-memory/runner');

// ─── VirtualMemory Core Tests ───────────────────────────────────
describe('VirtualMemory', () => {
  let vm;

  before(async () => {
    vm = new VirtualMemory({ timeout: 10000 });
    await vm.init();
  });

  after(async () => {
    await vm.destroyAll();
  });

  it('should create a sandbox', async () => {
    const result = await vm.createSandbox('test1');
    assert.strictEqual(result.status, 'created');
    assert.strictEqual(result.id, 'test1');
    assert.strictEqual(vm.activeSandboxCount, 1);
  });

  it('should load HTML into sandbox', async () => {
    const html = '<html><body><h1>Hello</h1></body></html>';
    const result = await vm.loadHTML('test1', html);
    assert.strictEqual(result.status, 'loaded');
    assert.strictEqual(result.hasErrors, false);
  });

  it('should detect elements', async () => {
    const html = '<html><body><button>Click Me</button></body></html>';
    await vm.loadHTML('test1', html);

    const count = await vm.getElementCount('test1', 'button');
    assert.strictEqual(count.status, 'counted');
    assert.strictEqual(count.count, 1);
  });

  it('should check visibility', async () => {
    const html = '<html><body><div id="visible">Visible</div><div id="hidden" style="display:none">Hidden</div></body></html>';
    await vm.loadHTML('test1', html);

    const vis = await vm.isVisible('test1', '#visible');
    assert.strictEqual(vis.visible, true);

    const hid = await vm.isVisible('test1', '#hidden');
    assert.strictEqual(hid.visible, false);
  });

  it('should get text content', async () => {
    const html = '<html><body><p id="msg">Hello World</p></body></html>';
    await vm.loadHTML('test1', html);

    const text = await vm.getText('test1', '#msg');
    assert.strictEqual(text.text, 'Hello World');
  });

  it('should click buttons', async () => {
    const html = `<html><body>
      <button id="btn" data-action="alert" data-message="test">Click</button>
      <script>
        window.clicked = false;
        document.getElementById('btn').addEventListener('click', () => { window.clicked = true; });
      </script>
    </body></html>`;
    await vm.loadHTML('test1', html);

    const result = await vm.click('test1', '#btn');
    assert.strictEqual(result.status, 'clicked');

    const clicked = await vm.evaluate('test1', 'window.clicked');
    assert.strictEqual(clicked.result, true);
  });

  it('should fill form fields', async () => {
    const html = '<html><body><input type="text" id="name" name="name"></body></html>';
    await vm.loadHTML('test1', html);

    const result = await vm.fill('test1', '#name', 'John');
    assert.strictEqual(result.status, 'filled');

    const value = await vm.getValue('test1', '#name');
    assert.strictEqual(value.value, 'John');
  });

  it('should track console errors', async () => {
    const html = '<html><body><script>console.error("test error")</script></body></html>';
    await vm.loadHTML('test1', html);

    const errors = vm.getErrors('test1');
    assert.ok(errors.length > 0, 'Should have console errors');
  });

  it('should track page errors', async () => {
    const html = '<html><body><script>throw new Error("test page error")</script></body></html>';
    await vm.loadHTML('test1', html);

    const errors = vm.getErrors('test1');
    assert.ok(errors.length > 0, 'Should have page errors');
  });

  it('should destroy sandbox', async () => {
    const result = await vm.destroySandbox('test1');
    assert.strictEqual(result.status, 'destroyed');
    assert.strictEqual(vm.activeSandboxCount, 0);
  });
});

// ─── SandboxRunner Tests ────────────────────────────────────────
describe('SandboxRunner', () => {
  let runner;

  before(() => {
    runner = new SandboxRunner({ timeout: 10000 });
  });

  after(async () => {
    await runner.cleanup();
  });

  it('should run a basic test suite', async () => {
    runner.suite('Basic Test', (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, '<html><body><button id="btn">Test</button></body></html>');
      });

      s.addTest('Button exists', async (vm, id) => {
        const count = await vm.getElementCount(id, '#btn');
        return {
          name: 'Button exists',
          passed: count.count === 1
        };
      });
    });

    const results = await runner.run();
    assert.strictEqual(results.summary.totalSuites, 1);
    assert.strictEqual(results.summary.passedSuites, 1);
    assert.strictEqual(results.summary.passedTests, 1);
  });

  it('should test buttons', async () => {
    runner.suite('Button Tests', (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, '<html><body><button class="primary">Save</button><button class="danger">Delete</button></body></html>');
      });

      s.addTest('Two buttons exist', async (vm, id) => {
        const count = await vm.getElementCount(id, 'button');
        return { name: 'Two buttons exist', passed: count.count === 2 };
      });
    });

    const results = await runner.run();
    assert.ok(results.summary.totalTests > 0);
  });

  it('should test forms', async () => {
    runner.suite('Form Tests', (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, `<html><body>
          <form>
            <input type="text" name="username" value="">
            <input type="email" name="email" value="">
            <button type="submit">Submit</button>
          </form>
        </body></html>`);
      });

      s.addTest('Fill username', async (vm, id) => {
        const result = await vm.fill(id, 'input[name="username"]', 'testuser');
        return { name: 'Fill username', passed: result.status === 'filled' };
      });

      s.addTest('Verify username value', async (vm, id) => {
        const value = await vm.getValue(id, 'input[name="username"]');
        return { name: 'Verify username', passed: value.value === 'testuser' };
      });
    });

    const results = await runner.run();
    assert.ok(results.summary.passedTests >= 2);
  });

  it('should track API calls', async () => {
    runner.suite('API Tests', (s) => {
      s.before(async (vm, id) => {
        await vm.mockAPI(id, '**/api/data', { status: 200, body: { success: true } });
        await vm.loadHTML(id, `<html><body>
          <button id="fetchBtn">Fetch Data</button>
          <script>
            document.getElementById('fetchBtn').addEventListener('click', async () => {
              await fetch('/api/data');
            });
          </script>
        </body></html>`);
      });

      s.addTest('API call on click', async (vm, id) => {
        await vm.click(id, '#fetchBtn');
        await vm.waitForTimeout(id, 1000);
        const calls = vm.getAPICalls(id);
        return { name: 'API call made', passed: calls.some(c => c.url.includes('/api/data')) };
      });
    });

    const results = await runner.run();
    assert.ok(results.summary.passedTests >= 1);
  });
});

// ─── MemoryCleanup Tests ────────────────────────────────────────
describe('MemoryCleanup', () => {
  it('should track and cleanup temp files', () => {
    const cleanup = new MemoryCleanup();
    const fs = require('fs');
    const tmpFile = path.join(__dirname, '..', 'tmp-test.txt');

    fs.writeFileSync(tmpFile, 'test');
    cleanup.addTempFile(tmpFile);

    const result = cleanup.cleanupAll();
    assert.strictEqual(result.files, 1);
    assert.ok(!fs.existsSync(tmpFile));
  });
});

// ─── Full Virtual Memory Test Run ───────────────────────────────
describe('Virtual Memory Integration', () => {
  it('should run tests on broken-app', async () => {
    const results = await runVirtualMemoryTests(
      path.join(__dirname, '..', 'examples', 'broken-app'),
      { timeout: 10000 }
    );

    assert.ok(results.summary.totalSuites > 0, 'Should have test suites');
    assert.ok(results.summary.totalTests > 0, 'Should have tests');
  });

  it('should run tests on fixed-app', async () => {
    const results = await runVirtualMemoryTests(
      path.join(__dirname, '..', 'examples', 'fixed-app'),
      { timeout: 10000 }
    );

    assert.ok(results.summary.totalSuites > 0, 'Should have test suites');
  });
});
