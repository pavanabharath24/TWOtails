#!/usr/bin/env node

/**
 * TWOtails - AI Code Connectivity Analyzer
 * Two signals, one truth. Every connection verified.
 *
 * Comprehensive analysis for AI-generated code:
 * - Line-by-line connectivity checks
 * - Database model/query/relation verification
 * - API route & middleware validation
 * - AI hallucination detection
 * - Security vulnerability scanning
 * - Environment variable validation
 * - Virtual memory UI testing
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const { MasterAnalyzer } = require('./analyzer/master-analyzer');
const { LineByLineAnalyzer } = require('./analyzer/line-analyzer');
const { DatabaseAnalyzer } = require('./analyzer/database-analyzer');
const { APIRouteAnalyzer } = require('./analyzer/api-analyzer');
const { AICodeQualityScanner } = require('./analyzer/ai-quality-scanner');
const { SecurityScanner } = require('./analyzer/security-scanner');
const { EnvironmentAnalyzer } = require('./analyzer/env-analyzer');
const { SignalMatcher } = require('./tracer/signal-matcher');
const { generateReport } = require('./reporter/table-generator');
const { runVirtualMemoryTests } = require('./virtual-memory/runner');

const program = new Command();

program
  .name('twotails')
  .description('AI code connectivity analyzer - checks every line for correctness')
  .version('2.0.0');

// ─── FULL SCAN ───────────────────────────────────────────────────
program
  .command('scan [directory]')
  .description('Full analysis: connectivity, database, API, security, AI quality, env')
  .option('-e, --extensions <exts>', 'File extensions to scan', '.js,.jsx,.ts,.tsx')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .option('-s, --severity <level>', 'Minimum severity to show (ERROR, WARNING, INFO)', 'INFO')
  .option('--json', 'Output as JSON')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Full Scan: ${path.resolve(dir)}\n`);

    const analyzer = new MasterAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Filter by severity
      const minSeverity = options.severity.toUpperCase();
      const severityOrder = { 'ERROR': 0, 'WARNING': 1, 'INFO': 2 };
      const filteredIssues = result.issues.filter(i =>
        (severityOrder[i.severity] || 2) <= (severityOrder[minSeverity] || 2)
      );

      console.log(result.summary);
      console.log('\nDetailed Issues:\n');

      // Group by source
      const bySource = {};
      filteredIssues.forEach(issue => {
        if (!bySource[issue.source]) bySource[issue.source] = [];
        bySource[issue.source].push(issue);
      });

      Object.entries(bySource).forEach(([source, issues]) => {
        console.log(`\n${getAnalyzerLabel(source)} (${issues.length} issues):`);
        console.log('─'.repeat(60));

        issues.forEach((issue, i) => {
          const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
          const line = issue.line ? `:${issue.line}` : '';
          console.log(`  ${severity} ${issue.file}${line}`);
          console.log(`    ${issue.message}`);
          if (issue.suggestion) {
            console.log(`    → ${issue.suggestion}`);
          }
          console.log('');
        });
      });
    }
  });

// ─── CONNECTIVITY SCAN ──────────────────────────────────────────
program
  .command('connectivity [directory]')
  .description('Check connections: function calls, event handlers, imports')
  .option('-e, --extensions <exts>', 'File extensions to scan', '.js,.jsx,.ts,.tsx')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Connectivity Scan: ${path.resolve(dir)}\n`);

    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    const reportData = {
      results: result.issues.map(issue => ({
        type: issue.type,
        sender: `${issue.file}:${issue.line}`,
        senderDetail: issue.sender || '—',
        receiver: issue.receiver || 'NOT FOUND',
        receiverDetail: '',
        status: issue.severity === 'ERROR' ? '✗ ERROR' : '⚠ WARNING',
        suggestion: issue.suggestion
      })),
      stats: {
        filesScanned: result.stats.filesScanned,
        totalConnections: result.stats.totalIssues,
        connected: result.stats.totalIssues - result.stats.errors - result.stats.warnings,
        broken: result.stats.errors,
        parseErrors: result.stats.warnings
      }
    };

    generateReport(reportData);
  });

// ─── DATABASE SCAN ──────────────────────────────────────────────
program
  .command('database [directory]')
  .description('Check database: models, queries, migrations, relations')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Database Scan: ${path.resolve(dir)}\n`);

    const analyzer = new DatabaseAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    console.log(`Models found: ${result.stats.modelsFound}`);
    console.log(`Queries found: ${result.stats.queriesFound}`);
    console.log(`Relations found: ${result.stats.relationsFound}`);
    console.log(`Migrations found: ${result.stats.migrationsFound}`);
    console.log(`Issues: ${result.stats.issues} (${result.stats.errors} errors, ${result.stats.warnings} warnings)\n`);

    if (result.issues.length > 0) {
      result.issues.forEach(issue => {
        const severity = issue.severity === 'ERROR' ? '✗' : '⚠';
        console.log(`  ${severity} ${issue.file}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}\n`);
      });
    } else {
      console.log('✓ No database issues found');
    }
  });

// ─── API SCAN ───────────────────────────────────────────────────
program
  .command('api [directory]')
  .description('Check API routes: endpoints, middleware, handlers, validation')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails API Route Scan: ${path.resolve(dir)}\n`);

    const analyzer = new APIRouteAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    console.log(`Routes found: ${result.stats.routesFound}`);
    console.log(`Parameters found: ${result.stats.paramsFound}`);
    console.log(`Middleware found: ${result.stats.middlewareFound}`);
    console.log(`Issues: ${result.stats.issues} (${result.stats.errors} errors, ${result.stats.warnings} warnings)\n`);

    if (result.issues.length > 0) {
      result.issues.forEach(issue => {
        const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
        console.log(`  ${severity} ${issue.file}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}\n`);
      });
    } else {
      console.log('✓ No API route issues found');
    }
  });

// ─── SECURITY SCAN ──────────────────────────────────────────────
program
  .command('security [directory]')
  .description('Scan for vulnerabilities, secrets, and security issues')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Security Scan: ${path.resolve(dir)}\n`);

    const scanner = new SecurityScanner();
    const result = await scanner.scanDirectory(dir, options);

    console.log(`Files scanned: ${result.stats.filesScanned}`);
    console.log(`Secrets found: ${result.stats.secrets}`);
    console.log(`Vulnerabilities found: ${result.stats.vulnerabilities}`);
    console.log(`AI security mistakes: ${result.stats.aiSecurityMistakes}`);
    console.log(`Total issues: ${result.stats.issues} (${result.stats.errors} errors, ${result.stats.warnings} warnings)\n`);

    if (result.secrets.length > 0) {
      console.log('SECRETS DETECTED:');
      console.log('─'.repeat(60));
      result.secrets.forEach(secret => {
        console.log(`  ✗ ${secret.file}:${secret.line}`);
        console.log(`    Type: ${secret.type}`);
        console.log(`    Value: ${secret.masked}`);
        console.log('');
      });
    }

    if (result.issues.length > 0) {
      console.log('SECURITY ISSUES:');
      console.log('─'.repeat(60));
      result.issues.forEach(issue => {
        const severity = issue.severity === 'ERROR' ? '✗' : '⚠';
        console.log(`  ${severity} ${issue.file}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}\n`);
      });
    } else {
      console.log('✓ No security issues found');
    }
  });

// ─── AI QUALITY SCAN ────────────────────────────────────────────
program
  .command('ai-quality [directory]')
  .description('Detect AI hallucinations, deprecated patterns, common mistakes')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails AI Quality Scan: ${path.resolve(dir)}\n`);

    const scanner = new AICodeQualityScanner();
    const result = await scanner.scanDirectory(dir, options);

    console.log(`Files scanned: ${result.stats.filesScanned}`);
    console.log(`Hallucinations: ${result.stats.hallucinations}`);
    console.log(`Deprecated patterns: ${result.stats.deprecated}`);
    console.log(`Security issues: ${result.stats.security}`);
    console.log(`Performance issues: ${result.stats.performance}`);
    console.log(`Common mistakes: ${result.stats.commonMistakes}`);
    console.log(`Total issues: ${result.stats.issues} (${result.stats.errors} errors, ${result.stats.warnings} warnings)\n`);

    if (result.issues.length > 0) {
      result.issues.forEach(issue => {
        const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
        console.log(`  ${severity} ${issue.file}:${issue.line}`);
        console.log(`    [${issue.type}] ${issue.message}`);
        console.log(`    → ${issue.suggestion}\n`);
      });
    } else {
      console.log('✓ No AI quality issues found');
    }
  });

// ─── ENVIRONMENT SCAN ──────────────────────────────────────────
program
  .command('env [directory]')
  .description('Check environment variables, .env files, config')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Environment Scan: ${path.resolve(dir)}\n`);

    const analyzer = new EnvironmentAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    console.log(`Environment variables found: ${result.stats.envVarsFound}`);
    console.log(`Config files found: ${result.stats.configFilesFound}`);
    console.log(`Env files found: ${result.stats.envFilesFound}`);
    console.log(`Issues: ${result.stats.issues} (${result.stats.errors} errors, ${result.stats.warnings} warnings)\n`);

    if (result.issues.length > 0) {
      result.issues.forEach(issue => {
        const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
        console.log(`  ${severity} ${issue.file}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}\n`);
      });
    } else {
      console.log('✓ No environment issues found');
    }
  });

// ─── TRACE ──────────────────────────────────────────────────────
program
  .command('trace [file]')
  .description('Trace all signals from a specific file - bidirectional')
  .action(async (file) => {
    if (!file) {
      console.error('Please specify a file to trace');
      process.exit(1);
    }
    console.log(`\nTWOtails Trace: ${path.resolve(file)}\n`);

    const matcher = new SignalMatcher();
    const result = await matcher.trace(file);

    const reportData = {
      results: result.results.map(r => ({
        type: r.type,
        sender: `${r.senderFile}:${r.senderLine}`,
        senderDetail: r.senderName,
        receiver: r.receiverFile
          ? `${r.receiverFile}:${r.receiverLine}`
          : 'NOT FOUND',
        receiverDetail: r.receiverName || '',
        status: r.status === 'CONNECTED' ? '✓ CONNECTED' : '✗ BROKEN',
        suggestion: r.suggestion || '—'
      })),
      stats: result.stats
    };

    generateReport(reportData);
  });

// ─── TEST (Virtual Memory) ─────────────────────────────────────
program
  .command('test [directory]')
  .description('Test UI elements in virtual memory (buttons, forms, navigation)')
  .option('-t, --timeout <ms>', 'Test timeout in milliseconds', '30000')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Virtual Memory Test: ${path.resolve(dir)}\n`);

    try {
      const result = await runVirtualMemoryTests(dir, options);

      console.log('Virtual Memory Test Results');
      console.log('═'.repeat(60));
      console.log(`Total test suites: ${result.summary.total}`);
      console.log(`Passed: ${result.summary.passed}`);
      console.log(`Failed: ${result.summary.failed}`);
      console.log(`Total individual tests: ${result.summary.totalTests}`);
      console.log(`Individual tests passed: ${result.summary.passedTests}\n`);

      if (result.results.length > 0) {
        result.results.forEach((test, i) => {
          const status = test.passed ? '✓ PASS' : '✗ FAIL';
          console.log(`${i + 1}. ${test.type}: ${status}`);
          test.tests.forEach(t => {
            const tStatus = t.passed ? '  ✓' : '  ✗';
            console.log(`   ${tStatus} ${t.name}`);
          });
          console.log('');
        });
      } else {
        console.log('No UI elements found to test.');
      }
    } catch (err) {
      console.error('Virtual memory test failed:', err.message);
    }
  });

// ─── REPORT ─────────────────────────────────────────────────────
program
  .command('report [directory]')
  .description('Generate full connection report')
  .action(async (directory) => {
    const dir = directory || './';
    console.log(`\nTWOtails Report: ${path.resolve(dir)}\n`);

    const analyzer = new MasterAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, {});

    console.log(result.summary);
  });

function getAnalyzerLabel(source) {
  const labels = {
    connectivity: 'Connectivity Issues',
    database: 'Database Issues',
    api: 'API Route Issues',
    aiQuality: 'AI Code Quality',
    security: 'Security Issues',
    environment: 'Environment Issues'
  };
  return labels[source] || source;
}

program.parse();
