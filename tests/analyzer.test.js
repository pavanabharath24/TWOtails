/**
 * TWOtails Analyzer Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ASTParser, scan, buildConnections } = require('../src/analyzer/ast-parser');

describe('ASTParser', () => {
  it('should parse function calls', () => {
    const parser = new ASTParser();
    const { nodes } = parser.regexParse('test.js', `
      function greet() {
        console.log("hello");
      }
      greet();
    `);

    const calls = nodes.filter(n => n.type === 'function_call');
    assert.ok(calls.length > 0, 'Should find function calls');
  });

  it('should parse function definitions', () => {
    const parser = new ASTParser();
    const { nodes } = parser.regexParse('test.js', `
      function greet() {
        console.log("hello");
      }
    `);

    const defs = nodes.filter(n => n.type === 'function_definition');
    assert.ok(defs.length > 0, 'Should find function definitions');
    assert.strictEqual(defs[0].name, 'greet');
  });

  it('should parse imports', () => {
    const parser = new ASTParser();
    const { nodes } = parser.regexParse('test.js', `
      import { useState } from 'react';
    `);

    const imports = nodes.filter(n => n.type === 'import');
    assert.ok(imports.length > 0, 'Should find imports');
  });

  it('should parse event handlers', () => {
    const parser = new ASTParser();
    const { nodes } = parser.regexParse('test.jsx', `
      <button onClick={handleClick}>Click me</button>
    `);

    const handlers = nodes.filter(n => n.type === 'event_handler');
    assert.ok(handlers.length > 0, 'Should find event handlers');
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
    assert.ok(greetConn.receiver, 'Should have receiver');
  });

  it('should detect missing function definitions', () => {
    const nodes = [
      { type: 'function_call', name: 'missing', file: 'a.js', line: 5 }
    ];

    const connections = buildConnections(nodes);
    const missingConn = connections.find(c => c.senderName === 'missing');

    assert.ok(missingConn, 'Should find connection for missing');
    assert.strictEqual(missingConn.receiver, undefined, 'Should not have receiver');
  });
});
