/**
 * TWOtails AST Parser
 * Parses code into dependency graphs using Tree-sitter
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

class ASTParser {
  constructor(options = {}) {
    this.extensions = (options.extensions || '.js,.jsx,.ts,.tsx,.py').split(',');
    this.ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
  }

  async parseFile(filePath) {
    const ext = path.extname(filePath);

    // For now, use regex-based parsing as fallback
    // Tree-sitter integration would go here
    const content = fs.readFileSync(filePath, 'utf8');
    return this.regexParse(filePath, content);
  }

  regexParse(filePath, content) {
    const lines = content.split('\n');
    const nodes = [];
    const connections = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Detect function calls
      const callMatch = line.match(/(\w+)\s*\(/g);
      if (callMatch) {
        callMatch.forEach(match => {
          const funcName = match.replace(/\s*\(/, '');
          nodes.push({
            type: 'function_call',
            name: funcName,
            file: filePath,
            line: lineNum,
            raw: line.trim()
          });
        });
      }

      // Detect function definitions
      const defMatch = line.match(/(?:function|const|let|var|def|async)\s+(\w+)/);
      if (defMatch) {
        nodes.push({
          type: 'function_definition',
          name: defMatch[1],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect imports
      const importMatch = line.match(/(?:import|from|require)\s+[{(]?([^;}\n]+)/);
      if (importMatch) {
        nodes.push({
          type: 'import',
          name: importMatch[1].trim(),
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect event emissions
      const emitMatch = line.match(/emit\s*\(\s*['"](\w+)['"]/);
      if (emitMatch) {
        nodes.push({
          type: 'event_emit',
          name: emitMatch[1],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect event listeners
      const listenerMatch = line.match(/on\s*\(\s*['"](\w+)['"]/);
      if (listenerMatch) {
        nodes.push({
          type: 'event_listener',
          name: listenerMatch[1],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect API calls (fetch, axios, etc.)
      const apiMatch = line.match(/(?:fetch|axios|get|post|put|delete)\s*\(\s*['"`]([^'"`]+)/);
      if (apiMatch) {
        nodes.push({
          type: 'api_call',
          name: apiMatch[1],
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }

      // Detect JSX event handlers
      const handlerMatch = line.match(/on(Click|Submit|Change|Load|Error)\s*=\s*\{(\w+)\}/);
      if (handlerMatch) {
        nodes.push({
          type: 'event_handler',
          name: handlerMatch[2],
          event: handlerMatch[1].toLowerCase(),
          file: filePath,
          line: lineNum,
          raw: line.trim()
        });
      }
    });

    return { nodes, connections };
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
    for (const file of files) {
      try {
        const { nodes } = await this.parseFile(file);
        allNodes.push(...nodes);
      } catch (err) {
        console.error(`Error parsing ${file}:`, err.message);
      }
    }

    return allNodes;
  }
}

async function scan(directory, options = {}) {
  const parser = new ASTParser(options);
  const nodes = await parser.parseDirectory(directory);

  // Build connections from nodes
  const connections = buildConnections(nodes);

  return connections.map(conn => ({
    type: conn.type,
    sender: `${conn.senderFile}:${conn.senderLine}`,
    receiver: conn.receiver ? `${conn.receiverFile}:${conn.receiverLine}` : 'NOT FOUND',
    status: conn.receiver ? '✓ CONNECTED' : '✗ BROKEN',
    action: conn.receiver ? '—' : `Define ${conn.senderName}`
  }));
}

function buildConnections(nodes) {
  const connections = [];
  const definitions = nodes.filter(n => n.type === 'function_definition');
  const calls = nodes.filter(n => n.type === 'function_call');
  const imports = nodes.filter(n => n.type === 'import');
  const emits = nodes.filter(n => n.type === 'event_emit');
  const listeners = nodes.filter(n => n.type === 'event_listener');
  const handlers = nodes.filter(n => n.type === 'event_handler');

  // Match function calls to definitions
  calls.forEach(call => {
    const def = definitions.find(d => d.name === call.name);
    connections.push({
      type: 'function_call',
      senderName: call.name,
      senderFile: call.file,
      senderLine: call.line,
      receiver: def,
      receiverFile: def?.file,
      receiverLine: def?.line
    });
  });

  // Match imports to usages
  imports.forEach(imp => {
    const usage = nodes.find(n => n.name === imp.name && n.file === imp.file && n.line !== imp.line);
    connections.push({
      type: 'import',
      senderName: imp.name,
      senderFile: imp.file,
      senderLine: imp.line,
      receiver: usage,
      receiverFile: usage?.file,
      receiverLine: usage?.line
    });
  });

  // Match event emits to listeners
  emits.forEach(emit => {
    const listener = listeners.find(l => l.name === emit.name);
    connections.push({
      type: 'event',
      senderName: emit.name,
      senderFile: emit.file,
      senderLine: emit.line,
      receiver: listener,
      receiverFile: listener?.file,
      receiverLine: listener?.line
    });
  });

  // Match handlers to function definitions
  handlers.forEach(handler => {
    const def = definitions.find(d => d.name === handler.name);
    connections.push({
      type: 'event_handler',
      senderName: handler.name,
      senderFile: handler.file,
      senderLine: handler.line,
      receiver: def,
      receiverFile: def?.file,
      receiverLine: def?.line
    });
  });

  return connections;
}

module.exports = { ASTParser, scan, buildConnections };
