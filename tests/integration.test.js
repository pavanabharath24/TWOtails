/**
 * TWOtails Integration Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { LineByLineAnalyzer } = require('../src/analyzer/line-analyzer');
const { SignalMatcher } = require('../src/tracer/signal-matcher');

describe('Integration: Full Line-by-Line Scan', () => {
  it('should scan broken-app and find all issues', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    assert.ok(result.issues.length > 0, 'Should find issues');
    assert.ok(result.stats.errors > 0, 'Should find errors');
  });

  it('should scan fixed-app and find fewer issues', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'fixed-app'));

    // fixed-app should have fewer errors
    const errors = result.issues.filter(i => i.severity === 'ERROR');
    assert.ok(errors.length <= 1, 'Fixed app should have minimal errors');
  });
});

describe('Integration: Full Signal Trace', () => {
  it('should trace broken-app and find broken signals', async () => {
    const matcher = new SignalMatcher();
    const result = await matcher.trace(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));

    assert.ok(result.results.length > 0, 'Should find signals');
    const broken = result.results.filter(r => r.status === 'BROKEN');
    assert.ok(broken.length > 0, 'Should find broken signals');
  });

  it('should trace utils.js and find definitions', async () => {
    const matcher = new SignalMatcher();
    const result = await matcher.trace(path.join(__dirname, '..', 'examples', 'broken-app', 'utils.js'));

    // utils.js has function definitions - they should be found as signals
    assert.ok(result.results.length > 0, 'Should find signals');
    // Some may be broken (no callers in same file), some connected (if called)
  });
});

describe('Integration: Parameter Matching', () => {
  it('should detect parameter count mismatches', async () => {
    const fs = require('fs');
    const testDir = path.join(__dirname, '..', 'examples', 'param-test');
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(path.join(testDir, 'a.js'), `
function add(a, b) {
  return a + b;
}
add(1, 2, 3);
`);

    try {
      const analyzer = new LineByLineAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);

      const mismatches = result.issues.filter(i => i.type === 'PARAMETER_MISMATCH');
      assert.ok(mismatches.length > 0, 'Should detect parameter mismatch');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});
