#!/usr/bin/env node

/**
 * TWOtails - AI Code Quality Analyzer
 * 14 scanners, 1 truth, zero false positives
 * Supports: JavaScript, TypeScript, Python, Go, Java, Ruby, Rust, PHP, C#, Swift, Kotlin, Scala
 */

const { Command } = require('commander');
const path = require('path');
const { MasterAnalyzer } = require('./analyzer/master-analyzer');
const { LineByLineAnalyzer } = require('./analyzer/line-analyzer');
const { DatabaseAnalyzer } = require('./analyzer/database-analyzer');
const { APIRouteAnalyzer } = require('./analyzer/api-analyzer');
const { AICodeQualityScanner } = require('./analyzer/ai-quality-scanner');
const { SecurityScanner } = require('./analyzer/security-scanner');
const { EnvironmentAnalyzer } = require('./analyzer/env-analyzer');
const { AIPromptScanner } = require('./analyzer/prompt-scanner');
const { TokenCounter } = require('./analyzer/token-counter');
const { ErrorHandlerAnalyzer } = require('./analyzer/error-handler-analyzer');
const { DependencyScanner } = require('./analyzer/dependency-scanner');
const { DockerAnalyzer } = require('./analyzer/docker-analyzer');
const { WebSocketAnalyzer } = require('./analyzer/websocket-analyzer');
const { TestCoverageDetector } = require('./analyzer/test-coverage-detector');
const { MultiLanguageAnalyzer } = require('./analyzer/multi-language-analyzer');
const { PaywallConnectionAnalyzer } = require('./analyzer/paywall-analyzer');
const { SignalMatcher } = require('./tracer/signal-matcher');
const { generateReport } = require('./reporter/table-generator');
const { runVirtualMemoryTests } = require('./virtual-memory/runner');

// Print paths relative to the current directory for readable output
const rel = (filePath) => path.relative(process.cwd(), filePath) || '.';

const program = new Command();

program
  .name('twotails')
  .description('AI code quality analyzer - 14 scanners, 1 truth, zero false positives')
  .version('3.1.0');

// ─── FULL SCAN ───────────────────────────────────────────────────
program
  .command('scan [directory]')
  .description('Full analysis: all 14 scanners, every supported language, bidirectional signal tracing')
  .option('-e, --extensions <exts>', 'JS/TS file extensions for AST scanners', '.js,.jsx,.ts,.tsx')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .option('-s, --severity <level>', 'Minimum severity (ERROR, WARNING, INFO)', 'INFO')
  .option('--json', 'Output as JSON')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Full Scan: ${rel(path.resolve(dir))}\n`);

    const analyzer = new MasterAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const minSeverity = options.severity.toUpperCase();
      const severityOrder = { 'ERROR': 0, 'WARNING': 1, 'INFO': 2 };
      const filteredIssues = result.issues.filter(i =>
        (severityOrder[i.severity] || 2) <= (severityOrder[minSeverity] || 2)
      );

      console.log(result.summary);
      console.log('\nDetailed Issues:');

      const bySource = {};
      filteredIssues.forEach(issue => {
        if (!bySource[issue.source]) bySource[issue.source] = [];
        bySource[issue.source].push(issue);
      });

      Object.entries(bySource).forEach(([source, issues]) => {
        console.log(`\n${getAnalyzerLabel(source)} (${issues.length} issues):`);
        console.log('─'.repeat(64));

        issues.forEach((issue, i) => {
          const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
          const line = issue.line ? `:${issue.line}` : '';
          console.log(`  ${severity} ${rel(issue.file)}${line}`);
          console.log(`    ${issue.message}`);
          if (issue.suggestion) {
            console.log(`    → ${issue.suggestion}`);
          }
          console.log('');
        });
      });
    }
  });

// ─── INDIVIDUAL SCANNERS ────────────────────────────────────────
const scanners = [
  { name: 'connectivity', desc: 'Function calls, handlers, imports', Class: LineByLineAnalyzer },
  { name: 'database', desc: 'Models, queries, migrations, relations', Class: DatabaseAnalyzer },
  { name: 'api', desc: 'Routes, middleware, handlers, validation', Class: APIRouteAnalyzer },
  { name: 'security', desc: 'Secrets, SQL injection, XSS, command injection', Class: SecurityScanner, isScanDir: true },
  { name: 'ai-quality', desc: 'Hallucinations, deprecated patterns, mistakes', Class: AICodeQualityScanner, isScanDir: true },
  { name: 'env', desc: 'Environment variables, .env files, config', Class: EnvironmentAnalyzer },
  { name: 'prompts', desc: 'Prompt injection, jailbreak, unsafe patterns', Class: AIPromptScanner, isScanDir: true },
  { name: 'errors', desc: 'Uncaught promises, missing error handlers', Class: ErrorHandlerAnalyzer },
  { name: 'deps', desc: 'Vulnerable and deprecated packages', Class: DependencyScanner },
  { name: 'docker', desc: 'Dockerfile security and best practices', Class: DockerAnalyzer },
  { name: 'websocket', desc: 'WebSocket connections, handlers, reconnection', Class: WebSocketAnalyzer },
  { name: 'tests', desc: 'Test coverage and missing test files', Class: TestCoverageDetector }
];

scanners.forEach(({ name, desc, Class, isScanDir }) => {
  program
    .command(`${name} [directory]`)
    .description(desc)
    .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
    .action(async (directory, options) => {
      const dir = directory || './';
      console.log(`\nTWOtails ${name.charAt(0).toUpperCase() + name.slice(1)} Scan: ${path.resolve(dir)}\n`);

      const analyzer = new Class();
      const result = isScanDir
        ? await analyzer.scanDirectory(dir, options)
        : await analyzer.analyzeDirectory(dir, options);

      if (result.issues && result.issues.length > 0) {
        result.issues.forEach(issue => {
          const severity = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
          const line = issue.line ? `:${issue.line}` : '';
          console.log(`  ${severity} ${rel(issue.file)}${line}`);
          console.log(`    ${issue.message}`);
          console.log(`    → ${issue.suggestion}\n`);
        });
      } else {
        console.log('✓ No issues found');
      }

      if (result.stats) {
        console.log('\nStats:', JSON.stringify(result.stats, null, 2));
      }
    });
});

// ─── TOKEN COUNTER ──────────────────────────────────────────────
program
  .command('tokens [directory]')
  .description('Count tokens for LLM cost optimization')
  .option('-e, --extensions <exts>', 'File extensions', '.js,.jsx,.ts,.tsx,.json,.md')
  .option('-t, --top <n>', 'Show top N files', '10')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Token Counter: ${path.resolve(dir)}\n`);

    const counter = new TokenCounter();
    const result = await counter.analyzeDirectory(dir, options);

    console.log(`Files scanned: ${result.stats.filesScanned}`);
    console.log(`Total tokens: ${result.stats.totalTokens.toLocaleString()}`);
    console.log(`Total characters: ${result.stats.totalChars.toLocaleString()}`);
    console.log(`Total lines: ${result.stats.totalLines.toLocaleString()}`);
    console.log(`Average tokens/file: ${result.stats.averageTokensPerFile.toLocaleString()}`);

    console.log('\nTop files by token count:');
    const topFiles = counter.getTopFiles(parseInt(options.top || 10));
    topFiles.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.file.split('/').pop()}: ${f.tokens.toLocaleString()} tokens`);
    });

    console.log('\nEstimated LLM costs (per 1M tokens):');
    Object.entries(result.costs).slice(0, 5).forEach(([model, cost]) => {
      console.log(`  ${model}: $${cost.inputCost} input / $${cost.outputCost} output`);
    });

    const recommendations = counter.getRecommendations();
    if (recommendations.length > 0) {
      console.log('\nRecommendations:');
      recommendations.forEach(r => {
        console.log(`  ⚠ ${r.message}`);
        console.log(`    → ${r.suggestion}`);
      });
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
        receiver: r.receiverFile ? `${r.receiverFile}:${r.receiverLine}` : 'NOT FOUND',
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
  .description('Test UI elements in virtual memory (real Playwright)')
  .option('-t, --timeout <ms>', 'Test timeout in ms', '30000')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Virtual Memory Test: ${path.resolve(dir)}\n`);

    try {
      const result = await runVirtualMemoryTests(dir, options);

      console.log('Virtual Memory Test Results');
      console.log('═'.repeat(60));
      console.log(`Total test suites: ${result.summary.totalSuites}`);
      console.log(`Passed: ${result.summary.passedSuites}`);
      console.log(`Failed: ${result.summary.failedSuites}`);
      console.log(`Total individual tests: ${result.summary.totalTests}`);
      console.log(`Individual tests passed: ${result.summary.passedTests}\n`);

      if (result.suites) {
        result.suites.forEach((suite, i) => {
          const status = suite.passed ? '✓ PASS' : '✗ FAIL';
          console.log(`${i + 1}. ${suite.name}: ${status}`);
          suite.results.forEach(t => {
            const tStatus = t.passed ? '  ✓' : '  ✗';
            console.log(`   ${tStatus} ${t.name}`);
          });
          console.log('');
        });
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
    connectivity: 'Connectivity',
    database: 'Database',
    api: 'API Routes',
    aiQuality: 'AI Quality',
    security: 'Security',
    environment: 'Environment',
    prompt: 'AI Prompts',
    tokens: 'Token Usage',
    errorHandling: 'Error Handling',
    dependencies: 'Dependencies',
    docker: 'Docker',
    websocket: 'WebSocket',
    testCoverage: 'Test Coverage',
    multiLanguage: 'Multi-Language'
  };
  return labels[source] || source;
}

// ─── MULTI-LANGUAGE SCAN ───────────────────────────────────────
program
  .command('languages [directory]')
  .description('Scan Python, Go, Java, Ruby, Rust, PHP, C#, Swift, Kotlin, Scala')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage,__pycache__,vendor,target')
  .option('--json', 'Output as JSON')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Multi-Language Scan: ${path.resolve(dir)}\n`);

    const analyzer = new MultiLanguageAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('TWOtails Multi-Language Analysis');
    console.log('═'.repeat(60));
    console.log(`Files scanned: ${result.stats.filesScanned}`);
    console.log(`Languages detected: ${result.stats.languagesDetected.join(', ')}`);
    console.log(`Total issues: ${result.stats.issues}`);
    console.log(`Errors: ${result.stats.errors}`);
    console.log(`Warnings: ${result.stats.warnings}`);
    console.log('');

    if (result.issues.length === 0) {
      console.log('✓ No issues found\n');
      return;
    }

    // Group by language
    const byLanguage = {};
    result.issues.forEach(issue => {
      const ext = path.extname(issue.file);
      const lang = analyzer.supportedExtensions[ext] || 'unknown';
      if (!byLanguage[lang]) byLanguage[lang] = [];
      byLanguage[lang].push(issue);
    });

    Object.entries(byLanguage).forEach(([lang, issues]) => {
      console.log(`${lang.charAt(0).toUpperCase() + lang.slice(1)} (${issues.length} issues):`);
      console.log('─'.repeat(64));
      issues.forEach(issue => {
        const icon = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
        console.log(`  ${icon} ${rel(issue.file)}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}`);
        console.log('');
      });
    });
  });

// ─── PAYWALL SCAN ────────────────────────────────────────────────
program
  .command('paywall [directory]')
  .description('Verify paywall connections (RevenueCat, Stripe, Paddle, App Store, Play Store)')
  .option('-i, --ignore <dirs>', 'Directories to ignore', 'node_modules,dist,.git,coverage')
  .option('--json', 'Output as JSON')
  .action(async (directory, options) => {
    const dir = directory || './';
    console.log(`\nTWOtails Paywall Connection Scan: ${path.resolve(dir)}\n`);

    const analyzer = new PaywallConnectionAnalyzer();
    const result = await analyzer.analyzeDirectory(dir, options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log('TWOtails Paywall Connection Analysis');
    console.log('═'.repeat(60));
    console.log(`Files scanned: ${result.stats.filesScanned}`);
    console.log('Providers detected:');
    Object.entries(result.stats.providers).forEach(([provider, count]) => {
      if (count > 0) console.log(`  ${provider}: ${count} files`);
    });
    console.log(`Total issues: ${result.stats.issues}`);
    console.log(`Errors: ${result.stats.errors}`);
    console.log(`Warnings: ${result.stats.warnings}`);
    console.log('');

    if (result.issues.length === 0) {
      console.log('✓ No paywall issues found\n');
      return;
    }

    // Group by provider
    const byProvider = {};
    result.issues.forEach(issue => {
      const provider = issue.provider || 'unknown';
      if (!byProvider[provider]) byProvider[provider] = [];
      byProvider[provider].push(issue);
    });

    Object.entries(byProvider).forEach(([provider, issues]) => {
      console.log(`${provider} (${issues.length} issues):`);
      console.log('─'.repeat(64));
      issues.forEach(issue => {
        const icon = issue.severity === 'ERROR' ? '✗' : issue.severity === 'WARNING' ? '⚠' : 'ℹ';
        console.log(`  ${icon} ${rel(issue.file)}:${issue.line}`);
        console.log(`    ${issue.message}`);
        console.log(`    → ${issue.suggestion}`);
        console.log('');
      });
    });
  });

program.parse();
