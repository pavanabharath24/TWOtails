/**
 * TWOtails Virtual Memory Tests
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { VirtualMemory, MemoryManager } = require('../src/virtual-memory/memory-manager');

describe('VirtualMemory', () => {
  it('should create sandbox', async () => {
    const vm = new VirtualMemory();

    try {
      const result = await vm.createSandbox('test');
      assert.strictEqual(result.status, 'created');
    } finally {
      await vm.destroyAll();
    }
  });

  it('should load content', async () => {
    const vm = new VirtualMemory();

    try {
      await vm.createSandbox('test');
      const result = await vm.loadContent('test', '<html><body><h1>Test</h1></body></html>');
      assert.strictEqual(result.status, 'loaded');
    } finally {
      await vm.destroyAll();
    }
  });

  it('should click element', async () => {
    const vm = new VirtualMemory();

    try {
      await vm.createSandbox('test');
      await vm.loadContent('test', '<html><body><button id="btn">Click</button></body></html>');
      const result = await vm.clickElement('test', '#btn');
      assert.strictEqual(result.status, 'clicked');
    } finally {
      await vm.destroyAll();
    }
  });

  it('should take snapshot', async () => {
    const vm = new VirtualMemory();

    try {
      await vm.createSandbox('test');
      await vm.loadContent('test', '<html><body><p>Snapshot</p></body></html>');
      const snapshot = await vm.takeSnapshot('test');
      assert.ok(snapshot.html.includes('Snapshot'));
    } finally {
      await vm.destroyAll();
    }
  });

  it('should destroy sandbox', async () => {
    const vm = new VirtualMemory();

    await vm.createSandbox('test');
    const result = await vm.destroySandbox('test');
    assert.strictEqual(result.status, 'destroyed');
    assert.strictEqual(vm.contexts.size, 0);
  });
});

describe('MemoryManager', () => {
  it('should report status', () => {
    const manager = new MemoryManager();
    const status = manager.getStatus();

    assert.strictEqual(status.virtualMemory.sandboxes, 0);
    assert.strictEqual(status.testResults, 0);
  });
});
