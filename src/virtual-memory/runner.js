/**
 * TWOtails Virtual Memory - Main Test Runner
 * Scans project files, creates test HTML, runs Playwright tests
 */

const fs = require('fs');
const path = require('path');
const { SandboxRunner } = require('./sandbox-runner');

// ─── HTML Generator from JSX/TSX ───────────────────────────────
function generateTestHTML(filePath, content) {
  const ext = path.extname(filePath);

  // For plain HTML files, return as-is
  if (ext === '.html') return content;

  // For JSX/TSX files, wrap in a basic HTML structure with React
  if (ext === '.jsx' || ext === '.tsx' || ext === '.js' || ext === '.ts') {
    // Extract button, form, and interactive elements from content
    const buttons = extractButtons(content);
    const forms = extractForms(content);
    const inputs = extractInputs(content);
    const links = extractLinks(content);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test: ${path.basename(filePath)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
    button:hover { background: #f0f0f0; }
    button.primary { background: #007bff; color: white; border-color: #007bff; }
    button.danger { background: #dc3545; color: white; border-color: #dc3545; }
    form { margin: 10px 0; padding: 15px; border: 1px solid #ddd; border-radius: 4px; }
    input, select, textarea { display: block; width: 100%; padding: 8px 12px; margin: 8px 0; border: 1px solid #ccc; border-radius: 4px; }
    label { display: block; margin: 8px 0 4px; font-weight: 500; }
    .error { color: #dc3545; font-size: 14px; margin-top: 4px; display: none; }
    .error.visible { display: block; }
    .success { color: #28a745; font-size: 14px; margin-top: 4px; display: none; }
    .success.visible { display: block; }
    nav a { display: inline-block; margin: 0 10px; color: #007bff; text-decoration: none; }
    nav a:hover { text-decoration: underline; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; }
    .card-title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    .card-text { color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
    th { background: #f8f9fa; }
  </style>
</head>
<body>
  <div class="container" id="root">
    ${generateComponentsFromContent(content, buttons, forms, inputs, links)}
  </div>

  <script>
    // Simple interactivity
    document.addEventListener('click', function(e) {
      if (e.target.matches('button[data-action="toggle"]')) {
        const target = document.querySelector(e.target.dataset.target);
        if (target) target.classList.toggle('hidden');
      }
      if (e.target.matches('button[data-action="alert"]')) {
        alert(e.target.dataset.message || 'Button clicked!');
      }
      if (e.target.matches('button[data-action="navigate"]')) {
        const url = e.target.dataset.url;
        if (url) window.location.href = url;
      }
    });

    document.addEventListener('submit', function(e) {
      e.preventDefault();
      const form = e.target;
      const successMsg = form.querySelector('.success');
      const errorMsg = form.querySelector('.error');

      // Basic validation
      let hasError = false;
      form.querySelectorAll('[required]').forEach(input => {
        if (!input.value.trim()) {
          hasError = true;
          if (errorMsg) errorMsg.classList.add('visible');
        }
      });

      if (!hasError) {
        if (successMsg) successMsg.classList.add('visible');
        if (errorMsg) errorMsg.classList.remove('visible');
        console.log('Form submitted:', new FormData(form));
      }
    });

    // Custom event handling
    window.__twotails = {
      clickCount: 0,
      formSubmitted: false,
      lastEvent: null
    };

    document.addEventListener('click', function(e) {
      window.__twotails.clickCount++;
      window.__twotails.lastEvent = { type: 'click', target: e.target.tagName };
    });

    document.addEventListener('submit', function(e) {
      window.__twotails.formSubmitted = true;
      window.__twotails.lastEvent = { type: 'submit', target: e.target.tagName };
    });
  </script>
</body>
</html>`;
  }

  return content;
}

function extractButtons(content) {
  const buttons = [];
  const regex = /<button[^>]*>([\s\S]*?)<\/button>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    buttons.push({
      text: match[1].replace(/<[^>]*>/g, '').trim(),
      full: match[0]
    });
  }
  return buttons;
}

function extractForms(content) {
  const forms = [];
  const regex = /<form[^>]*>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    forms.push({ full: match[0] });
  }
  return forms;
}

function extractInputs(content) {
  const inputs = [];
  const regex = /<input[^>]*>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const nameMatch = match[0].match(/name=["']([^"']*)["']/);
    const typeMatch = match[0].match(/type=["']([^"']*)["']/);
    inputs.push({
      name: nameMatch?.[1] || '',
      type: typeMatch?.[1] || 'text',
      full: match[0]
    });
  }
  return inputs;
}

function extractLinks(content) {
  const links = [];
  const regex = /<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push({
      href: match[1],
      text: match[2].replace(/<[^>]*>/g, '').trim()
    });
  }
  return links;
}

function generateComponentsFromContent(content, buttons, forms, inputs, links) {
  let html = '';

  // Add navigation if links found
  if (links.length > 0) {
    html += '<nav>';
    links.forEach(link => {
      html += `<a href="${link.href}">${link.text || link.href}</a>`;
    });
    html += '</nav>';
  }

  // Add buttons
  if (buttons.length > 0) {
    html += '<div class="button-group">';
    buttons.forEach((btn, i) => {
      const className = btn.text.toLowerCase().includes('delete') ? 'danger' :
                       btn.text.toLowerCase().includes('submit') || btn.text.toLowerCase().includes('save') ? 'primary' : '';
      html += `<button class="${className}" data-action="alert" data-message="${btn.text}">${btn.text || `Button ${i + 1}`}</button>`;
    });
    html += '</div>';
  }

  // Add forms
  if (forms.length > 0 || inputs.length > 0) {
    html += '<form>';
    if (inputs.length > 0) {
      inputs.forEach(input => {
        html += `<label>${input.name || input.type}</label>`;
        html += `<input type="${input.type}" name="${input.name}" placeholder="Enter ${input.name || input.type}">`;
      });
    }
    html += '<div class="error">Please fill in all required fields</div>';
    html += '<div class="success">Form submitted successfully!</div>';
    html += '<button type="submit" class="primary">Submit</button>';
    html += '</form>';
  }

  // Add a card for content
  html += `
    <div class="card">
      <div class="card-title">Component Preview</div>
      <div class="card-text">
        <p>This is a test rendering of the component.</p>
        <p>File: ${path.basename('')}</p>
      </div>
    </div>`;

  return html;
}

// ─── Virtual Memory Test Runner ─────────────────────────────────
async function runVirtualMemoryTests(directory, options = {}) {
  const { glob } = require('glob');
  const runner = new SandboxRunner(options);

  try {
    // Find testable files
    const files = await glob('**/*.{html,jsx,tsx,vue,svelte,js,ts}', {
      cwd: directory,
      ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**'],
      absolute: true
    });

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const testHTML = generateTestHTML(file, content);

      // Extract testable elements
      const buttons = extractButtons(content);
      const forms = extractForms(content);
      const inputs = extractInputs(content);
      const links = extractLinks(content);

      const componentName = path.basename(file, path.extname(file));

      // Create test suite for buttons
      if (buttons.length > 0) {
        const buttonConfigs = buttons.map((btn, i) => ({
          selector: `button:nth-of-type(${i + 1})`,
          text: btn.text,
          click: true
        }));
        runner.testButtons(componentName, testHTML, buttonConfigs);
      }

      // Create test suite for forms
      if (forms.length > 0 || inputs.length > 0) {
        const fieldConfigs = inputs
          .filter(input => input.name)
          .map(input => ({
            selector: `input[name="${input.name}"]`,
            value: `test_${input.name}`
          }));

        if (fieldConfigs.length > 0) {
          runner.testForm(componentName, testHTML, {
            selector: 'form',
            fields: fieldConfigs,
            submit: true,
            validation: inputs.some(i => i.type === 'email') ? [{
              name: 'Email validation',
              errorSelector: '.error.visible'
            }] : []
          });
        }
      }

      // Create test suite for navigation
      if (links.length > 0) {
        const navConfigs = links.map((link, i) => ({
          name: `Navigate to ${link.text || link.href}`,
          triggerSelector: `a:nth-of-type(${i + 1})`,
          expectURL: link.href
        }));
        runner.testNavigation(componentName, testHTML, navConfigs);
      }

      // Always add component render test
      runner.testComponent(componentName, testHTML, {
        selector: '#root',
        children: [
          { name: 'Container', selector: '.container', minCount: 0 },
          ...(buttons.length > 0 ? [{ name: 'Buttons', selector: 'button', minCount: 1 }] : []),
          ...(forms.length > 0 || inputs.length > 0 ? [{ name: 'Form', selector: 'form', minCount: 1 }] : [])
        ]
      });
    }

    // Run all tests
    const results = await runner.run();

    // Cleanup
    await runner.cleanup();

    return results;
  } catch (err) {
    await runner.cleanup();
    throw err;
  }
}

module.exports = {
  runVirtualMemoryTests,
  generateTestHTML,
  SandboxRunner
};
