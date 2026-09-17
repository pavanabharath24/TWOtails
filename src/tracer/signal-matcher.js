/**
 * TWOtails Signal Matcher
 * Bidirectional signal tracing - sends signals from both ends
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const walk = require('acorn-walk');

// Built-in methods to ignore
const BUILTINS = new Set([
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof', 'instanceof',
  'console', 'log', 'error', 'warn', 'info', 'debug',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'Promise', 'Map', 'Set', 'document', 'window', 'navigator', 'location',
  'fetch', 'alert', 'confirm', 'prompt'
]);

const PROTO_METHODS = new Set([
  'charAt', 'charCodeAt', 'concat', 'includes', 'indexOf', 'lastIndexOf',
  'match', 'replace', 'search', 'slice', 'split', 'startsWith', 'endsWith',
  'substring', 'toLowerCase', 'toUpperCase', 'trim', 'toString',
  'keys', 'values', 'entries', 'has', 'get', 'set', 'delete',
  'push', 'pop', 'shift', 'unshift', 'splice', 'map', 'filter',
  'reduce', 'forEach', 'find', 'some', 'every',
  'then', 'catch', 'finally', 'resolve', 'reject',
  'preventDefault', 'stopPropagation', 'addEventListener',
  'querySelector', 'querySelectorAll', 'getElementById'
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

class SignalMatcher {
  constructor() {
    this.parser = acorn.Parser.extend(jsx());
  }

  async trace(filePath, options = {}) {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);

    // Parse the target file
    const targetNodes = this.parseFile(fullPath);

    // Parse all files in the directory for cross-reference
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: dir,
      ignore: ignorePatterns,
      absolute: true
    });

    const allNodes = [];
    for (const file of files) {
      try {
        allNodes.push(...this.parseFile(file));
      } catch (err) {
        // Skip unparseable files
      }
    }

    // Build trace results
    const results = [];

    // For each sender signal in target file, find receiver anywhere
    targetNodes.forEach(sender => {
      if (sender.type === 'function_call') {
        const receiver = this.findReceiver(sender, allNodes, fullPath);
        results.push(this.buildTraceResult('function_call', sender, receiver, fullPath));
      }

      if (sender.type === 'event_handler') {
        const receiver = this.findHandlerReceiver(sender, allNodes, fullPath);
        results.push(this.buildTraceResult('event_handler', sender, receiver, fullPath));
      }

      if (sender.type === 'import') {
        const receiver = this.findImportReceiver(sender, allNodes, fullPath);
        results.push(this.buildTraceResult('import', sender, receiver, fullPath));
      }
    });

    // Also find senders that target file receives
    targetNodes.forEach(receiver => {
      if (receiver.type === 'function_definition') {
        const sender = this.findSenderForDefinition(receiver, allNodes, fullPath);
        if (sender && !results.find(r => r.senderFile === sender.file && r.senderLine === sender.line)) {
          results.push(this.buildTraceResult('function_call', sender, receiver, fullPath));
        }
      }
    });

    // Deduplicate
    const unique = this.deduplicateResults(results);

    return {
      results: unique,
      stats: {
        total: unique.length,
        connected: unique.filter(r => r.status === 'CONNECTED').length,
        broken: unique.filter(r => r.status === 'BROKEN').length,
        file: fullPath
      }
    };
  }

  parseFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const nodes = [];

    try {
      const ast = this.parser.parse(content, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true
      });

      walk.simple(ast, {
        CallExpression: (node) => {
          const name = this.getCallName(node);
          if (name && !isBuiltin(name)) {
            nodes.push({
              type: 'function_call',
              name,
              file: filePath,
              line: node.loc.start.line,
              args: node.arguments.length
            });
          }
        },

        FunctionDeclaration: (node) => {
          const name = node.id?.name || 'anonymous';
          if (!isBuiltin(name)) {
            nodes.push({
              type: 'function_definition',
              name,
              file: filePath,
              line: node.loc.start.line,
              params: node.params.length
            });
          }
        },

        VariableDeclarator: (node) => {
          if (node.init?.type === 'ArrowFunctionExpression' ||
              node.init?.type === 'FunctionExpression') {
            const name = node.id?.name || 'anonymous';
            if (!isBuiltin(name)) {
              nodes.push({
                type: 'function_definition',
                name,
                file: filePath,
                line: node.loc.start.line,
                params: node.init.params.length
              });
            }
          }
        },

        ImportDeclaration: (node) => {
          const source = node.source?.value || 'unknown';
          node.specifiers.forEach(spec => {
            nodes.push({
              type: 'import',
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
              nodes.push({
                type: 'event_handler',
                event: name,
                name: handlerName,
                file: filePath,
                line: node.loc.start.line
              });
            }
          }
        }
      });
    } catch (err) {
      // Fallback to regex
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const lineNum = idx + 1;

        // Function calls
        const callMatch = line.match(/(\w+(?:\.\w+)*)\s*\(/g);
        if (callMatch) {
          callMatch.forEach(match => {
            const name = match.replace(/\s*\(/, '').trim();
            if (!isBuiltin(name)) {
              nodes.push({ type: 'function_call', name, file: filePath, line: lineNum, args: 0 });
            }
          });
        }

        // Function definitions
        const defMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:\([^)]*\)|\w+)\s*=>|\()/);
        if (defMatch) {
          nodes.push({ type: 'function_definition', name: defMatch[1], file: filePath, line: lineNum, params: 0 });
        }

        // Imports
        const importMatch = line.match(/import\s+{?([^}]+)}?\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch) {
          const names = importMatch[1].split(',').map(n => n.trim());
          names.forEach(name => {
            nodes.push({ type: 'import', name, source: importMatch[2], file: filePath, line: lineNum });
          });
        }

        // Event handlers
        const handlerMatch = line.match(/on(Click|Submit|Change|Load|Error)\s*=\s*\{(\w+)\}/);
        if (handlerMatch) {
          nodes.push({
            type: 'event_handler',
            event: 'on' + handlerMatch[1],
            name: handlerMatch[2],
            file: filePath,
            line: lineNum
          });
        }
      });
    }

    return nodes;
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

  findReceiver(sender, allNodes, targetFile) {
    const simpleName = sender.name.includes('.') ? sender.name.split('.').pop() : sender.name;

    // First look in target file
    const sameFileDef = allNodes.find(n =>
      n.type === 'function_definition' &&
      (n.name === simpleName || n.name === sender.name) &&
      n.file === targetFile
    );
    if (sameFileDef) return sameFileDef;

    // Then look in all files
    return allNodes.find(n =>
      n.type === 'function_definition' &&
      (n.name === simpleName || n.name === sender.name) &&
      n.file !== targetFile
    );
  }

  findHandlerReceiver(handler, allNodes, targetFile) {
    return allNodes.find(n =>
      n.type === 'function_definition' &&
      n.name === handler.name
    );
  }

  findImportReceiver(importNode, allNodes, targetFile) {
    return allNodes.find(n =>
      n.name === importNode.name &&
      n.file === targetFile &&
      n.line !== importNode.line &&
      n.type !== 'import'
    );
  }

  findSenderForDefinition(def, allNodes, targetFile) {
    return allNodes.find(n =>
      n.type === 'function_call' &&
      (n.name === def.name || n.name.endsWith('.' + def.name)) &&
      n.file !== targetFile
    );
  }

  buildTraceResult(type, sender, receiver, targetFile) {
    const isTargetSender = sender.file === targetFile;
    const isTargetReceiver = receiver?.file === targetFile;

    let direction;
    if (isTargetSender && !isTargetReceiver) {
      direction = 'OUTGOING';
    } else if (!isTargetSender && isTargetReceiver) {
      direction = 'INCOMING';
    } else {
      direction = 'INTERNAL';
    }

    return {
      type,
      direction,
      senderName: sender.name,
      senderFile: sender.file,
      senderLine: sender.line,
      receiverName: receiver?.name || null,
      receiverFile: receiver?.file || null,
      receiverLine: receiver?.line || null,
      status: receiver ? 'CONNECTED' : 'BROKEN',
      suggestion: receiver ? null : `No definition found for "${sender.name}"`
    };
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(r => {
      const key = `${r.type}:${r.senderFile}:${r.senderLine}:${r.receiverFile}:${r.receiverLine}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  formatResults(results, stats) {
    const output = [];
    output.push('\nTWOtails Signal Trace Results');
    output.push('═'.repeat(60));
    output.push(`File: ${stats.file}\n`);

    const connected = results.filter(r => r.status === 'CONNECTED');
    const broken = results.filter(r => r.status === 'BROKEN');

    if (connected.length > 0) {
      output.push('Connected Signals:');
      output.push('─'.repeat(60));
      connected.forEach((r, i) => {
        output.push(`  ${i + 1}. ${r.senderName}`);
        output.push(`     From: ${r.senderFile}:${r.senderLine}`);
        output.push(`     To:   ${r.receiverFile}:${r.receiverLine}`);
        output.push(`     Direction: ${r.direction}`);
        output.push('');
      });
    }

    if (broken.length > 0) {
      output.push('Broken Signals:');
      output.push('─'.repeat(60));
      broken.forEach((r, i) => {
        output.push(`  ${i + 1}. ${r.senderName}`);
        output.push(`     From: ${r.senderFile}:${r.senderLine}`);
        output.push(`     To:   NOT FOUND`);
        output.push(`     Suggestion: ${r.suggestion}`);
        output.push('');
      });
    }

    output.push('─'.repeat(60));
    output.push(`Summary: ${connected.length}/${results.length} connected`);

    return output.join('\n');
  }
}

async function trace(filePath, options = {}) {
  const matcher = new SignalMatcher();
  const result = await matcher.trace(filePath, options);

  const reportResults = result.results.map(r => ({
    type: r.type,
    sender: `${r.senderFile}:${r.senderLine}`,
    senderDetail: r.senderName,
    receiver: r.receiverFile
      ? `${r.receiverFile}:${r.receiverLine}`
      : 'NOT FOUND',
    receiverDetail: r.receiverName || '',
    status: r.status === 'CONNECTED' ? '✓ CONNECTED' : '✗ BROKEN',
    suggestion: r.suggestion || '—'
  }));

  return {
    results: reportResults,
    stats: result.stats
  };
}

module.exports = { SignalMatcher, trace };
