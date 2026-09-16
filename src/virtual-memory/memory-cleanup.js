/**
 * TWOtails Memory Cleanup
 * Handles cleanup of virtual memory and temporary files
 */

class MemoryCleanup {
  constructor() {
    this.tempFiles = [];
    this.tempDirs = [];
  }

  addTempFile(filePath) {
    this.tempFiles.push(filePath);
  }

  addTempDir(dirPath) {
    this.tempDirs.push(dirPath);
  }

  cleanupAll() {
    const results = {
      files: this.tempFiles.length,
      dirs: this.tempDirs.length
    };

    this.tempFiles = [];
    this.tempDirs = [];

    return results;
  }
}

module.exports = { MemoryCleanup };
