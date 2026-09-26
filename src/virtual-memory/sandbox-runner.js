/**
 * TWOtails Sandbox Runner
 * Runs UI tests in isolated Playwright browser sandboxes
 * Tests buttons, forms, navigation, API calls, components
 */

const { VirtualMemory } = require('./memory-manager');

// ─── Test Result Builder ────────────────────────────────────────
function testResult(name, passed, details = {}) {
  return { name, passed, ...details, timestamp: Date.now() };
}

// ─── Sandbox Test Suite ─────────────────────────────────────────
class SandboxTestSuite {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.tests = [];
    this.setup = null;
    this.teardown = null;
  }

  before(fn) { this.setup = fn; return this; }
  after(fn) { this.teardown = fn; return this; }

  async run(vm, sandboxId) {
    const results = [];

    if (this.setup) {
      try {
        await this.setup(vm, sandboxId);
      } catch (err) {
        results.push(testResult('Setup', false, { error: err.message }));
        return { name: this.name, results, passed: false };
      }
    }

    for (const testFn of this.tests) {
      try {
        const result = await testFn(vm, sandboxId);
        results.push(result);
      } catch (err) {
        results.push(testResult(testFn.description || 'Unknown test', false, { error: err.message }));
      }
    }

    if (this.teardown) {
      try {
        await this.teardown(vm, sandboxId);
      } catch (err) {
        // Ignore teardown errors
      }
    }

    const passed = results.every(r => r.passed);
    return { name: this.name, results, passed };
  }

  addTest(description, fn) {
    fn.description = description;
    this.tests.push(fn);
    return this;
  }
}

// ─── Sandbox Runner ─────────────────────────────────────────────
class SandboxRunner {
  constructor(options = {}) {
    this.vm = new VirtualMemory(options);
    this.suites = [];
    this.results = [];
    this.sandboxCounter = 0;
  }

  // ─── Test Definition Methods ──────────────────────────────────
  suite(name, builder) {
    const suite = new SandboxTestSuite(name, this.options);
    builder(suite);
    this.suites.push(suite);
    return this;
  }

  // ─── Pre-built Test Suites ────────────────────────────────────

  /**
   * Create a test suite that tests buttons in a component
   */
  testButtons(componentName, html, buttonConfigs) {
    return this.suite(`${componentName} Buttons`, (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, html);
      });

      buttonConfigs.forEach(config => {
        s.addTest(`Button "${config.text || config.selector}" exists`, async (vm, id) => {
          const count = await vm.getElementCount(id, config.selector);
          return testResult(
            `Button "${config.text || config.selector}" exists`,
            count.status === 'counted' && count.count > 0,
            { details: count }
          );
        });

        s.addTest(`Button "${config.text || config.selector}" is visible`, async (vm, id) => {
          const visible = await vm.isVisible(id, config.selector);
          return testResult(
            `Button is visible`,
            visible.status === 'checked' && visible.visible,
            { details: visible }
          );
        });

        if (config.click) {
          s.addTest(`Button "${config.text || config.selector}" click works`, async (vm, id) => {
            const clickResult = await vm.click(id, config.selector);
            await vm.waitForTimeout(id, 300);

            const afterClickErrors = vm.getErrors(id);
            return testResult(
              `Button click works`,
              clickResult.status === 'clicked' && afterClickErrors.length === 0,
              { details: clickResult, errors: afterClickErrors }
            );
          });
        }

        if (config.expectText) {
          s.addTest(`Button shows "${config.expectText}"`, async (vm, id) => {
            const text = await vm.getText(id, config.selector);
            return testResult(
              `Button shows "${config.expectText}"`,
              text.status === 'got' && text.text.includes(config.expectText),
              { details: text }
            );
          });
        }
      });
    });
  }

  /**
   * Create a test suite that tests forms
   */
  testForm(componentName, html, formConfig) {
    return this.suite(`${componentName} Form`, (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, html);
      });

      // Test form exists
      s.addTest('Form element exists', async (vm, id) => {
        const count = await vm.getElementCount(id, formConfig.selector || 'form');
        return testResult(
          'Form exists',
          count.status === 'counted' && count.count > 0,
          { details: count }
        );
      });

      // Test each field
      if (formConfig.fields) {
        formConfig.fields.forEach(field => {
          s.addTest(`Fill field "${field.selector}"`, async (vm, id) => {
            const result = await vm.fill(id, field.selector, field.value);
            return testResult(
              `Fill field "${field.selector}"`,
              result.status === 'filled',
              { details: result }
            );
          });

          if (field.expectValue) {
            s.addTest(`Verify field "${field.selector}" has value`, async (vm, id) => {
              const val = await vm.getValue(id, field.selector);
              return testResult(
                `Field has correct value`,
                val.status === 'got' && val.value === field.expectValue,
                { details: val }
              );
            });
          }
        });
      }

      // Test submit
      if (formConfig.submit) {
        s.addTest('Form submits', async (vm, id) => {
          const prevErrors = vm.getErrors(id).length;
          const result = await vm.submit(id, formConfig.selector || 'form');
          await vm.waitForTimeout(id, 500);
          const newErrors = vm.getErrors(id).slice(prevErrors);

          return testResult(
            'Form submits',
            result.status === 'submitted',
            { details: result, errors: newErrors }
          );
        });
      }

      // Test validation
      if (formConfig.validation) {
        formConfig.validation.forEach(rule => {
          s.addTest(`Validation: ${rule.name}`, async (vm, id) => {
            // Submit form to trigger validation
            await vm.submit(id, formConfig.selector || 'form');
            await vm.waitForTimeout(id, 300);

            const errorVisible = await vm.isVisible(id, rule.errorSelector);
            return testResult(
              rule.name,
              errorVisible.status === 'checked' && errorVisible.visible,
              { details: errorVisible }
            );
          });
        });
      }
    });
  }

  /**
   * Create a test suite that tests navigation
   */
  testNavigation(componentName, html, navConfigs) {
    return this.suite(`${componentName} Navigation`, (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, html);
      });

      navConfigs.forEach(config => {
        s.addTest(`Navigation: ${config.name}`, async (vm, id) => {
          const clickResult = await vm.click(id, config.triggerSelector);

          if (clickResult.status !== 'clicked') {
            return testResult(config.name, false, { details: clickResult });
          }

          if (config.expectURL) {
            await vm.waitForTimeout(id, 500);
            const currentURL = vm.getNavigations(id);
            const lastNav = currentURL[currentURL.length - 1];
            return testResult(
              config.name,
              lastNav && lastNav.url.includes(config.expectURL),
              { details: { url: lastNav?.url, expected: config.expectURL } }
            );
          }

          if (config.expectSelector) {
            await vm.waitForTimeout(id, 500);
            const visible = await vm.isVisible(id, config.expectSelector);
            return testResult(
              config.name,
              visible.status === 'checked' && visible.visible,
              { details: visible }
            );
          }

          return testResult(config.name, true);
        });
      });
    });
  }

  /**
   * Create a test suite that tests API calls
   */
  testAPICalls(componentName, html, apiConfigs) {
    return this.suite(`${componentName} API`, (s) => {
      s.before(async (vm, id) => {
        // Mock API endpoints
        if (apiConfigs.mocks) {
          for (const mock of apiConfigs.mocks) {
            await vm.mockAPI(id, mock.url, mock.response);
          }
        }
        await vm.loadHTML(id, html);
      });

      apiConfigs.calls.forEach(config => {
        s.addTest(`API call: ${config.name}`, async (vm, id) => {
          const prevCalls = vm.getAPICalls(id).length;

          const clickResult = await vm.click(id, config.triggerSelector);
          await vm.waitForTimeout(id, 2000);

          const apiCalls = vm.getAPICalls(id).slice(prevCalls);
          const matchingCalls = apiCalls.filter(c => c.url.includes(config.expectURL));

          return testResult(
            config.name,
            matchingCalls.length > 0,
            { details: { calls: matchingCalls, expected: config.expectURL } }
          );
        });

        if (config.expectStatus) {
          s.addTest(`API ${config.name} returns ${config.expectStatus}`, async (vm, id) => {
            const apiCalls = vm.getAPICalls(id);
            const matchingCall = apiCalls.find(c =>
              c.url.includes(config.expectURL) && c.status === config.expectStatus
            );
            return testResult(
              `API returns ${config.expectStatus}`,
              !!matchingCall,
              { details: { status: matchingCall?.status } }
            );
          });
        }
      });
    });
  }

  /**
   * Create a test suite that tests a component
   */
  testComponent(componentName, html, config) {
    return this.suite(`${componentName}`, (s) => {
      s.before(async (vm, id) => {
        await vm.loadHTML(id, html);
      });

      // Test component renders
      s.addTest('Component renders', async (vm, id) => {
        const count = await vm.getElementCount(id, config.selector);
        return testResult(
          'Component renders',
          count.status === 'counted' && count.count > 0,
          { details: count }
        );
      });

      // Test expected children
      if (config.children) {
        config.children.forEach(child => {
          s.addTest(`Has child: ${child.name || child.selector}`, async (vm, id) => {
            const count = await vm.getElementCount(id, `${config.selector} ${child.selector}`);
            return testResult(
              `Has child: ${child.name || child.selector}`,
              count.status === 'counted' && count.count > (child.minCount || 0),
              { details: count }
            );
          });
        });
      }

      // Test expected text
      if (config.text) {
        s.addTest('Has expected text', async (vm, id) => {
          const text = await vm.getText(id, config.selector);
          return testResult(
            'Has expected text',
            text.status === 'got' && text.text.includes(config.text),
            { details: text }
          );
        });
      }

      // Test no errors
      s.addTest('No errors in component', async (vm, id) => {
        const errors = vm.getErrors(id);
        return testResult(
          'No errors in component',
          errors.length === 0,
          { details: { errors } }
        );
      });
    });
  }

  /**
   * Create a custom test suite
   */
  custom(name, builder) {
    return this.suite(name, builder);
  }

  // ─── Execution ────────────────────────────────────────────────
  async run() {
    if (!this.vm.browser) {
      await this.vm.init();
    }

    this.results = [];

    for (const suite of this.suites) {
      const sandboxId = `sandbox_${++this.sandboxCounter}`;

      try {
        await this.vm.createSandbox(sandboxId);
        const result = await suite.run(this.vm, sandboxId);
        this.results.push(result);
      } catch (err) {
        this.results.push({
          name: suite.name,
          results: [testResult('Suite execution', false, { error: err.message })],
          passed: false
        });
      } finally {
        await this.vm.destroySandbox(sandboxId);
      }
    }

    return this.getResults();
  }

  getResults() {
    const allTests = this.results.flatMap(r => r.results);
    return {
      suites: this.results,
      summary: {
        totalSuites: this.results.length,
        passedSuites: this.results.filter(r => r.passed).length,
        failedSuites: this.results.filter(r => !r.passed).length,
        totalTests: allTests.length,
        passedTests: allTests.filter(t => t.passed).length,
        failedTests: allTests.filter(t => !t.passed).length
      }
    };
  }

  async cleanup() {
    await this.vm.destroyAll();
    this.results = [];
    this.suites = [];
    this.sandboxCounter = 0;
  }
}

module.exports = { SandboxRunner, SandboxTestSuite };
