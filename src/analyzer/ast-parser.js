/**
 * TWOtails AST Parser
 * Real AST parsing using Acorn for JavaScript/JSX
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const walk = require('acorn-walk');

class ASTParser {
  constructor(options = {}) {
    this.extensions = (options.extensions || '.js,.jsx,.ts,.tsx').split(',');
    this.ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    this.jsxParser = acorn.Parser.extend(jsx());
  }

  parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);

    // Try JSX parser first for .jsx/.tsx files
    if (ext === '.jsx' || ext === '.tsx') {
      try {
        const ast = this.jsxParser.parse(content, {
          ecmaVersion: 2022,
          sourceType: 'module',
          locations: true,
          allowReturnOutsideFunction: true
        });
        return this.extractNodes(ast, filePath, content);
      } catch (err) {
        // Fallback to regex parsing for JSX
        return this.regexParseJSX(filePath, content);
      }
    }

    // Try regular acorn for .js/.ts files
    try {
      const ast = acorn.parse(content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true
      });
      return this.extractNodes(ast, filePath, content);
    } catch (err) {
      console.error(`Error parsing ${filePath}:`, err.message);
      return { nodes: [], error: err.message };
    }
  }

  regexParseJSX(filePath, content) {
    const lines = content.split('\n');
    const nodes = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Detect function calls: foo(), obj.method()
      const callMatches = line.match(/(\w+(?:\.\w+)*)\s*\(/g);
      if (callMatches) {
        callMatches.forEach(match => {
          const name = match.replace(/\s*\(/, '').trim();
          if (name && !BUILTINS.has(name) && !PROTO_METHODS.has(name.split('.').pop())) {
            nodes.push({
              type: 'function_call',
              name: name,
              file: filePath,
              line: lineNum,
              raw: line.trim()
            });
          }
        });
      }

      // Detect function definitions: function foo(), const foo = () => {}
      const defMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:\([^)]*\)|\w+)\s*=>|\()/);
      if (defMatch) {
        nodes.push({
          type: 'function_definition',
          name: defMatch[1],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect imports: import { x } from 'y'
      const importMatch = line.match(/import\s+{?([^}]+)}?\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const names = importMatch[1].split(',').map(n => n.trim());
        names.forEach(name => {
          nodes.push({
            type: 'import',
            name: name,
            source: importMatch[2],
            file: filePath,
            line: lineNum,
            raw: line.trim()
          });
        });
      }

      // Detect JSX event handlers: onClick={handler}
      const handlerMatch = line.match(/on(Click|Submit|Change|Load|Error)\s*=\s*\{(\w+)\}/);
      if (handlerMatch) {
        nodes.push({
          type: 'event_handler',
          event: 'on' + handlerMatch[1],
          name: handlerMatch[2],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }
    });

    return { nodes };
  }

  extractNodes(ast, filePath, content) {
    const nodes = [];
    const lines = content.split('\n');

    walk.simple(ast, {
      CallExpression: (node) => {
        const name = this.getCallName(node);
        if (name) {
          nodes.push({
            type: 'function_call',
            name: name,
            file: filePath,
            line: node.loc.start.line,
            raw: lines[node.loc.start.line - 1]?.trim() || ''
          });
        }
      },

      FunctionDeclaration: (node) => {
        nodes.push({
          type: 'function_definition',
          name: node.id?.name || 'anonymous',
          file: filePath,
          line: node.loc.start.line,
          params: node.params.map(p => p.name || 'unknown'),
          raw: lines[node.loc.start.line - 1]?.trim() || ''
        });
      },

      VariableDeclarator: (node) => {
        if (node.init?.type === 'ArrowFunctionExpression' ||
            node.init?.type === 'FunctionExpression') {
          nodes.push({
            type: 'function_definition',
            name: node.id?.name || 'anonymous',
            file: filePath,
            line: node.loc.start.line,
            params: node.init.params.map(p => p.name || 'unknown'),
            raw: lines[node.loc.start.line - 1]?.trim() || ''
          });
        }
      },

      ImportDeclaration: (node) => {
        const source = node.source?.value || 'unknown';
        node.specifiers.forEach(spec => {
          nodes.push({
            type: 'import',
            name: spec.local?.name || spec.imported?.name || 'unknown',
            source: source,
            file: filePath,
            line: node.loc.start.line,
            raw: lines[node.loc.start.line - 1]?.trim() || ''
          });
        });
      },

      JSXAttribute: (node) => {
        const name = node.name?.name || '';
        if (name.startsWith('on') && node.value?.expression) {
          const handlerName = this.getHandlerName(node.value.expression);
          if (handlerName) {
            nodes.push({
              type: 'event_handler',
              event: name,
              name: handlerName,
              file: filePath,
              line: node.loc.start.line,
              raw: lines[node.loc.start.line - 1]?.trim() || ''
            });
          }
        }
      }
    });

    return { nodes };
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
    if (node.type === 'Identifier') {
      return node.name;
    }
    if (node.type === 'MemberExpression') {
      return node.property?.name || null;
    }
    return null;
  }

  async parseDirectory(dirPath) {
    const pattern = `**/*{${this.extensions.join(',')}}`;
    const ignorePatterns = this.ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob(pattern, {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    const allNodes = [];
    const fileErrors = [];

    for (const file of files) {
      try {
        const { nodes, error } = this.parseFile(file);
        allNodes.push(...nodes);
        if (error) {
          fileErrors.push({ file, error });
        }
      } catch (err) {
        fileErrors.push({ file, error: err.message });
      }
    }

    return { nodes: allNodes, fileErrors, filesScanned: files.length };
  }
}

async function scan(directory, options = {}) {
  const parser = new ASTParser(options);
  const { nodes, fileErrors, filesScanned } = await parser.parseDirectory(directory);

  const connections = buildConnections(nodes);

  const results = connections.map(conn => ({
    type: conn.type,
    sender: `${conn.senderFile}:${conn.senderLine}`,
    senderDetail: conn.senderName,
    receiver: conn.receiverFile
      ? `${conn.receiverFile}:${conn.receiverLine}`
      : 'NOT FOUND',
    receiverDetail: conn.receiverName || '',
    status: conn.receiverFile ? '✓ CONNECTED' : '✗ BROKEN',
    suggestion: conn.receiverFile ? '—' : conn.suggestion
  }));

  fileErrors.forEach(err => {
    results.push({
      type: 'PARSE_ERROR',
      sender: err.file,
      senderDetail: '—',
      receiver: '—',
      receiverDetail: '—',
      status: '⚠ WARNING',
      suggestion: `Could not parse: ${err.error}`
    });
  });

  return {
    results,
    stats: {
      filesScanned,
      totalConnections: connections.length,
      connected: connections.filter(c => c.receiverFile).length,
      broken: connections.filter(c => !c.receiverFile).length,
      parseErrors: fileErrors.length
    }
  };
}

// Built-in methods and keywords to ignore
const BUILTINS = new Set([
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof',
  'void', 'yield', 'await', 'async', 'function', 'class', 'extends', 'super',
  'import', 'export', 'default', 'from', 'const', 'let', 'var', 'this',
  'console', 'log', 'error', 'warn', 'info', 'debug', 'trace', 'table', 'time', 'timeEnd', 'count', 'clear', 'group', 'groupEnd', 'assert', 'dir', 'dirxml',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect'
]);

// String/Object prototype methods
const PROTO_METHODS = new Set([
  'charAt', 'charCodeAt', 'concat', 'includes', 'indexOf', 'lastIndexOf',
  'localeCompare', 'match', 'repeat', 'replace', 'search', 'slice', 'split',
  'startsWith', 'endsWith', 'substring', 'toLowerCase', 'toUpperCase',
  'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd', 'repeat',
  'toString', 'valueOf', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
  'toFixed', 'toExponential', 'toPrecision',
  'keys', 'values', 'entries', 'has', 'get', 'set', 'delete', 'clear',
  'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'map', 'filter',
  'reduce', 'reduceRight', 'forEach', 'find', 'findIndex', 'some', 'every',
  'isArray', 'from', 'of', 'assign', 'create', 'defineProperty', 'getOwnPropertyDescriptor',
  'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race', 'allSettled',
  'preventDefault', 'stopPropagation', 'stopImmediatePropagation', 'prevent',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
  'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName',
  'createElement', 'createTextNode', 'createDocumentFragment'
]);

function isBuiltin(name) {
  if (BUILTINS.has(name)) return true;
  // Check for method calls like str.charAt or console.log
  if (name.includes('.')) {
    const parts = name.split('.');
    const obj = parts[0];
    const method = parts[parts.length - 1];
    if (BUILTINS.has(obj)) return true;
    if (PROTO_METHODS.has(method)) return true;
  }
  return false;
}

function buildConnections(nodes) {
  const connections = [];
  const definitions = nodes.filter(n => n.type === 'function_definition');
  const calls = nodes.filter(n => n.type === 'function_call');
  const imports = nodes.filter(n => n.type === 'import');
  const handlers = nodes.filter(n => n.type === 'event_handler');

  calls.filter(call => !isBuiltin(call.name)).forEach(call => {
    const simpleName = call.name.includes('.') ? call.name.split('.').pop() : call.name;
    const def = definitions.find(d => d.name === simpleName || d.name === call.name);

    connections.push({
      type: 'function_call',
      senderName: call.name,
      senderFile: call.file,
      senderLine: call.line,
      receiverName: def?.name,
      receiverFile: def?.file,
      receiverLine: def?.line,
      suggestion: `Define function "${call.name}" or check import`
    });
  });

  handlers.forEach(handler => {
    const def = definitions.find(d => d.name === handler.name);
    connections.push({
      type: 'event_handler',
      senderName: `${handler.event}={${handler.name}}`,
      senderFile: handler.file,
      senderLine: handler.line,
      receiverName: def?.name,
      receiverFile: def?.file,
      receiverLine: def?.line,
      suggestion: `Define handler function "${handler.name}" or import it`
    });
  });

  imports.forEach(imp => {
    const used = nodes.find(n =>
      n.name === imp.name &&
      n.file === imp.file &&
      n.line !== imp.line &&
      n.type !== 'import'
    );
    if (!used) {
      connections.push({
        type: 'unused_import',
        senderName: imp.name,
        senderFile: imp.file,
        senderLine: imp.line,
        receiverName: null,
        receiverFile: null,
        receiverLine: null,
        suggestion: `Remove unused import "${imp.name}"`
      });
    }
  });

  return connections;
}

module.exports = { ASTParser, scan, buildConnections };
