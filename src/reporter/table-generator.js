/**
 * TWOtails Table Generator
 * Accurate table output for connection reports
 */

const Table = require('cli-table3');
const chalk = require('chalk');

function generateReport(data) {
  const { results, stats } = data;

  // Print header
  console.log('\n' + chalk.bold.cyan('TWOtails Connection Report'));
  console.log(chalk.gray('═'.repeat(70)));

  if (stats) {
    console.log(chalk.white(`Files scanned:     ${stats.filesScanned || 0}`));
    console.log(chalk.white(`Connections:       ${stats.totalConnections || results.length}`));
    console.log(chalk.green(`Connected:         ${stats.connected || results.filter(r => r.status.includes('CONNECTED')).length}`));
    console.log(chalk.red(`Broken:            ${stats.broken || results.filter(r => r.status.includes('BROKEN')).length}`));
    if (stats.parseErrors) {
      console.log(chalk.yellow(`Parse warnings:    ${stats.parseErrors}`));
    }
    console.log('');
  }

  // Build table
  const table = new Table({
    head: ['#', 'Type', 'Sender', 'Receiver', 'Status', 'Suggested Fix'].map(h =>
      chalk.bold.cyan(h)
    ),
    colWidths: [5, 18, 35, 35, 14, 40],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    wordWrap: true
  });

  results.forEach((result, index) => {
    const status = result.status.includes('CONNECTED')
      ? chalk.green(result.status)
      : result.status.includes('BROKEN')
        ? chalk.red(result.status)
        : chalk.yellow(result.status);

    table.push([
      index + 1,
      result.type,
      `${result.senderDetail || ''}\n${chalk.gray(result.sender)}`,
      result.receiver !== 'NOT FOUND'
        ? `${result.receiverDetail || ''}\n${chalk.gray(result.receiver)}`
        : chalk.red('NOT FOUND'),
      status,
      result.suggestion || '—'
    ]);
  });

  console.log(table.toString());

  // Print summary
  const connected = results.filter(r => r.status.includes('CONNECTED')).length;
  const broken = results.filter(r => r.status.includes('BROKEN')).length;
  const warnings = results.filter(r => r.status.includes('WARNING')).length;

  console.log('\n' + chalk.gray('─'.repeat(70)));

  if (broken === 0 && warnings === 0) {
    console.log(chalk.green.bold('✓ All connections verified working'));
  } else {
    if (broken > 0) {
      console.log(chalk.red.bold(`✗ ${broken} broken connection${broken > 1 ? 's' : ''} found`));
    }
    if (warnings > 0) {
      console.log(chalk.yellow.bold(`⚠ ${warnings} warning${warnings > 1 ? 's' : ''}`));
    }
  }

  console.log('');
}

function generateTraceReport(data) {
  const { results, stats } = data;

  console.log('\n' + chalk.bold.cyan('TWOtails Signal Trace'));
  console.log(chalk.gray('═'.repeat(70)));
  console.log(chalk.white(`File: ${stats.file}\n`));

  const table = new Table({
    head: ['#', 'Type', 'Direction', 'Sender', 'Receiver', 'Status'].map(h =>
      chalk.bold.cyan(h)
    ),
    colWidths: [5, 18, 12, 35, 35, 14],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    wordWrap: true
  });

  results.forEach((result, index) => {
    const status = result.status.includes('CONNECTED')
      ? chalk.green(result.status)
      : chalk.red(result.status);

    table.push([
      index + 1,
      result.type,
      result.direction || '—',
      `${result.senderDetail || ''}\n${chalk.gray(result.sender)}`,
      result.receiver !== 'NOT FOUND'
        ? `${result.receiverDetail || ''}\n${chalk.gray(result.receiver)}`
        : chalk.red('NOT FOUND'),
      status
    ]);
  });

  console.log(table.toString());

  const connected = results.filter(r => r.status.includes('CONNECTED')).length;
  const broken = results.filter(r => r.status.includes('BROKEN')).length;

  console.log('\n' + chalk.gray('─'.repeat(70)));
  console.log(chalk.white(`Traced: ${results.length} signals`));
  console.log(chalk.green(`Connected: ${connected}`));
  console.log(chalk.red(`Broken: ${broken}`));
  console.log('');
}

module.exports = { generateReport, generateTraceReport };
