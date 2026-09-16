/**
 * TWOtails Memory Cleanup
 * Handles cleanup of virtual memory, temp files, and test artifacts
 */

const fs = require('fs');
const path = require('path');

class MemoryCleanup {
  constructor() {
    this.tempFiles = [];
    this.tempDirs = [];
    this.sandboxes = [];
    this.screenshots = [];
  }

  addTempFile(filePath) {
    this.tempFiles.push(filePath);
    return this;
  }

  addTempDir(dirPath) {
    this.tempDirs.push(dirPath);
    return this;
  }

  addScreenshot(screenshotPath) {
    this.screenshots.push(screenshotPath);
    return this;
  }

  cleanupTempFiles() {
    let removed = 0;
    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          removed++;
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    this.tempFiles = [];
    return { removed };
  }

  cleanupTempDirs() {
    let removed = 0;
    for (const dir of this.tempDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          removed++;
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    this.tempDirs = [];
    return { removed };
  }

  cleanupScreenshots() {
    let removed = 0;
    for (const screenshot of this.screenshots) {
      try {
        if (fs.existsSync(screenshot)) {
          fs.unlinkSync(screenshot);
          removed++;
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }
    this.screenshots = [];
    return { removed };
  }

  cleanupAll() {
    const files = this.cleanupTempFiles();
    const dirs = this.cleanupTempDirs();
    const screenshots = this.cleanupScreenshots();

    return {
      files: files.removed,
      dirs: dirs.removed,
      screenshots: screenshots.removed,
      total: files.removed + dirs.removed + screenshots.removed
    };
  }
}

// ─── Global Cleanup Manager ─────────────────────────────────────
class GlobalCleanup {
  constructor() {
    this.instances = new Set();
    this.cleanupHandlers = [];
    this.isRegistered = false;
  }

  register(instance) {
    this.instances.add(instance);
    if (!this.isRegistered) {
      this.isRegistered = true;
      process.on('exit', () => this.syncCleanup());
      process.on('SIGINT', () => { this.syncCleanup(); process.exit(1); });
      process.on('SIGTERM', () => { this.syncCleanup(); process.exit(0); });
    }
  }

  unregister(instance) {
    this.instances.delete(instance);
  }

  async cleanupAll() {
    const results = [];
    for (const instance of this.instances) {
      try {
        if (typeof instance.cleanup === 'function') {
          const result = await instance.cleanup();
          results.push({ instance: instance.constructor?.name || 'Unknown', result });
        } else if (typeof instance.destroyAll === 'function') {
          const result = await instance.destroyAll();
          results.push({ instance: instance.constructor?.name || 'Unknown', result });
        }
      } catch (err) {
        results.push({ instance: instance.constructor?.name || 'Unknown', error: err.message });
      }
    }
    this.instances.clear();
    return results;
  }

  syncCleanup() {
    for (const instance of this.instances) {
      try {
        if (typeof instance.cleanup === 'function') {
          instance.cleanup();
        } else if (typeof instance.destroyAll === 'function') {
          instance.destroyAll();
        }
      } catch (err) {
        // Ignore sync cleanup errors
      }
    }
    this.instances.clear();
  }
}

const globalCleanup = new GlobalCleanup();

module.exports = { MemoryCleanup, GlobalCleanup, globalCleanup };
