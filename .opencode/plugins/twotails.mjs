/**
 * TWOtails OpenCode Plugin
 * AI code quality analyzer with 6 specialized scanners
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

function loadSkills() {
  const skills = [];
  const skillDirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  for (const dir of skillDirs) {
    const skillFile = path.join(SKILLS_DIR, dir, 'skill.md');
    if (fs.existsSync(skillFile)) {
      skills.push({
        name: dir,
        content: fs.readFileSync(skillFile, 'utf8')
      });
    }
  }

  return skills;
}

function injectInstructions() {
  const agentsFile = path.join(__dirname, '..', '..', 'AGENTS.md');
  if (fs.existsSync(agentsFile)) {
    return fs.readFileSync(agentsFile, 'utf8');
  }
  return '';
}

module.exports = {
  name: 'twotails',
  version: '2.0.0',
  description: 'AI code quality analyzer - 6 scanners, 1 truth, zero false positives',
  
  hooks: {
    'session:start': async (context) => {
      const instructions = injectInstructions();
      return {
        type: 'instructions',
        content: instructions
      };
    }
  },

  commands: [
    {
      name: 'twotails',
      description: 'Set TWOtails intensity level (lite/full/ultra/off)',
      handler: async (args) => {
        const mode = args[0] || 'full';
        const validModes = ['lite', 'full', 'ultra', 'off'];
        
        if (!validModes.includes(mode)) {
          return `Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`;
        }

        const flagPath = path.join(process.env.HOME || '~', '.twotails-active');
        fs.writeFileSync(flagPath, JSON.stringify({
          mode,
          changedAt: new Date().toISOString()
        }));

        return `TWOtails mode set to: ${mode}`;
      }
    },
    {
      name: 'twotails-scan',
      description: 'Full analysis: connectivity, database, API, security, AI quality, env',
      handler: async (args) => {
        const dir = args[0] || './';
        const { MasterAnalyzer } = require('../../src/analyzer/master-analyzer');
        const analyzer = new MasterAnalyzer();
        const result = await analyzer.analyzeDirectory(dir, {});
        
        return `Found ${result.stats.totalIssues} issues (${result.stats.errors} errors, ${result.stats.warnings} warnings) in ${result.stats.filesScanned} files`;
      }
    },
    {
      name: 'twotails-connectivity',
      description: 'Check connections: function calls, event handlers, imports',
      handler: async (args) => {
        const dir = args[0] || './';
        const { LineByLineAnalyzer } = require('../../src/analyzer/line-analyzer');
        const analyzer = new LineByLineAnalyzer();
        const result = await analyzer.analyzeDirectory(dir, {});
        
        return `Connectivity: ${result.stats.totalIssues} issues (${result.stats.errors} errors, ${result.stats.warnings} warnings)`;
      }
    },
    {
      name: 'twotails-database',
      description: 'Check database: models, queries, migrations, relations',
      handler: async (args) => {
        const dir = args[0] || './';
        const { DatabaseAnalyzer } = require('../../src/analyzer/database-analyzer');
        const analyzer = new DatabaseAnalyzer();
        const result = await analyzer.analyzeDirectory(dir, {});
        
        return `Database: ${result.stats.modelsFound} models, ${result.stats.queriesFound} queries, ${result.stats.issues} issues`;
      }
    },
    {
      name: 'twotails-api',
      description: 'Check API routes: endpoints, middleware, handlers, validation',
      handler: async (args) => {
        const dir = args[0] || './';
        const { APIRouteAnalyzer } = require('../../src/analyzer/api-analyzer');
        const analyzer = new APIRouteAnalyzer();
        const result = await analyzer.analyzeDirectory(dir, {});
        
        return `API: ${result.stats.routesFound} routes, ${result.stats.issues} issues`;
      }
    },
    {
      name: 'twotails-security',
      description: 'Scan for vulnerabilities, secrets, and security issues',
      handler: async (args) => {
        const dir = args[0] || './';
        const { SecurityScanner } = require('../../src/analyzer/security-scanner');
        const scanner = new SecurityScanner();
        const result = await scanner.scanDirectory(dir, {});
        
        return `Security: ${result.stats.secrets} secrets, ${result.stats.vulnerabilities} vulnerabilities, ${result.stats.issues} issues`;
      }
    },
    {
      name: 'twotails-ai-quality',
      description: 'Detect AI hallucinations, deprecated patterns, common mistakes',
      handler: async (args) => {
        const dir = args[0] || './';
        const { AICodeQualityScanner } = require('../../src/analyzer/ai-quality-scanner');
        const scanner = new AICodeQualityScanner();
        const result = await scanner.scanDirectory(dir, {});
        
        return `AI Quality: ${result.stats.hallucinations} hallucinations, ${result.stats.deprecated} deprecated, ${result.stats.issues} issues`;
      }
    },
    {
      name: 'twotails-env',
      description: 'Check environment variables, .env files, config',
      handler: async (args) => {
        const dir = args[0] || './';
        const { EnvironmentAnalyzer } = require('../../src/analyzer/env-analyzer');
        const analyzer = new EnvironmentAnalyzer();
        const result = await analyzer.analyzeDirectory(dir, {});
        
        return `Environment: ${result.stats.envVarsFound} vars, ${result.stats.issues} issues`;
      }
    },
    {
      name: 'twotails-trace',
      description: 'Trace signals from a specific file using bidirectional matching',
      handler: async (args) => {
        const file = args[0];
        if (!file) return 'Please specify a file to trace';
        
        const { SignalMatcher } = require('../../src/tracer/signal-matcher');
        const matcher = new SignalMatcher();
        const results = await matcher.trace(file);
        
        return `Trace: ${results.results.length} signals found`;
      }
    },
    {
      name: 'twotails-test',
      description: 'Test UI elements in virtual memory (real Playwright browser)',
      handler: async (args) => {
        const dir = args[0] || './';
        const { runVirtualMemoryTests } = require('../../src/virtual-memory/runner');
        const results = await runVirtualMemoryTests(dir, {});
        
        return `Virtual Memory: ${results.summary.passedSuites}/${results.summary.totalSuites} suites passed, ${results.summary.passedTests}/${results.summary.totalTests} tests passed`;
      }
    },
    {
      name: 'twotails-help',
      description: 'Show TWOtails help and commands',
      handler: async () => {
        return `
TWOtails v2.0 - AI Code Quality Analyzer
═══════════════════════════════════════════

Scan Commands:
  /twotails-scan [dir]           Full analysis (all 6 scanners)
  /twotails-connectivity [dir]   Only connectivity checks
  /twotails-database [dir]       Only database checks
  /twotails-api [dir]            Only API route checks
  /twotails-security [dir]       Only security checks
  /twotails-ai-quality [dir]     Only AI quality checks
  /twotails-env [dir]            Only environment checks

Test Commands:
  /twotails-test [dir]           Virtual memory UI testing
  /twotails-trace [file]         Bidirectional signal tracing

Other:
  /twotails [lite|full|ultra|off]  Set intensity level
  /twotails-help                   Show this help
        `.trim();
      }
    }
  ],

  skills: loadSkills()
};
