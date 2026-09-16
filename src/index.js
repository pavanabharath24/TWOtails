#!/usr/bin/env node

/**
 * TWOtails - AI Code Connectivity Analyzer
 * Two signals, one truth. Every connection verified.
 */

const { Command } = require('commander');
const path = require('path');
const { scan } = require('./analyzer/ast-parser');
const { trace } = require('./tracer/signal-matcher');
const { testVirtualMemory } = require('./virtual-memory/memory-manager');
const { fix } = require('./reporter/results-formatter');

const program = new Command();

program
  .name('twotails')
  .description('AI code connectivity analyzer - traces signals between sender and receiver endpoints')
  .version('1.0.0');

program
  .command('scan [directory]')
  .description('Scan codebase for broken connections, missing functions, misplaced code')
  .option('-e, --extensions <exts>', 'File extensions to scan', '.js,.jsx,.ts,.tsx,.py')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Scan: ${path.resolve(dir)}\n`);
    const results = await scan(dir, options);
    console.table(results);
  });

program
  .command('trace [file]')
  .description('Trace all signals from a specific file using bidirectional signal matching')
  .option('-f, --function <name>', 'Trace specific function')
  .action(async (file, options) => {
    if (!file) {
      console.error('Please specify a file to trace');
      process.exit(1);
    }
    console.log(`\nTWOtails Trace: ${path.resolve(file)}\n`);
    const results = await trace(file, options);
    console.log(results);
  });

program
  .command('test [directory]')
  .description('Run virtual memory tests on UI elements')
  .option('-e, --element <type>', 'Element type to test (button, form, navigation)', 'all')
  .option('-t, --timeout <ms>', 'Virtual memory timeout', '30000')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Virtual Memory Test: ${path.resolve(dir)}\n`);
    const results = await testVirtualMemory(dir, options);
    console.table(results);
  });

program
  .command('fix [directory]')
  .description('Auto-fix all detected issues')
  .option('--auto', 'Apply fixes automatically without confirmation')
  .option('--dry-run', 'Show what would be fixed without changing files')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Fix: ${path.resolve(dir)}\n`);
    await fix(dir, options);
  });

program
  .command('report [directory]')
  .description('Generate full connection report as table')
  .option('-f, --format <format>', 'Output format (table, json, markdown)', 'table')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Report: ${path.resolve(dir)}\n`);
    const results = await scan(dir, {});
    console.table(results);
  });

program.parse();
