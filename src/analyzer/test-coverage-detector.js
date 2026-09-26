/**
 * TWOtails Test Coverage Detector
 * Detects untested functions and missing test files
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const { simple: walkSimple } = require('../utils/ast-walk');

class TestCoverageDetector {
  constructor() {
    this.issues = [];
    this.sourceFunctions = new Map(); // name -> [{file, line, params}]
    this.testFiles = [];
    this.testedFunctions = new Set();
    this.untestedFunctions = [];
    this.stats = {
      sourceFilesScanned: 0,
      testFilesScanned: 0,
      totalFunctions: 0,
      testedFunctions: 0,
      untestedFunctions: 0,
      missingTestFiles: 0
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    // Find source files (non-test)
    const sourceFiles = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: dirPath,
      ignore: [...ignorePatterns, '**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/test/**'],
      absolute: true
    });

    // Find test files
    const testFiles = await glob('**/*.{test,spec}.{js,jsx,ts,tsx}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Also find files in __tests__ directories
    const testDirFiles = await glob('**/__tests__/**/*.{js,jsx,ts,tsx}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Scan source files
    for (const file of sourceFiles) {
      try {
        this.scanSourceFile(file);
      } catch (err) {
        // Skip parse errors
      }
    }

    // Scan test files
    for (const file of [...testFiles, ...testDirFiles]) {
      try {
        this.scanTestFile(file);
      } catch (err) {
        // Skip parse errors
      }
    }

    // Cross-reference
    this.findUntestedFunctions();
    this.checkForMissingTestFiles(sourceFiles);

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;

    return {
      issues: this.issues,
      sourceFunctions: Array.from(this.sourceFunctions.entries()),
      testFiles: this.testFiles,
      testedFunctions: Array.from(this.testedFunctions),
      untestedFunctions: this.untestedFunctions,
      stats: this.stats
    };
  }

  scanSourceFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.sourceFilesScanned++;

    try {
      const parser = acorn.Parser.extend(jsx());
      const ast = parser.parse(content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true
      });

      walkSimple(ast, {
        FunctionDeclaration: (node) => {
          const name = node.id?.name;
          if (name && !name.startsWith('_') && name !== 'constructor') {
            if (!this.sourceFunctions.has(name)) {
              this.sourceFunctions.set(name, []);
            }
            this.sourceFunctions.get(name).push({
              file: filePath,
              line: node.loc.start.line,
              params: node.params.length,
              type: 'function'
            });
            this.stats.totalFunctions++;
          }
        },

        VariableDeclarator: (node) => {
          if (node.init?.type === 'ArrowFunctionExpression' ||
              node.init?.type === 'FunctionExpression') {
            const name = node.id?.name;
            if (name && !name.startsWith('_')) {
              if (!this.sourceFunctions.has(name)) {
                this.sourceFunctions.set(name, []);
              }
              this.sourceFunctions.get(name).push({
                file: filePath,
                line: node.loc.start.line,
                params: node.init.params.length,
                type: 'arrow/function'
              });
              this.stats.totalFunctions++;
            }
          }
        },

        // Also detect exported functions
        ExportDefaultDeclaration: (node) => {
          if (node.declaration?.type === 'FunctionDeclaration') {
            const name = node.declaration.id?.name || 'default';
            if (!this.sourceFunctions.has(name)) {
              this.sourceFunctions.set(name, []);
            }
            this.sourceFunctions.get(name).push({
              file: filePath,
              line: node.loc.start.line,
              params: node.declaration.params.length,
              type: 'exported'
            });
          }
        },

        ExportNamedDeclaration: (node) => {
          if (node.declaration?.type === 'FunctionDeclaration') {
            const name = node.declaration.id?.name;
            if (name) {
              if (!this.sourceFunctions.has(name)) {
                this.sourceFunctions.set(name, []);
              }
              this.sourceFunctions.get(name).push({
                file: filePath,
                line: node.loc.start.line,
                params: node.declaration.params.length,
                type: 'exported'
              });
            }
          }
        }
      });
    } catch (err) {
      // Fallback to regex
      this.regexScanSource(filePath, content);
    }
  }

  regexScanSource(filePath, content) {
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        const name = funcMatch[1];
        if (!this.sourceFunctions.has(name)) {
          this.sourceFunctions.set(name, []);
        }
        this.sourceFunctions.get(name).push({
          file: filePath,
          line: idx + 1,
          params: 0,
          type: 'function'
        });
        this.stats.totalFunctions++;
      }

      const arrowMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/);
      if (arrowMatch) {
        const name = arrowMatch[1];
        if (!this.sourceFunctions.has(name)) {
          this.sourceFunctions.set(name, []);
        }
        this.sourceFunctions.get(name).push({
          file: filePath,
          line: idx + 1,
          params: 0,
          type: 'arrow'
        });
        this.stats.totalFunctions++;
      }
    });
  }

  scanTestFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.testFilesScanned++;
    this.testFiles.push(filePath);

    // Extract function names being tested
    const testPatterns = [
      /(?:test|it|describe|specify)\s*\(\s*['"`]([^'"]+)['"`]/g,
      /(?:expect|assert)\s*\(\s*(\w+)/g,
      /(?:\w+)\s*\.\s*(?:test|spec|describe)\s*\(/g
    ];

    testPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        this.testedFunctions.add(match[1]);
      }
    });

    // Also look for function calls in tests
    const callPattern = /(\w+)\s*\(/g;
    let callMatch;
    while ((callMatch = callPattern.exec(content)) !== null) {
      this.testedFunctions.add(callMatch[1]);
    }
  }

  findUntestedFunctions() {
    this.sourceFunctions.forEach((defs, name) => {
      // Skip common utility functions and internals
      if (name.startsWith('_') || name === 'constructor' || name === 'render') return;

      // Check if function is tested
      const isTested = this.testedFunctions.has(name) ||
                       this.testedFunctions.has(name.replace(/([A-Z])/g, '_$1').toLowerCase()) ||
                       this.testedFunctions.has(`test ${name}`) ||
                       this.testedFunctions.has(`should ${name}`);

      if (!isTested) {
        defs.forEach(def => {
          this.untestedFunctions.push({
            name,
            file: def.file,
            line: def.line,
            params: def.params,
            type: def.type
          });

          this.issues.push({
            file: def.file,
            line: def.line,
            type: 'UNTESTED_FUNCTION',
            severity: 'WARNING',
            message: `Function "${name}" has no tests`,
            suggestion: `Add tests for function "${name}"`
          });
        });
      }
    });

    this.stats.testedFunctions = this.sourceFunctions.size - this.untestedFunctions.length;
    this.stats.untestedFunctions = this.untestedFunctions.length;
  }

  checkForMissingTestFiles(sourceFiles) {
    const sourceDir = new Set();

    sourceFiles.forEach(file => {
      const dir = path.dirname(file);
      sourceDir.add(dir);
    });

    sourceDir.forEach(dir => {
      const hasTestFile = this.testFiles.some(testFile => {
        const testDir = path.dirname(testFile);
        return testDir === dir || testDir.includes(dir);
      });

      if (!hasTestFile) {
        this.stats.missingTestFiles++;
        this.issues.push({
          file: dir,
          line: 0,
          type: 'MISSING_TEST_FILE',
          severity: 'INFO',
          message: `No test files found in ${dir}`,
          suggestion: `Create test file for components in ${dir}`
        });
      }
    });
  }

  getCoveragePercentage() {
    if (this.stats.totalFunctions === 0) return 100;
    return Math.round((this.stats.testedFunctions / this.stats.totalFunctions) * 100);
  }

  getRecommendations() {
    const recommendations = [];
    const coverage = this.getCoveragePercentage();

    if (coverage < 50) {
      recommendations.push({
        type: 'LOW_COVERAGE',
        message: `Test coverage is ${coverage}% - very low`,
        suggestion: 'Add tests for critical functions first'
      });
    } else if (coverage < 80) {
      recommendations.push({
        type: 'MEDIUM_COVERAGE',
        message: `Test coverage is ${coverage}%`,
        suggestion: 'Add tests for remaining untested functions'
      });
    }

    if (this.stats.missingTestFiles > 0) {
      recommendations.push({
        type: 'MISSING_TEST_FILES',
        message: `${this.stats.missingTestFiles} directories without test files`,
        suggestion: 'Add test files for each source directory'
      });
    }

    return recommendations;
  }
}

module.exports = { TestCoverageDetector };
