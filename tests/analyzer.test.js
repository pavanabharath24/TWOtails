/**
 * TWOtails Analyzer Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { ASTParser, scan, buildConnections } = require('../src/analyzer/ast-parser');

describe('ASTParser', () => {
  const parser = new ASTParser();

  it('should parse function calls with acorn', () => {
    const { nodes } = parser.parseFile(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));
    const calls = nodes.filter(n => n.type === 'function_call');
    assert.ok(calls.length > 0, 'Should find function calls');
  });

  it('should parse function definitions', () => {
    const { nodes } = parser.parseFile(path.join(__dirname, '..', 'examples', 'broken-app', 'utils.js'));
    const defs = nodes.filter(n => n.type === 'function_definition');
    assert.ok(defs.length > 0, 'Should find function definitions');
    assert.ok(defs.some(d => d.name === 'formatDate'), 'Should find formatDate');
  });

  it('should parse imports', () => {
    const { nodes } = parser.parseFile(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));
    const imports = nodes.filter(n => n.type === 'import');
    assert.ok(imports.length > 0, 'Should find imports');
  });

  it('should parse JSX event handlers', () => {
    const { nodes } = parser.parseFile(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));
    const handlers = nodes.filter(n => n.type === 'event_handler');
    assert.ok(handlers.length > 0, 'Should find event handlers');
    assert.ok(handlers.some(h => h.name === 'handleClick'), 'Should find handleClick');
    assert.ok(handlers.some(h => h.name === 'submitForm'), 'Should find submitForm');
  });

  it('should detect missing event handler definitions', () => {
    const { nodes } = parser.parseFile(path.join(__dirname, '..', 'examples', 'broken-app', 'app.jsx'));
    const handlers = nodes.filter(n => n.type === 'event_handler');
    const defs = nodes.filter(n => n.type === 'function_definition');

    const missingHandlers = handlers.filter(handler => {
      return !defs.some(d => d.name === handler.name);
    });

    assert.ok(missingHandlers.length > 0, 'Should find missing handler definitions');
  });
});

describe('buildConnections', () => {
  it('should match function calls to definitions', () => {
    const nodes = [
      { type: 'function_call', name: 'greet', file: 'a.js', line: 5 },
      { type: 'function_definition', name: 'greet', file: 'b.js', line: 10 }
    ];

    const connections = buildConnections(nodes);
    const greetConn = connections.find(c => c.senderName === 'greet');

    assert.ok(greetConn, 'Should find connection for greet');
    assert.ok(greetConn.receiverFile, 'Should have receiver');
  });

  it('should detect missing function definitions', () => {
    const nodes = [
      { type: 'function_call', name: 'missing', file: 'a.js', line: 5 }
    ];

    const connections = buildConnections(nodes);
    const missingConn = connections.find(c => c.senderName === 'missing');

    assert.ok(missingConn, 'Should find connection for missing');
    assert.strictEqual(missingConn.receiverFile, undefined, 'Should not have receiver');
  });

  it('should detect unused imports', () => {
    const nodes = [
      { type: 'import', name: 'unused', source: 'utils', file: 'a.js', line: 1 }
    ];

    const connections = buildConnections(nodes);
    const unusedConn = connections.find(c => c.senderName === 'unused');

    assert.ok(unusedConn, 'Should find unused import');
    assert.strictEqual(unusedConn.type, 'unused_import');
  });
});

describe('scan', () => {
  it('should scan directory and return results with stats', async () => {
    const result = await scan(path.join(__dirname, '..', 'examples', 'broken-app'), {});

    assert.ok(result.results, 'Should have results');
    assert.ok(result.stats, 'Should have stats');
    assert.ok(result.stats.filesScanned > 0, 'Should scan files');
  });

  it('should detect broken connections in broken-app', async () => {
    const result = await scan(path.join(__dirname, '..', 'examples', 'broken-app'), {});

    const broken = result.results.filter(r => r.status.includes('BROKEN'));
    assert.ok(broken.length > 0, 'Should find broken connections');
  });
});
