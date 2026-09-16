/**
 * TWOtails Memory Cleanup
 * Handles cleanup of virtual memory and temporary files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class MemoryCleanup {
  constructor() {
    this.tempFiles = [];
    this.tempDirs = [];
  }

  async cleanupVirtualMemory(virtualMemory) {
    try {
      await virtualMemory.destroyAll();
      return { status: 'success', message: 'Virtual memory cleaned up' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  addTempFile(filePath) {
    this.tempFiles.push(filePath);
  }

  addTempDir(dirPath) {
    this.tempDirs.push(dirPath);
  }

  async cleanupTempFiles() {
    const results = [];

    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          results.push({ file, status: 'deleted' });
        }
      } catch (error) {
        results.push({ file, status: 'error', error: error.message });
      }
    }

    this.tempFiles = [];

    return results;
  }

  async cleanupTempDirs() {
    const results = [];

    for (const dir of this.tempDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          results.push({ dir, status: 'deleted' });
        }
      } catch (error) {
        results.push({ dir, status: 'error', error: error.message });
      }
    }

    this.tempDirs = [];

    return results;
  }

  async cleanupAll() {
    const fileResults = await this.cleanupTempFiles();
    const dirResults = await this.cleanupTempDirs();

    return {
      files: fileResults,
      dirs: dirResults
    };
  }

  static createTempDir(prefix = 'twotails') {
    const tempDir = path.join(os.tmpdir(), `${prefix}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    return tempDir;
  }

  static createTempFile(content, ext = '.js') {
    const tempDir = MemoryCleanup.createTempDir();
    const tempFile = path.join(tempDir, `temp${ext}`);
    fs.writeFileSync(tempFile, content);
    return tempFile;
  }
}

module.exports = { MemoryCleanup };
