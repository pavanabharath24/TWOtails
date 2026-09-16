/**
 * TWOtails Tracer Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { SignalMatcher, trace } = require('../src/tracer/signal-matcher');

describe('SignalMatcher', () => {
  it('should trace a file and return results', async () => {
    const matcher = new SignalMatcher();
    const result = await matcher.trace(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));

    assert.ok(result.results, 'Should have results');
    assert.ok(result.stats, 'Should have stats');
    assert.ok(result.stats.total > 0, 'Should find signals');
  });

  it('should detect connected signals', async () => {
    const matcher = new SignalMatcher();
    const result = await matcher.trace(path.join(__dirname, '..', 'examples', 'fixed-app', 'app.jsx'));

    const connected = result.results.filter(r => r.status === 'CONNECTED');
    assert.ok(connected.length > 0, 'Should find connected signals');
  });

  it('should detect broken signals', async () => {
    const matcher = new SignalMatcher();
    const result = await matcher.trace(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));

    const broken = result.results.filter(r => r.status === 'BROKEN');
    assert.ok(broken.length > 0, 'Should find broken signals');
  });
});

describe('trace', () => {
  it('should return formatted results', async () => {
    const result = await trace(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));

    assert.ok(result.results, 'Should have results');
    assert.ok(result.stats, 'Should have stats');
    assert.ok(Array.isArray(result.results), 'Results should be array');
  });
});
