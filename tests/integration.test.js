/**
 * TWOtails Integration Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { scan } = require('../src/analyzer/ast-parser');

describe('Integration: Scan', () => {
  it('should scan directory and find connections', async () => {
    const results = await scan(path.join(__dirname, '..', 'examples', 'broken-app'), {});

    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length > 0, 'Should find some connections');
  });

  it('should detect broken connections', async () => {
    const results = await scan(path.join(__dirname, '..', 'examples', 'broken-app'), {});

    const broken = results.filter(r => r.status.includes('BROKEN'));
    assert.ok(broken.length > 0, 'Should find broken connections in broken-app');
  });
});
