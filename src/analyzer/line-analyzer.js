/**
 * TWOtails Line-by-Line Analyzer
 * Checks every single line for correctness
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const { simple: walkSimple } = require('../utils/ast-walk');

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
  'alert', 'confirm', 'prompt',
  // Node.js / module globals
  'require', 'module', 'exports', 'process', 'Buffer', '__dirname', '__filename',
  'global', 'globalThis', 'arguments',
  // ES/browser globals
  'undefined', 'NaN', 'Infinity', 'structuredClone', 'queueMicrotask', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'getComputedStyle',
  'crypto', 'URL', 'URLSearchParams', 'FormData', 'AbortController', 'AbortSignal',
  'Headers', 'Request', 'Response', 'Blob', 'FileReader', 'Worker', 'Event',
  'CustomEvent', 'EventSource', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError',
  // Test framework globals
  'describe', 'it', 'test', 'expect', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach',
  'jest', 'vi', 'chai', 'assert', 'suite', 'mock', 'spyOn'
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
    this.allVariablesList = [];     // every variable, including name collisions
    this.fileContents = new Map();  // file -> raw content
    this.fileBindings = new Map();  // file -> Set of names bound in that file
    // Two-signal bookkeeping: senders checked against receivers on both ends
    this.signalStats = {
      method: 'bidirectional',
      senders: 0,
      receivers: 0,
      connected: 0,
      broken: 0,
      unusedImports: 0
    };
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

    // Phase 2: Bidirectional cross-file analysis
    //   Sender end: calls, event handlers, imports
    //   Receiver end: function/class/method definitions, exports
    //   A signal only counts as connected when BOTH ends confirm it
    this.analyzeFunctionCalls();
    this.analyzeEventHandlers();
    this.analyzeImports();
    this.analyzeParameters();
    this.analyzeReturnTypes();
    this.analyzeUnusedVariables();
    this.analyzeUndefinedVariables();

    this.signalStats.senders = this.allCalls.length + this.allHandlers.length + this.allImports.length;
    this.signalStats.receivers = [...this.allDefinitions.values()].reduce((sum, defs) => sum + defs.length, 0);

    return {
      issues: this.issues,
      stats: {
        filesScanned: files.length,
        totalIssues: this.issues.length,
        errors: this.issues.filter(i => i.severity === 'ERROR').length,
        warnings: this.issues.filter(i => i.severity === 'WARNING').length,
        info: this.issues.filter(i => i.severity === 'INFO').length,
        signalTracing: { ...this.signalStats }
      }
    };
  }

  parseFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    // Shebang lines are valid in Node scripts but not parseable by acorn
    if (content.startsWith('#!')) {
      content = content.replace(/^#![^\n]*/, '');
    }
    this.fileContents.set(filePath, content);

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

      // Function calls (regex guesses - never trusted for signal reporting)
      const callMatches = line.match(/(\w+(?:\.\w+)*)\s*\(/g);
      if (callMatches) {
        callMatches.forEach(match => {
          const name = match.replace(/\s*\(/, '').trim();
          if (!isBuiltin(name)) {
            this.allCalls.push({ name, file: filePath, line: lineNum, args: [], fromRegex: true });
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
          returnType: null,
          fromRegex: true
        }]);
      }

      // Imports
      const importMatch = line.match(/import\s+{?([^}]+)}?\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const names = importMatch[1].split(',').map(n => n.trim());
        names.forEach(name => {
          this.allImports.push({ name, source: importMatch[2], file: filePath, line: lineNum, fromRegex: true });
        });
      }

      // Event handlers
      const handlerMatch = line.match(/on(Click|Submit|Change|Load|Error)\s*=\s*\{(\w+)\}/);
      if (handlerMatch) {
        this.allHandlers.push({
          event: 'on' + handlerMatch[1],
          name: handlerMatch[2],
          file: filePath,
          line: lineNum,
          fromRegex: true
        });
      }

      // Variable declarations
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+)/);
      if (varMatch) {
        const entry = {
          file: filePath,
          line: lineNum,
          type: this.inferType(varMatch[2]),
          value: varMatch[2],
          fromRegex: true
        };
        this.allVariables.set(varMatch[1], entry);
        this.allVariablesList.push({ name: varMatch[1], ...entry });
      }
    });
  }

  extractFromAST(ast, filePath, content) {
    if (!this.fileContents.has(filePath)) this.fileContents.set(filePath, content);
    this.collectBindings(ast, filePath);

    walkSimple(ast, {
      CallExpression: (node) => {
        const name = this.getCallName(node);
        if (name && !isBuiltin(name) && !name.includes('?.')) {
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
          sig: this.describeParams(node.params),
          returnType,
          node
        });
      },

      ClassDeclaration: (node) => {
        if (node.id?.name) {
          const name = node.id.name;
          if (!this.allDefinitions.has(name)) this.allDefinitions.set(name, []);
          this.allDefinitions.get(name).push({
            file: filePath,
            line: node.loc.start.line,
            params: [],
            sig: { required: 0, total: 0, hasRest: false, hasDefaults: false },
            returnType: 'class',
            kind: 'class',
            node
          });
        }
      },

      MethodDefinition: (node) => {
        const name = node.key?.name || (node.key?.type === 'Literal' ? node.key.value : null);
        if (!name || name === 'constructor') return;
        if (!this.allDefinitions.has(name)) this.allDefinitions.set(name, []);
        this.allDefinitions.get(name).push({
          file: filePath,
          line: node.loc.start.line,
          params: (node.value?.params || []).map(p => ({
            name: p.name || p.left?.name || 'unknown',
            type: this.inferParamType(p)
          })),
          sig: this.describeParams(node.value?.params || []),
          returnType: null,
          kind: 'method',
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
            sig: this.describeParams(node.init.params),
            returnType,
            node
          });
        } else {
          // const x = require('./mod') - binding on the receiver end
          if (node.init?.type === 'CallExpression' &&
              node.init.callee?.type === 'Identifier' &&
              node.init.callee.name === 'require') {
            const source = node.init.arguments[0]?.type === 'Literal'
              ? String(node.init.arguments[0].value)
              : 'unknown';
            const line = node.loc.start.line;
            if (node.id?.type === 'Identifier') {
              this.allImports.push({ name: node.id.name, source, file: filePath, line, isRequire: true });
            } else if (node.id?.type === 'ObjectPattern') {
              node.id.properties.forEach(prop => {
                if (prop.type === 'RestElement') return;
                const local = prop.value?.name || prop.key?.name;
                if (local) {
                  this.allImports.push({ name: local, source, file: filePath, line, isRequire: true });
                }
              });
            }
          }

          // Regular variable (supports destructuring patterns)
          this.bindPattern(node.id, (varName) => {
            const entry = {
              file: filePath,
              line: node.loc.start.line,
              type: this.inferTypeFromNode(node.init),
              value: content.substring(node.init?.start || 0, node.init?.end || 0)
            };
            this.allVariables.set(varName, entry);
            this.allVariablesList.push({ name: varName, ...entry });
          });
        }
      },

      ImportDeclaration: (node) => {
        const source = node.source?.value || 'unknown';
        const isTypeImport = node.importKind === 'type';
        node.specifiers.forEach(spec => {
          this.allImports.push({
            name: spec.local?.name || spec.imported?.name || 'unknown',
            source,
            file: filePath,
            line: node.loc.start.line,
            isTypeImport
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

  // Receiver-end signature: required params, optionals, rest args
  describeParams(params) {
    let required = 0;
    let hasRest = false;
    let hasDefaults = false;
    params.forEach(p => {
      if (p.type === 'RestElement') {
        hasRest = true;
      } else if (p.type === 'AssignmentPattern') {
        hasDefaults = true;
      } else {
        required++;
      }
    });
    return { required, total: params.length, hasRest, hasDefaults };
  }

  // Collect every name bound by a binding pattern (id, destructure, nested)
  bindPattern(pattern, cb) {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier':
        cb(pattern.name);
        break;
      case 'ObjectPattern':
        pattern.properties.forEach(prop => {
          if (prop.type === 'RestElement') {
            this.bindPattern(prop.argument, cb);
          } else {
            this.bindPattern(prop.value || prop.key, cb);
          }
        });
        break;
      case 'ArrayPattern':
        pattern.elements.forEach(el => this.bindPattern(el, cb));
        break;
      case 'AssignmentPattern':
        this.bindPattern(pattern.left, cb);
        break;
      case 'RestElement':
        this.bindPattern(pattern.argument, cb);
        break;
    }
  }

  // Names bound inside each file: params, declarations, imports, classes
  collectBindings(ast, filePath) {
    const bindings = this.fileBindings.get(filePath) || new Set();
    const bind = (name) => { if (name) bindings.add(name); };

    const bindParams = (params) => {
      (params || []).forEach(p => this.bindPattern(p, bind));
    };

    walkSimple(ast, {
      FunctionDeclaration: (node) => {
        bind(node.id?.name);
        bindParams(node.params);
      },
      FunctionExpression: (node) => {
        bind(node.id?.name);
        bindParams(node.params);
      },
      ArrowFunctionExpression: (node) => {
        bindParams(node.params);
      },
      ClassDeclaration: (node) => bind(node.id?.name),
      ClassExpression: (node) => bind(node.id?.name),
      MethodDefinition: (node) => bindParams(node.value?.params),
      Property: (node) => {
        if (node.method && node.value) bindParams(node.value.params);
      },
      VariableDeclarator: (node) => this.bindPattern(node.id, bind),
      ImportDeclaration: (node) => {
        node.specifiers.forEach(spec => bind(spec.local?.name));
      },
      CatchClause: (node) => this.bindPattern(node.param, bind)
    });

    this.fileBindings.set(filePath, bindings);
  }

  isImported(filePath, name) {
    if (!name) return false;
    return this.allImports.some(imp => imp.file === filePath && imp.name === name);
  }

  // True when the identifier appears somewhere in the file other than
  // import/require declaration lines (real usage from the receiver end)
  isUsedOutsideImports(filePath, name, importLine) {
    const content = this.fileContents.get(filePath);
    if (!content) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`);
    const requireBinding = new RegExp(
      `(?:const|let|var)\\s*(?:\\{[^}]*\\b${escaped}\\b[^}]*\\}|${escaped})\\s*=\\s*require\\s*\\(`
    );
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i + 1 === importLine) continue;
      if (/^\s*import\s/.test(lines[i])) continue;
      if (requireBinding.test(lines[i])) continue;
      if (pattern.test(lines[i])) return true;
    }
    return false;
  }

  // True when the identifier is used anywhere in the file apart from
  // being declared on its own line (covers JSX, returns, template use)
  isUsedOutsideLine(filePath, name, declLine) {
    const content = this.fileContents.get(filePath);
    if (!content) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(pattern) || [];
      if (i + 1 === declLine) {
        // more than one occurrence on the declaration line means use
        if (matches.length > 1) return true;
        continue;
      }
      if (matches.length > 0) return true;
    }
    return false;
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
      walkSimple(node.body, {
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

  // Phase 2: Bidirectional analysis
  //   Sender end emits a signal: call, handler reference, import
  //   Receiver end confirms it: definition, import binding, file binding
  //   Both ends must agree before a connection is trusted. A missing
  //   receiver only becomes an issue when the signal is unambiguous
  //   (a bare project call or an unresolved handler reference).

  analyzeFunctionCalls() {
    this.allCalls.forEach(call => {
      if (call.fromRegex) return; // regex guesses are never trusted as senders

      const isDotted = call.name.includes('.');
      const localName = isDotted ? call.name.split('.').pop() : call.name;

      // Receiver end: definition of the function or its method
      const defs = this.allDefinitions.get(isDotted ? localName : call.name);

      // Receiver end: import/require binding in the calling file
      const bound = isDotted
        ? this.isImported(call.file, call.name.split('.')[0])
        : this.isImported(call.file, call.name);

      // Receiver end: name bound locally (parameter, variable, destructure)
      const bindings = this.fileBindings.get(call.file);
      const locallyBound = !isDotted && !!bindings && bindings.has(call.name);

      if ((defs && defs.length > 0) || bound || locallyBound) {
        this.signalStats.connected++;
        return;
      }

      // Dotted calls target objects (req.body, fs.readFile, vm.run):
      // the receiver is a property of an external object, not a project
      // symbol. Reporting these is the #1 source of false positives.
      if (isDotted) return;

      // Receiver end missing for a bare call: a genuine broken signal
      this.signalStats.broken++;
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
    });
  }

  analyzeEventHandlers() {
    this.allHandlers.forEach(handler => {
      const defs = this.allDefinitions.get(handler.name);
      if (defs && defs.length > 0) {
        this.signalStats.connected++;
        return;
      }
      if (this.isImported(handler.file, handler.name)) {
        this.signalStats.connected++;
        return;
      }
      // Receiver end: handler bound in the same file (param, variable)
      const bindings = this.fileBindings.get(handler.file);
      if (bindings && bindings.has(handler.name)) {
        this.signalStats.connected++;
        return;
      }

      this.signalStats.broken++;
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
    });
  }

  analyzeImports() {
    this.allImports.forEach(imp => {
      // Type-only imports vanish at compile time
      if (imp.isTypeImport) return;
      if (imp.source.endsWith('.d.ts') || imp.source.endsWith('/types')) return;

      // React is consumed implicitly by the JSX runtime
      const content = this.fileContents.get(imp.file) || '';
      if (imp.source === 'react' && /<[A-Za-z]/.test(content)) {
        this.signalStats.connected++;
        return;
      }

      // Receiver end: the name is referenced elsewhere in the file
      const used = this.isUsedOutsideImports(imp.file, imp.name, imp.line);
      if (used) {
        this.signalStats.connected++;
        return;
      }

      this.signalStats.unusedImports++;
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
    });
  }

  analyzeParameters() {
    this.allCalls.forEach(call => {
      if (call.fromRegex) return;
      if (call.name.includes('.')) return; // property call - arity of external method unknown

      const defs = this.allDefinitions.get(call.name);
      if (!defs || defs.length === 0) return; // already reported as broken signal
      if (this.isImported(call.file, call.name)) return; // external symbol - arity unknown

      // Receiver end confirms: at least one definition accepts this arity
      const matches = defs.some(def => this.arityMatches(def, call.args.length));
      if (matches) return;

      const def = defs[0];
      const expectedParams = def.sig ? def.sig.total : def.params.length;
      this.issues.push({
        file: call.file,
        line: call.line,
        type: 'PARAMETER_MISMATCH',
        severity: 'ERROR',
        message: `Function "${call.name}" expects ${expectedParams} parameters but got ${call.args.length}`,
        suggestion: `Provide ${expectedParams} arguments to "${call.name}"`,
        sender: call.name,
        receiver: `${def.file}:${def.line}`
      });
    });
  }

  arityMatches(def, provided) {
    if (def.fromRegex || !def.sig) return true; // signature unverified - never report
    const { required, total, hasRest, hasDefaults } = def.sig;
    if (hasRest) return provided >= required;
    if (hasDefaults) return provided >= required && provided <= total;
    return provided === total;
  }

  analyzeReturnTypes() {
    const GLOBALS = new Set([
      'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'document',
      'process', 'console', 'module', 'exports', 'arguments',
      '__dirname', '__filename', 'global', 'this', 'null'
    ]);
    this.allReturns.forEach(ret => {
      if (!ret.value || ret.value.type !== 'Identifier') return;
      const name = ret.value.name;
      if (GLOBALS.has(name)) return;

      // Receiver end: name bound somewhere in this file
      const bindings = this.fileBindings.get(ret.file);
      if (bindings && bindings.has(name)) return;
      if (this.allDefinitions.has(name)) return;
      if (this.isImported(ret.file, name)) return;

      this.issues.push({
        file: ret.file,
        line: ret.line,
        type: 'UNDEFINED_VARIABLE',
        severity: 'ERROR',
        message: `Return variable "${name}" is not defined`,
        suggestion: `Define variable "${name}" before returning`,
        sender: name,
        receiver: null
      });
    });
  }

  analyzeUnusedVariables() {
    const seen = new Set();
    this.allVariablesList.forEach(varDef => {
      const name = varDef.name;
      if (name === 'default' || name.startsWith('_')) return;
      const key = `${varDef.file}:${varDef.line}:${name}`;
      if (seen.has(key)) return;
      seen.add(key);

      const content = this.fileContents.get(varDef.file) || '';
      // Exported names are part of the module's API
      if (new RegExp(`\\bexport\\b[^\\n]*\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(content)) return;

      if (this.isUsedOutsideLine(varDef.file, name, varDef.line)) return;

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

      // Only same-file variables can make a handler reference wrong;
      // names from other files are either imported or unrelated
      const sameFileVar = varDef && varDef.file === handler.file ? varDef : null;

      // If it's a variable but not a function
      if (sameFileVar && !funcDef) {
        this.issues.push({
          file: handler.file,
          line: handler.line,
          type: 'NOT_A_FUNCTION',
          severity: 'ERROR',
          message: `"${handler.name}" is a variable, not a function - cannot be used as event handler`,
          suggestion: `Define "${handler.name}" as a function`,
          sender: handler.name,
          receiver: `${sameFileVar.file}:${sameFileVar.line}`
        });
      }
    });
  }
}

module.exports = { LineByLineAnalyzer };
