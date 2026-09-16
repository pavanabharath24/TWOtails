/**
 * TWOtails Tracer Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { SignalSender } = require('../src/tracer/signal-sender');
const { SignalReceiver } = require('../src/tracer/signal-receiver');
const { SignalMatcher } = require('../src/tracer/signal-matcher');

describe('SignalSender', () => {
  it('should create signal from function call', () => {
    const sender = new SignalSender();
    const signal = sender.sendFromFunctionCall({
      name: 'handleSubmit',
      file: 'App.js',
      line: 45
    });

    assert.ok(signal.id, 'Should have id');
    assert.strictEqual(signal.type, 'function_call');
    assert.strictEqual(signal.source.name, 'handleSubmit');
  });

  it('should create signal from event emit', () => {
    const sender = new SignalSender();
    const signal = sender.sendFromEventEmit({
      name: 'save',
      file: 'Form.js',
      line: 23
    });

    assert.ok(signal.id, 'Should have id');
    assert.strictEqual(signal.type, 'event_emit');
    assert.strictEqual(signal.source.name, 'save');
  });
});

describe('SignalReceiver', () => {
  it('should create signal from function definition', () => {
    const receiver = new SignalReceiver();
    const signal = receiver.sendFromFunctionDefinition({
      name: 'handleSubmit',
      file: 'handlers.js',
      line: 12
    });

    assert.ok(signal.id, 'Should have id');
    assert.strictEqual(signal.type, 'function_definition');
    assert.strictEqual(signal.source.name, 'handleSubmit');
  });

  it('should create signal from event listener', () => {
    const receiver = new SignalReceiver();
    const signal = receiver.sendFromEventListener({
      name: 'save',
      file: 'EventManager.js',
      line: 8
    });

    assert.ok(signal.id, 'Should have id');
    assert.strictEqual(signal.type, 'event_listener');
    assert.strictEqual(signal.source.name, 'save');
  });
});

describe('SignalMatcher', () => {
  it('should match signals with same name', () => {
    const matcher = new SignalMatcher();

    matcher.sender.sendFromFunctionCall({
      name: 'test',
      file: 'a.js',
      line: 1
    });

    matcher.receiver.sendFromFunctionDefinition({
      name: 'test',
      file: 'b.js',
      line: 2
    });

    const results = matcher.matchSignals();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'CONNECTED');
  });

  it('should detect broken connections', () => {
    const matcher = new SignalMatcher();

    matcher.sender.sendFromFunctionCall({
      name: 'missing',
      file: 'a.js',
      line: 1
    });

    const results = matcher.matchSignals();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'BROKEN');
  });
});
