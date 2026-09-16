/**
 * TWOtails Signal Matcher
 * Bidirectional signal tracing - sends signals from both ends
 */

const fs = require('fs');
const path = require('path');
const { ASTParser } = require('../analyzer/ast-parser');

class SignalMatcher {
  constructor() {
    this.parser = new ASTParser();
  }

  async trace(filePath, options = {}) {
    const fullPath = path.resolve(filePath);
    const dir = path.dirname(fullPath);

    // Parse the target file
    const { nodes: targetNodes } = this.parser.parseFile(fullPath);

    // Parse all files in the directory for cross-reference
    const { nodes: allNodes } = await this.parser.parseDirectory(dir);

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

      if (sender.type === 'event_emit') {
        const receiver = this.findEmitReceiver(sender, allNodes, fullPath);
        results.push(this.buildTraceResult('event_emit', sender, receiver, fullPath));
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
    // Look for function definition with same name
    const def = allNodes.find(n =>
      n.type === 'function_definition' &&
      n.name === handler.name
    );
    return def;
  }

  findImportReceiver(importNode, allNodes, targetFile) {
    // Check if imported name is used anywhere
    const usage = allNodes.find(n =>
      n.name === importNode.name &&
      n.file === targetFile &&
      n.line !== importNode.line &&
      n.type !== 'import'
    );
    return usage;
  }

  findEmitReceiver(emit, allNodes, targetFile) {
    // For emit, we check if there's a corresponding listener
    // This is simplified - in reality you'd need to match event names
    return null;
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

    // Determine if this is an incoming or outgoing connection
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

  // Format as report-compatible output
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
