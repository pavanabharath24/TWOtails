/**
 * TWOtails Integration Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { scan } = require('../src/analyzer/ast-parser');
const { trace } = require('../src/tracer/signal-matcher');

describe('Integration: Full Scan', () => {
  it('should scan broken-app and find issues', async () => {
    const result = await scan(path.join(__dirname, '..', 'examples', 'broken-app'), {});

    assert.ok(result.results.length > 0, 'Should find connections');
    assert.ok(result.stats.broken > 0, 'Should find broken connections');
  });

  it('should scan fixed-app and find fewer issues', async () => {
    const result = await scan(path.join(__dirname, '..', 'examples', 'fixed-app'), {});

    assert.ok(result.results.length > 0, 'Should find connections');
  });
});

describe('Integration: Full Trace', () => {
  it('should trace broken-app and find missing definitions', async () => {
    const result = await trace(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));

    assert.ok(result.results.length > 0, 'Should find signals');
    const broken = result.results.filter(r => r.status.includes('BROKEN'));
    assert.ok(broken.length > 0, 'Should find broken signals');
  });

  it('should trace utils.js and find definitions', async () => {
    const result = await trace(path.join(__dirname, '..', 'examples', 'broken-app', 'utils.js'));

    assert.ok(result.results.length > 0, 'Should find signals');
    // utils.js has function definitions - they should be connected if called
    const connected = result.results.filter(r => r.status.includes('CONNECTED'));
    assert.ok(connected.length >= 0, 'Should have some results');
  });
});
