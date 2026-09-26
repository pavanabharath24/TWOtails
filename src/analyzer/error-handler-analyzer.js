/**
 * TWOtails Error Handler Analyzer
 * Detects uncaught promises, missing error handlers, silent failures
 */

const fs = require('fs');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const { simple: walkSimple } = require('../utils/ast-walk');

// Error handling patterns
const ERROR_PATTERNS = {
  // Uncaught promises
  uncaughtPromise: {
    pattern: /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:fetch|axios|\.then|\.query|\.find|\.create|\.update)/,
    type: 'UNCAUGHT_PROMISE',
    severity: 'ERROR',
    message: 'Promise may not have error handling'
  },

  // Missing .catch on promises
  missingCatch: {
    pattern: /(?:fetch|axios|\.then)\s*\([^)]*\)(?!\s*\.catch)/,
    type: 'MISSING_CATCH',
    severity: 'WARNING',
    message: 'Promise chain missing .catch() handler'
  },

  // Empty catch blocks
  emptyCatch: {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    type: 'EMPTY_CATCH',
    severity: 'ERROR',
    message: 'Empty catch block swallows errors'
  },

  // Catch with only console.log
  catchConsoleLog: {
    pattern: /catch\s*\([^)]*\)\s*\{\s*console\.(?:log|debug)\s*\(/,
    type: 'LOG_ONLY_CATCH',
    severity: 'WARNING',
    message: 'Catch block only logs error - consider rethrowing'
  },

  // Silent failure
  silentFailure: {
    pattern: /catch\s*\([^)]*\)\s*\{\s*\/\/.*\}/,
    type: 'SILENT_FAILURE',
    severity: 'WARNING',
    message: 'Catch block only contains comment - errors silenced'
  },

  // Unhandled async without try/catch
  unhandledAsync: {
    pattern: /(?:await|\.then)\s*\([^)]*\)(?!\s*(?:\.catch|;|\s*\}))\s*$/,
    type: 'UNHANDLED_ASYNC',
    severity: 'WARNING',
    message: 'Async operation without error handling'
  },

  // Missing error in async function
  missingAsyncError: {
    pattern: /async\s+(?:function|\([^)]*\)\s*=>)\s*\{[^}]*\}/,
    type: 'MISSING_ASYNC_ERROR',
    severity: 'INFO',
    message: 'Async function may need try/catch'
  }
};

class ErrorHandlerAnalyzer {
  constructor() {
    this.issues = [];
    this.asyncFunctions = [];
    this.promises = [];
    this.stats = {
      filesScanned: 0,
      uncaughtPromises: 0,
      missingCatch: 0,
      emptyCatch: 0,
      silentFailures: 0
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    for (const file of files) {
      try {
        this.scanFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;

    return {
      issues: this.issues,
      asyncFunctions: this.asyncFunctions,
      promises: this.promises,
      stats: this.stats
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;

    // Regex-based scanning
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      this.checkLine(filePath, line, idx + 1);
    });

    // AST-based scanning
    try {
      this.scanAST(filePath, content);
    } catch (err) {
      // Skip parse errors
    }
  }

  checkLine(filePath, line, lineNum) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    for (const [name, check] of Object.entries(ERROR_PATTERNS)) {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: this.getSuggestion(check.type),
          code: line.trim()
        });
        this.updateStats(check.type);
      }
    }
  }

  scanAST(filePath, content) {
    const parser = acorn.Parser.extend(jsx());

    try {
      const ast = parser.parse(content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true
      });

      walkSimple(ast, {
        // Find async functions
        FunctionDeclaration: (node) => {
          if (node.async) {
            this.asyncFunctions.push({
              file: filePath,
              line: node.loc.start.line,
              name: node.id?.name || 'anonymous',
              hasTryCatch: this.hasTryCatch(node)
            });

            if (!this.hasTryCatch(node)) {
              this.issues.push({
                file: filePath,
                line: node.loc.start.line,
                type: 'ASYNC_NO_TRY_CATCH',
                severity: 'WARNING',
                message: `Async function "${node.id?.name || 'anonymous'}" has no try/catch`,
                suggestion: 'Wrap async function body in try/catch'
              });
            }
          }
        },

        // Find promise chains without .catch
        CallExpression: (node) => {
          if (node.callee?.type === 'MemberExpression' && node.callee?.property?.name === 'then') {
            const hasCatch = this.hasCatchInChain(node);
            if (!hasCatch) {
              this.issues.push({
                file: filePath,
                line: node.loc.start.line,
                type: 'PROMISE_NO_CATCH',
                severity: 'WARNING',
                message: 'Promise .then() chain missing .catch()',
                suggestion: 'Add .catch() handler to promise chain'
              });
              this.stats.missingCatch++;
            }
          }
        },

        // Find try/catch blocks
        TryStatement: (node) => {
          if (node.handler?.body?.body?.length === 0) {
            this.issues.push({
              file: filePath,
              line: node.loc.start.line,
              type: 'EMPTY_CATCH',
              severity: 'ERROR',
              message: 'Empty catch block - errors will be silently swallowed',
              suggestion: 'Add error handling or rethrow the error'
            });
            this.stats.emptyCatch++;
          }
        }
      });
    } catch (err) {
      // Skip parse errors
    }
  }

  hasTryCatch(node) {
    if (node.body?.type === 'BlockStatement') {
      return node.body.body.some(stmt => stmt.type === 'TryStatement');
    }
    return false;
  }

  hasCatchInChain(node) {
    // Simple check - look for .catch in the chain
    if (node.callee?.type === 'MemberExpression') {
      return node.callee.property?.name === 'catch';
    }
    return false;
  }

  updateStats(type) {
    switch (type) {
      case 'UNCAUGHT_PROMISE':
      case 'UNHANDLED_ASYNC':
        this.stats.uncaughtPromises++;
        break;
      case 'MISSING_CATCH':
        this.stats.missingCatch++;
        break;
      case 'EMPTY_CATCH':
        this.stats.emptyCatch++;
        break;
      case 'SILENT_FAILURE':
      case 'LOG_ONLY_CATCH':
        this.stats.silentFailures++;
        break;
    }
  }

  getSuggestion(type) {
    const suggestions = {
      'UNCAUGHT_PROMISE': 'Add .catch() or wrap in try/catch',
      'MISSING_CATCH': 'Add .catch() handler to promise chain',
      'EMPTY_CATCH': 'Add error logging or rethrow the error',
      'LOG_ONLY_CATCH': 'Consider rethrowing or handling error properly',
      'SILENT_FAILURE': 'Add proper error handling',
      'UNHANDLED_ASYNC': 'Add error handling for async operation',
      'MISSING_ASYNC_ERROR': 'Wrap async function body in try/catch',
      'ASYNC_NO_TRY_CATCH': 'Wrap async function body in try/catch',
      'PROMISE_NO_CATCH': 'Add .catch() handler to promise chain'
    };
    return suggestions[type] || 'Add proper error handling';
  }
}

module.exports = { ErrorHandlerAnalyzer, ERROR_PATTERNS };
