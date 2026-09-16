#!/usr/bin/env node

/**
 * TWOtails - AI Code Connectivity Analyzer
 * Two signals, one truth. Every connection verified.
 */

const { Command } = require('commander');
const path = require('path');
const { scan } = require('./analyzer/ast-parser');
const { trace } = require('./tracer/signal-matcher');
const { generateReport } = require('./reporter/table-generator');

const program = new Command();

program
  .name('twotails')
  .description('AI code connectivity analyzer - traces signals between sender and receiver endpoints')
  .version('1.0.0');

program
  .command('scan [directory]')
  .description('Scan codebase for broken connections, missing functions, misplaced code')
  .option('-e, --extensions <exts>', 'File extensions to scan', '.js,.jsx,.ts,.tsx')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Scan: ${path.resolve(dir)}\n`);
    const result = await scan(dir, options);
    generateReport(result);
  });

program
  .command('trace [file]')
  .description('Trace all signals from a specific file using bidirectional signal matching')
  .action(async (file) => {
    if (!file) {
      console.error('Please specify a file to trace');
      process.exit(1);
    }
    console.log(`\nTWOtails Trace: ${path.resolve(file)}\n`);
    const result = await trace(file);
    generateReport(result);
  });

program
  .command('report [directory]')
  .description('Generate full connection report as table')
  .action(async (directory) => {
    const dir = directory || './';
    console.log(`\nTWOtails Report: ${path.resolve(dir)}\n`);
    const result = await scan(dir, {});
    generateReport(result);
  });

program.parse();
