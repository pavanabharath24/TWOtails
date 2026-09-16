/**
 * TWOtails Table Generator
 * Generates formatted tables for connection reports
 */

const Table = require('cli-table3');
const chalk = require('chalk');

class TableGenerator {
  constructor(options = {}) {
    this.colorize = options.colorize !== false;
    this.style = options.style || 'full';
  }

  generateConnectionReport(results) {
    const table = new Table({
      head: ['#', 'Type', 'Sender', 'Receiver', 'Status', 'Action'].map(h =>
        this.colorize ? chalk.bold.cyan(h) : h
      ),
      colWidths: [5, 15, 30, 30, 12, 30],
      style: {
        head: ['cyan'],
        border: ['grey']
      }
    });

    results.forEach((result, index) => {
      const status = result.status === '✓ CONNECTED'
        ? (this.colorize ? chalk.green(result.status) : result.status)
        : (this.colorize ? chalk.red(result.status) : result.status);

      table.push([
        index + 1,
        result.type,
        result.sender,
        result.receiver,
        status,
        result.action
      ]);
    });

    return table.toString();
  }

  generateSignalTrace(results) {
    const table = new Table({
      head: ['Signal', 'Type', 'Source', 'Target', 'Status'].map(h =>
        this.colorize ? chalk.bold.cyan(h) : h
      ),
      colWidths: [20, 15, 35, 35, 12],
      style: {
        head: ['cyan'],
        border: ['grey']
      }
    });

    results.forEach((result, index) => {
      const status = result.status === 'CONNECTED'
        ? (this.colorize ? chalk.green('✓ COLLISION') : 'CONNECTED')
        : (this.colorize ? chalk.red('✗ NO COLLISION') : 'BROKEN');

      table.push([
        `${result.sender.source.name || result.sender.type}_${index}`,
        result.sender.type,
        `${result.sender.source.file}:${result.sender.source.line}`,
        result.receiver
          ? `${result.receiver.source.file}:${result.receiver.source.line}`
          : 'NOT FOUND',
        status
      ]);
    });

    return table.toString();
  }

  generateVirtualMemoryReport(results) {
    const table = new Table({
      head: ['Element', 'File', 'Result', 'Time'].map(h =>
        this.colorize ? chalk.bold.cyan(h) : h
      ),
      colWidths: [25, 30, 10, 10],
      style: {
        head: ['cyan'],
        border: ['grey']
      }
    });

    results.forEach(result => {
      const status = result.status === 'PASSED'
        ? (this.colorize ? chalk.green('✓ PASS') : 'PASS')
        : (this.colorize ? chalk.red('✗ FAIL') : 'FAIL');

      table.push([
        result.element || result.file,
        result.file,
        status,
        result.time || '—'
      ]);
    });

    return table.toString();
  }

  generateSummary(stats) {
    const table = new Table({
      head: ['Metric', 'Value'].map(h =>
        this.colorize ? chalk.bold.cyan(h) : h
      ),
      colWidths: [25, 15],
      style: {
        head: ['cyan'],
        border: ['grey']
      }
    });

    table.push(
      ['Files Scanned', stats.filesScanned || 0],
      ['Connections Found', stats.connectionsFound || 0],
      ['Issues Detected', stats.issuesDetected || 0],
      ['Connected', this.colorize ? chalk.green(stats.connected || 0) : stats.connected || 0],
      ['Broken', this.colorize ? chalk.red(stats.broken || 0) : stats.broken || 0]
    );

    return table.toString();
  }
}

module.exports = { TableGenerator };
