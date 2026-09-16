/**
 * TWOtails Sandbox Runner
 * Runs code in isolated sandbox environments
 */

const { VirtualMemory } = require('./memory-manager');

class SandboxRunner {
  constructor(options = {}) {
    this.virtualMemory = new VirtualMemory(options);
    this.results = [];
  }

  async runCode(code, options = {}) {
    const sandboxId = `sandbox_${Date.now()}`;

    try {
      await this.virtualMemory.createSandbox(sandboxId);

      // Wrap code in HTML
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script>${code}</script>
        </head>
        <body>
          <div id="app"></div>
        </body>
        </html>
      `;

      await this.virtualMemory.loadContent(sandboxId, html);

      // Wait for code to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get results
      const result = await this.virtualMemory.evaluate(sandboxId, () => {
        return {
          errors: window.__TWOTAILS_ERRORS__ || [],
          logs: window.__TWOTAILS_LOGS__ || [],
          state: window.__TWOTAILS_STATE__ || {}
        };
      });

      await this.virtualMemory.destroySandbox(sandboxId);

      return {
        success: true,
        result
      };
    } catch (error) {
      await this.virtualMemory.destroySandbox(sandboxId);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async testComponent(componentCode, testCode) {
    const sandboxId = `component_${Date.now()}`;

    try {
      await this.virtualMemory.createSandbox(sandboxId);

      // Load component
      const componentHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        </head>
        <body>
          <div id="root"></div>
          <script>
            ${componentCode}
          </script>
        </body>
        </html>
      `;

      await this.virtualMemory.loadContent(sandboxId, componentHtml);

      // Run tests
      const result = await this.virtualMemory.evaluate(sandboxId, () => {
        const testFunctions = Object.keys(window).filter(k => k.startsWith('test'));
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

      await this.virtualMemory.destroySandbox(sandboxId);

      return result;
    } catch (error) {
      await this.virtualMemory.destroySandbox(sandboxId);
      return {
        passed: false,
        error: error.message
      };
    }
  }

  async testInteraction(selector, action) {
    const sandboxId = `interaction_${Date.now()}`;

    try {
      await this.virtualMemory.createSandbox(sandboxId);

      let result;

      switch (action.type) {
        case 'click':
          result = await this.virtualMemory.clickElement(sandboxId, selector);
          break;
        case 'fill':
          result = await this.virtualMemory.fillForm(sandboxId, selector, action.value);
          break;
        case 'submit':
          result = await this.virtualMemory.submitForm(sandboxId, selector);
          break;
        case 'navigate':
          result = await this.virtualMemory.navigate(sandboxId, action.url);
          break;
        default:
          result = { status: 'unknown_action' };
      }

      await this.virtualMemory.destroySandbox(sandboxId);

      return result;
    } catch (error) {
      await this.virtualMemory.destroySandbox(sandboxId);
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  async cleanup() {
    await this.virtualMemory.destroyAll();
  }
}

module.exports = { SandboxRunner };
