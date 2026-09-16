/**
 * TWOtails Signal Matcher
 * Matches signals from sender and receiver to verify connections
 */

const { SignalSender } = require('./signal-sender');
const { SignalReceiver } = require('./signal-receiver');

class SignalMatcher {
  constructor() {
    this.sender = new SignalSender();
    this.receiver = new SignalReceiver();
    this.connections = [];
  }

  async trace(file, options = {}) {
    const fs = require('fs');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    // Send signals from sender endpoints
    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Detect function calls
      const callMatch = line.match(/(\w+)\s*\(/g);
      if (callMatch) {
        callMatch.forEach(match => {
          const funcName = match.replace(/\s*\(/, '');
          this.sender.sendFromFunctionCall({
            name: funcName,
            file: file,
            line: lineNum
          });
        });
      }

      // Detect event emissions
      const emitMatch = line.match(/emit\s*\(\s*['"](\w+)['"]/);
      if (emitMatch) {
        this.sender.sendFromEventEmit({
          name: emitMatch[1],
          file: file,
          line: lineNum
        });
      }

      // Detect API calls
      const apiMatch = line.match(/(?:fetch|axios|get|post|put|delete)\s*\(\s*['"`]([^'"`]+)/);
      if (apiMatch) {
        this.sender.sendFromAPICall({
          endpoint: apiMatch[1],
          file: file,
          line: lineNum
        });
      }
    });

    // Send signals from receiver endpoints
    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Detect function definitions
      const defMatch = line.match(/(?:function|const|let|var|def|async)\s+(\w+)/);
      if (defMatch) {
        this.receiver.sendFromFunctionDefinition({
          name: defMatch[1],
          file: file,
          line: lineNum
        });
      }

      // Detect event listeners
      const listenerMatch = line.match(/on\s*\(\s*['"](\w+)['"]/);
      if (listenerMatch) {
        this.receiver.sendFromEventListener({
          name: listenerMatch[1],
          file: file,
          line: lineNum
        });
      }
    });

    // Match signals
    return this.matchSignals();
  }

  matchSignals() {
    const results = [];
    const senderSignals = this.sender.getSignals();
    const receiverSignals = this.receiver.getSignals();

    senderSignals.forEach(senderSignal => {
      const matchingReceiver = receiverSignals.find(receiverSignal => {
        return this.signalsMatch(senderSignal, receiverSignal);
      });

      if (matchingReceiver) {
        results.push({
          status: 'CONNECTED',
          sender: senderSignal,
          receiver: matchingReceiver,
          collisionPoint: {
            file: matchingReceiver.source.file,
            line: matchingReceiver.source.line
          }
        });
      } else {
        results.push({
          status: 'BROKEN',
          sender: senderSignal,
          receiver: null,
          reason: 'No matching receiver found'
        });
      }
    });

    return results;
  }

  signalsMatch(sender, receiver) {
    // Match by name
    const senderName = sender.source.name || sender.payload.functionName || sender.payload.eventName;
    const receiverName = receiver.source.name || receiver.payload.functionName || receiver.payload.eventName;

    return senderName === receiverName;
  }

  getSummary(results) {
    const connected = results.filter(r => r.status === 'CONNECTED').length;
    const broken = results.filter(r => r.status === 'BROKEN').length;

    return {
      total: results.length,
      connected,
      broken,
      percentage: results.length > 0 ? Math.round((connected / results.length) * 100) : 0
    };
  }

  formatResults(results) {
    const output = [];
    output.push('\nTWOtails Signal Trace Results\n');
    output.push('═'.repeat(60) + '\n');

    results.forEach((result, index) => {
      if (result.status === 'CONNECTED') {
        output.push(`✓ ${result.sender.source.name || result.sender.type}`);
        output.push(`  Sender:   ${result.sender.source.file}:${result.sender.source.line}`);
        output.push(`  Receiver: ${result.receiver.source.file}:${result.receiver.source.line}`);
        output.push(`  Status:   COLLISION DETECTED → Connected\n`);
      } else {
        output.push(`✗ ${result.sender.source.name || result.sender.type}`);
        output.push(`  Sender:   ${result.sender.source.file}:${result.sender.source.line}`);
        output.push(`  Receiver: NOT FOUND`);
        output.push(`  Status:   NO COLLISION → Broken\n`);
      }
    });

    const summary = this.getSummary(results);
    output.push('─'.repeat(60));
    output.push(`Summary: ${summary.connected}/${summary.total} connected (${summary.percentage}%)`);

    return output.join('\n');
  }

  clear() {
    this.sender.clearSignals();
    this.receiver.clearSignals();
    this.connections = [];
  }
}

module.exports = { SignalMatcher };
