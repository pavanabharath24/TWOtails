/**
 * TWOtails Line-by-Line Analyzer
 * Checks every single line for correctness
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const walk = require('acorn-walk');

// Built-in methods and keywords to ignore
const BUILTINS = new Set([
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof',
  'void', 'yield', 'await', 'async', 'function', 'class', 'extends', 'super',
  'import', 'export', 'default', 'from', 'const', 'let', 'var', 'this',
  'console', 'log', 'error', 'warn', 'info', 'debug', 'trace', 'table',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect',
  'document', 'window', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'fetch', 'XMLHttpRequest', 'WebSocket',
  'alert', 'confirm', 'prompt'
]);

const PROTO_METHODS = new Set([
  'charAt', 'charCodeAt', 'concat', 'includes', 'indexOf', 'lastIndexOf',
  'match', 'replace', 'search', 'slice', 'split', 'startsWith', 'endsWith',
  'substring', 'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd',
  'padStart', 'padEnd', 'repeat', 'toString', 'valueOf', 'toLocaleString',
  'toFixed', 'toExponential', 'toPrecision', 'toLocaleDateString', 'toLocaleTimeString',
  'keys', 'values', 'entries', 'has', 'get', 'set', 'delete', 'clear',
  'push', 'pop', 'shift', 'unshift', 'splice', 'map', 'filter',
  'reduce', 'reduceRight', 'forEach', 'find', 'findIndex', 'some', 'every',
  'isArray', 'from', 'of', 'assign', 'create', 'defineProperty',
  'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race',
  'preventDefault', 'stopPropagation', 'addEventListener', 'removeEventListener',
  'querySelector', 'querySelectorAll', 'getElementById',
  'createElement', 'appendChild', 'removeChild', 'innerHTML', 'textContent'
]);

function isBuiltin(name) {
  if (BUILTINS.has(name)) return true;
  if (name.includes('.')) {
    const parts = name.split('.');
    const obj = parts[0];
    const method = parts[parts.length - 1];
    if (BUILTINS.has(obj)) return true;
    if (PROTO_METHODS.has(method)) return true;
  }
  return false;
}

class LineByLineAnalyzer {
  constructor() {
    this.jsxParser = acorn.Parser.extend(jsx());
    this.issues = [];
    this.allNodes = [];
    this.allDefinitions = new Map(); // name -> [{file, line, params, returnType}]
    this.allCalls = [];
    this.allImports = [];
    this.allHandlers = [];
    this.allReturns = [];
    this.allVariables = new Map(); // name -> {file, line, type, value}
  }

  async analyzeDirectory(dirPath, options = {}) {
    const extensions = (options.extensions || '.js,.jsx,.ts,.tsx').split(',');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const pattern = `**/*{${extensions.join(',')}}`;
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob(pattern, {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Phase 1: Parse all files
    for (const file of files) {
      try {
        this.parseFile(file);
      } catch (err) {
        this.issues.push({
          file,
          line: 0,
          type: 'PARSE_ERROR',
          severity: 'WARNING',
          message: `Could not parse file: ${err.message}`,
          suggestion: 'Check syntax'
        });
      }
    }

    // Phase 2: Cross-file analysis
    this.analyzeFunctionCalls();
    this.analyzeEventHandlers();
    this.analyzeImports();
    this.analyzeParameters();
    this.analyzeReturnTypes();
    this.analyzeUnusedVariables();
    this.analyzeUndefinedVariables();

    return {
      issues: this.issues,
      stats: {
        filesScanned: files.length,
        totalIssues: this.issues.length,
        errors: this.issues.filter(i => i.severity === 'ERROR').length,
        warnings: this.issues.filter(i => i.severity === 'WARNING').length,
        info: this.issues.filter(i => i.severity === 'INFO').length
      }
    };
  }

  parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);

    if (ext === '.jsx' || ext === '.tsx') {
      try {
        const ast = this.jsxParser.parse(content, {
          ecmaVersion: 2022,
          sourceType: 'module',
          locations: true,
          allowReturnOutsideFunction: true
        });
        this.extractFromAST(ast, filePath, content);
        return;
      } catch (err) {
        // Fallback to regex
      }
    }

    try {
      const ast = acorn.parse(content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true
      });
      this.extractFromAST(ast, filePath, content);
    } catch (err) {
      // Fallback to regex for JSX files
      if (ext === '.jsx' || ext === '.tsx') {
        this.regexParseJSX(filePath, content);
      } else {
        throw err;
      }
    }
  }

  regexParseJSX(filePath, content) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Function calls
      const callMatches = line.match(/(\w+(?:\.\w+)*)\s*\(/g);
      if (callMatches) {
        callMatches.forEach(match => {
          const name = match.replace(/\s*\(/, '').trim();
          if (!isBuiltin(name)) {
            this.allCalls.push({ name, file: filePath, line: lineNum, args: [] });
          }
        });
      }

      // Function definitions
      const defMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:\([^)]*\)|\w+)\s*=>|\()/);
      if (defMatch) {
        const params = this.extractParamsFromLine(line);
        this.allDefinitions.set(defMatch[1], [{
          file: filePath,
          line: lineNum,
          params,
          returnType: null
        }]);
      }

      // Imports
      const importMatch = line.match(/import\s+{?([^}]+)}?\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const names = importMatch[1].split(',').map(n => n.trim());
        names.forEach(name => {
          this.allImports.push({ name, source: importMatch[2], file: filePath, line: lineNum });
        });
      }

      // Event handlers
      const handlerMatch = line.match(/on(Click|Submit|Change|Load|Error)\s*=\s*\{(\w+)\}/);
      if (handlerMatch) {
        this.allHandlers.push({
          event: 'on' + handlerMatch[1],
          name: handlerMatch[2],
          file: filePath,
          line: lineNum
        });
      }

      // Variable declarations
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+)/);
      if (varMatch) {
        this.allVariables.set(varMatch[1], {
          file: filePath,
          line: lineNum,
          type: this.inferType(varMatch[2]),
          value: varMatch[2]
        });
      }
    });
  }

  extractFromAST(ast, filePath, content) {
    const lines = content.split('\n');

    walk.simple(ast, {
      CallExpression: (node) => {
        const name = this.getCallName(node);
        if (name && !isBuiltin(name)) {
          const args = node.arguments.map(a => this.getArgType(a));
          this.allCalls.push({
            name,
            file: filePath,
            line: node.loc.start.line,
            args,
            column: node.loc.start.column
          });
        }
      },

      FunctionDeclaration: (node) => {
        const name = node.id?.name || 'anonymous';
        const params = node.params.map(p => ({
          name: p.name || p.left?.name || 'unknown',
          type: this.inferParamType(p)
        }));
        const returnType = this.inferReturnType(node);

        if (!this.allDefinitions.has(name)) {
          this.allDefinitions.set(name, []);
        }
        this.allDefinitions.get(name).push({
          file: filePath,
          line: node.loc.start.line,
          params,
          returnType,
          node
        });
      },

      VariableDeclarator: (node) => {
        if (node.init?.type === 'ArrowFunctionExpression' ||
            node.init?.type === 'FunctionExpression') {
          const name = node.id?.name || 'anonymous';
          const params = node.init.params.map(p => ({
            name: p.name || p.left?.name || 'unknown',
            type: this.inferParamType(p)
          }));
          const returnType = this.inferReturnType(node.init);

          if (!this.allDefinitions.has(name)) {
            this.allDefinitions.set(name, []);
          }
          this.allDefinitions.get(name).push({
            file: filePath,
            line: node.loc.start.line,
            params,
            returnType,
            node
          });
        } else {
          // Regular variable
          const name = node.id?.name;
          if (name) {
            this.allVariables.set(name, {
              file: filePath,
              line: node.loc.start.line,
              type: this.inferTypeFromNode(node.init),
              value: content.substring(node.init?.start || 0, node.init?.end || 0)
            });
          }
        }
      },

      ImportDeclaration: (node) => {
        const source = node.source?.value || 'unknown';
        node.specifiers.forEach(spec => {
          this.allImports.push({
            name: spec.local?.name || spec.imported?.name || 'unknown',
            source,
            file: filePath,
            line: node.loc.start.line
          });
        });
      },

      JSXAttribute: (node) => {
        const name = node.name?.name || '';
        if (name.startsWith('on') && node.value?.expression) {
          const handlerName = this.getHandlerName(node.value.expression);
          if (handlerName) {
            this.allHandlers.push({
              event: name,
              name: handlerName,
              file: filePath,
              line: node.loc.start.line
            });
          }
        }
      },

      ReturnStatement: (node) => {
        this.allReturns.push({
          file: filePath,
          line: node.loc.start.line,
          value: node.argument
        });
      }
    });
  }

  getCallName(node) {
    if (node.callee?.type === 'Identifier') {
      return node.callee.name;
    }
    if (node.callee?.type === 'MemberExpression') {
      const obj = node.callee.object?.name || '?';
      const method = node.callee.property?.name || '?';
      return `${obj}.${method}`;
    }
    return null;
  }

  getHandlerName(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') return node.property?.name || null;
    return null;
  }

  getArgType(node) {
    if (node.type === 'Literal') return typeof node.value;
    if (node.type === 'Identifier') return 'variable';
    if (node.type === 'CallExpression') return 'function_call';
    if (node.type === 'ArrowFunctionExpression') return 'function';
    if (node.type === 'ObjectExpression') return 'object';
    if (node.type === 'ArrayExpression') return 'array';
    return 'unknown';
  }

  inferParamType(param) {
    if (param.type === 'Identifier') return 'any';
    if (param.type === 'AssignmentPattern') return 'any';
    if (param.type === 'RestElement') return 'array';
    return 'any';
  }

  inferReturnType(node) {
    if (node.body?.type === 'BlockStatement') {
      // Look for return statements
      const returns = [];
      walk.simple(node.body, {
        ReturnStatement: (ret) => {
          if (ret.argument) {
            returns.push(this.inferTypeFromNode(ret.argument));
          }
        }
      });
      return returns.length > 0 ? returns[0] : 'void';
    }
    // Arrow with expression body
    return this.inferTypeFromNode(node.body);
  }

  inferTypeFromNode(node) {
    if (!node) return 'undefined';
    if (node.type === 'Literal') return typeof node.value;
    if (node.type === 'Identifier') return 'variable';
    if (node.type === 'CallExpression') return 'function_call';
    if (node.type === 'MemberExpression') return 'property';
    if (node.type === 'BinaryExpression') return 'binary';
    if (node.type === 'UnaryExpression') return 'unary';
    if (node.type === 'LogicalExpression') return 'logical';
    if (node.type === 'ConditionalExpression') return 'conditional';
    if (node.type === 'ArrowFunctionExpression') return 'function';
    if (node.type === 'ObjectExpression') return 'object';
    if (node.type === 'ArrayExpression') return 'array';
    if (node.type === 'TemplateLiteral') return 'string';
    return 'unknown';
  }

  inferType(valueStr) {
    if (!valueStr) return 'unknown';
    const trimmed = valueStr.trim();
    if (trimmed.startsWith("'") || trimmed.startsWith('"') || trimmed.startsWith('`')) return 'string';
    if (trimmed.startsWith('[')) return 'array';
    if (trimmed.startsWith('{')) return 'object';
    if (trimmed.startsWith('(')) return 'function';
    if (trimmed === 'true' || trimmed === 'false') return 'boolean';
    if (!isNaN(trimmed)) return 'number';
    return 'unknown';
  }

  extractParamsFromLine(line) {
    const paramMatch = line.match(/\(([^)]*)\)/);
    if (!paramMatch) return [];
    return paramMatch[1].split(',').map(p => ({
      name: p.trim().split(':')[0].trim(),
      type: p.includes(':') ? p.split(':')[1].trim() : 'any'
    }));
  }

  // Phase 2: Analysis

  analyzeFunctionCalls() {
    this.allCalls.forEach(call => {
      const defs = this.allDefinitions.get(call.name);
      if (!defs || defs.length === 0) {
        this.issues.push({
          file: call.file,
          line: call.line,
          type: 'UNDEFINED_FUNCTION',
          severity: 'ERROR',
          message: `Function "${call.name}" is called but never defined`,
          suggestion: `Define function "${call.name}" or import it`,
          sender: call.name,
          receiver: null
        });
      }
    });
  }

  analyzeEventHandlers() {
    this.allHandlers.forEach(handler => {
      const defs = this.allDefinitions.get(handler.name);
      if (!defs || defs.length === 0) {
        this.issues.push({
          file: handler.file,
          line: handler.line,
          type: 'MISSING_HANDLER',
          severity: 'ERROR',
          message: `Event handler "${handler.name}" is referenced but not defined`,
          suggestion: `Define handler function "${handler.name}" or import it`,
          sender: `${handler.event}={${handler.name}}`,
          receiver: null
        });
      }
    });
  }

  analyzeImports() {
    this.allImports.forEach(imp => {
      // Check if imported name is used anywhere
      const used = this.allCalls.some(c => c.name === imp.name && c.file === imp.file && c.line !== imp.line) ||
                   this.allHandlers.some(h => h.name === imp.name && h.file === imp.file);

      // Check if it's a type-only import (TypeScript)
      const isTypeImport = imp.source.endsWith('.d.ts') || imp.source.endsWith('/types');

      if (!used && !isTypeImport) {
        this.issues.push({
          file: imp.file,
          line: imp.line,
          type: 'UNUSED_IMPORT',
          severity: 'WARNING',
          message: `Import "${imp.name}" from "${imp.source}" is never used`,
          suggestion: `Remove unused import "${imp.name}"`,
          sender: imp.name,
          receiver: null
        });
      }
    });
  }

  analyzeParameters() {
    this.allCalls.forEach(call => {
      const defs = this.allDefinitions.get(call.name);
      if (!defs || defs.length === 0) return;

      const def = defs[0]; // Use first definition
      const expectedParams = def.params.length;
      const providedArgs = call.args.length;

      if (expectedParams !== providedArgs) {
        this.issues.push({
          file: call.file,
          line: call.line,
          type: 'PARAMETER_MISMATCH',
          severity: 'ERROR',
          message: `Function "${call.name}" expects ${expectedParams} parameters but got ${providedArgs}`,
          suggestion: `Provide ${expectedParams} arguments to "${call.name}"`,
          sender: call.name,
          receiver: `${def.file}:${def.line}`
        });
      }
    });
  }

  analyzeReturnTypes() {
    this.allReturns.forEach(ret => {
      if (ret.value && ret.value.type === 'Identifier') {
        // Check if returned variable exists
        const varDef = this.allVariables.get(ret.value.name);
        if (!varDef) {
          // Check if it's a function call result
          const callDef = this.allCalls.find(c => c.name === ret.value.name);
          if (!callDef) {
            this.issues.push({
              file: ret.file,
              line: ret.line,
              type: 'UNDEFINED_VARIABLE',
              severity: 'ERROR',
              message: `Return variable "${ret.value.name}" is not defined`,
              suggestion: `Define variable "${ret.value.name}" before returning`,
              sender: ret.value.name,
              receiver: null
            });
          }
        }
      }
    });
  }

  analyzeUnusedVariables() {
    this.allVariables.forEach((varDef, name) => {
      // Skip exported variables
      if (name === 'default' || name.startsWith('_')) return;

      // Check if variable is used
      const used = this.allCalls.some(c => c.name === name && c.file === varDef.file && c.line !== varDef.line) ||
                   this.allHandlers.some(h => h.name === name && h.file === varDef.file) ||
                   this.allReturns.some(r => r.value?.name === name && r.file === varDef.file);

      if (!used) {
        this.issues.push({
          file: varDef.file,
          line: varDef.line,
          type: 'UNUSED_VARIABLE',
          severity: 'WARNING',
          message: `Variable "${name}" is declared but never used`,
          suggestion: `Remove unused variable "${name}" or use it`,
          sender: name,
          receiver: null
        });
      }
    });
  }

  analyzeUndefinedVariables() {
    this.allHandlers.forEach(handler => {
      const varDef = this.allVariables.get(handler.name);
      const funcDef = this.allDefinitions.get(handler.name);

      if (!varDef && !funcDef) {
        // Already caught by analyzeEventHandlers
        return;
      }

      // If it's a variable but not a function
      if (varDef && !funcDef) {
        this.issues.push({
          file: handler.file,
          line: handler.line,
          type: 'NOT_A_FUNCTION',
          severity: 'ERROR',
          message: `"${handler.name}" is a variable, not a function - cannot be used as event handler`,
          suggestion: `Define "${handler.name}" as a function`,
          sender: handler.name,
          receiver: `${varDef.file}:${varDef.line}`
        });
      }
    });
  }
}

module.exports = { LineByLineAnalyzer };
