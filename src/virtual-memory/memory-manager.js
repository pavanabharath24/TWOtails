/**
 * TWOtails Virtual Memory Manager
 * Creates and manages isolated testing sandboxes
 */

class VirtualMemory {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.contexts = new Map();
  }

  createSandbox(id) {
    this.contexts.set(id, {
      id,
      created: Date.now(),
      status: 'active',
      state: {}
    });

    return { id, status: 'created' };
  }

  setState(sandboxId, key, value) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    sandbox.state[key] = value;
    return { status: 'set', key, value };
  }

  getState(sandboxId, key) {
    const sandbox = this.contexts.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    return sandbox.state[key];
  }

  destroySandbox(id) {
    this.contexts.delete(id);
    return { status: 'destroyed' };
  }

  destroyAll() {
    this.contexts.clear();
    return { status: 'all_destroyed' };
  }

  getStatus() {
    return {
      sandboxes: this.contexts.size,
      maxSize: 100
    };
  }
}

module.exports = { VirtualMemory };
