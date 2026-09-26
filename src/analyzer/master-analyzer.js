/**
 * TWOtails Master Analyzer
 * Combines all 14 analyzers into one comprehensive scan
 * Runs bidirectional signal tracing on every scan
 */

const path = require('path');
const { glob } = require('glob');
const { LineByLineAnalyzer } = require('./line-analyzer');
const { DatabaseAnalyzer } = require('./database-analyzer');
const { APIRouteAnalyzer } = require('./api-analyzer');
const { AICodeQualityScanner } = require('./ai-quality-scanner');
const { SecurityScanner } = require('./security-scanner');
const { EnvironmentAnalyzer } = require('./env-analyzer');
const { AIPromptScanner } = require('./prompt-scanner');
const { TokenCounter } = require('./token-counter');
const { ErrorHandlerAnalyzer } = require('./error-handler-analyzer');
const { DependencyScanner } = require('./dependency-scanner');
const { DockerAnalyzer } = require('./docker-analyzer');
const { WebSocketAnalyzer } = require('./websocket-analyzer');
const { TestCoverageDetector } = require('./test-coverage-detector');
const { MultiLanguageAnalyzer } = require('./multi-language-analyzer');

// Extension -> language for the language breakdown shown on every scan
const LANGUAGE_BY_EXT = {
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.cs': 'C#',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.scala': 'Scala'
};

class MasterAnalyzer {
  constructor() {
    this.analyzers = {
      connectivity: new LineByLineAnalyzer(),
      database: new DatabaseAnalyzer(),
      api: new APIRouteAnalyzer(),
      aiQuality: new AICodeQualityScanner(),
      security: new SecurityScanner(),
      environment: new EnvironmentAnalyzer(),
      prompt: new AIPromptScanner(),
      tokens: new TokenCounter(),
      errorHandling: new ErrorHandlerAnalyzer(),
      dependencies: new DependencyScanner(),
      docker: new DockerAnalyzer(),
      websocket: new WebSocketAnalyzer(),
      testCoverage: new TestCoverageDetector(),
      multiLanguage: new MultiLanguageAnalyzer()
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const results = {};
    const allIssues = [];

    // Run all analyzers
    for (const [name, analyzer] of Object.entries(this.analyzers)) {
      try {
        let result;
        if (typeof analyzer.scanDirectory === 'function') {
          result = await analyzer.scanDirectory(dirPath, options);
        } else {
          result = await analyzer.analyzeDirectory(dirPath, options);
        }
        results[name] = result;

        // Collect issues with source tag
        if (result.issues) {
          result.issues.forEach(issue => {
            allIssues.push({
              ...issue,
              source: name
            });
          });
        }
      } catch (err) {
        results[name] = { error: err.message };
      }
    }

    // Deduplicate issues (same file + line + type)
    const uniqueIssues = this.deduplicateIssues(allIssues);

    // Language breakdown across every supported language
    const languages = await this.calculateLanguageStats(dirPath, options);

    // Calculate summary stats
    const stats = this.calculateStats(results, uniqueIssues);
    stats.languages = languages;
    if (languages.length > 0) {
      const languageFiles = languages.reduce((sum, l) => sum + l.files, 0);
      stats.filesScanned = Math.max(stats.filesScanned, languageFiles);
    }

    return {
      results,
      issues: uniqueIssues,
      stats,
      summary: this.generateSummary(results, uniqueIssues, stats)
    };
  }

  deduplicateIssues(issues) {
    const seen = new Set();
    const unique = [];

    issues.forEach(issue => {
      const key = `${issue.file}:${issue.line}:${issue.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      }
    });

    return unique;
  }

  // File counts per language across the whole project, as percentages
  async calculateLanguageStats(dirPath, options = {}) {
    const ignoreDirs = (options.ignore || options.ignoreDirs ||
      'node_modules,dist,.git,coverage,__pycache__,vendor,target,build').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);
    const patterns = Object.keys(LANGUAGE_BY_EXT).map(ext => `**/*${ext}`);

    let files = [];
    try {
      files = await glob(patterns, {
        cwd: dirPath,
        ignore: ignorePatterns,
        absolute: false
      });
    } catch (err) {
      return [];
    }

    const counts = {};
    files.forEach(file => {
      const lang = LANGUAGE_BY_EXT[path.extname(file)];
      if (lang) counts[lang] = (counts[lang] || 0) + 1;
    });

    const total = files.length || 1;
    const languages = Object.entries(counts)
      .map(([language, fileCount]) => ({
        language,
        files: fileCount,
        percent: Math.round((fileCount / total) * 100)
      }))
      .sort((a, b) => b.files - a.files);

    // Make sure the percentages add up to exactly 100
    if (languages.length > 0) {
      const drift = 100 - languages.reduce((sum, l) => sum + l.percent, 0);
      languages[0].percent += drift;
    }

    return languages;
  }

  calculateStats(results, issues) {
    const stats = {
      totalIssues: issues.length,
      errors: issues.filter(i => i.severity === 'ERROR').length,
      warnings: issues.filter(i => i.severity === 'WARNING').length,
      info: issues.filter(i => i.severity === 'INFO').length,
      bySource: {},
      byType: {},
      filesScanned: 0
    };

    // Two-signal method: every scan reports its bidirectional trace totals
    const signalTracing = results.connectivity?.stats?.signalTracing;
    if (signalTracing) {
      stats.signalTracing = signalTracing;
    }

    // Count by source
    issues.forEach(issue => {
      stats.bySource[issue.source] = (stats.bySource[issue.source] || 0) + 1;
      stats.byType[issue.type] = (stats.byType[issue.type] || 0) + 1;
    });

    // Get files scanned from results
    Object.values(results).forEach(result => {
      if (result.stats?.filesScanned) {
        stats.filesScanned = Math.max(stats.filesScanned, result.stats.filesScanned);
      }
    });

    return stats;
  }

  generateSummary(results, issues, stats) {
    const W = 62; // content width between the box borders
    const row = (content) => `║${content.padEnd(W)}║`;
    const sep = `╠${'═'.repeat(W)}╣`;
    // Key/value line: label left, value right-aligned at the same column
    const kv = (label, value) =>
      `  ${label.padEnd(40)}${String(value).padStart(19)} `;
    // Indented (sub-row) variant, values still flush right at the same column
    const sub = (label, value) =>
      `    ${label.padEnd(38)}${String(value).padStart(19)} `;
    const center = (text) => ' '.repeat(Math.max(0, Math.floor((W - text.length) / 2))) + text;
    const pctBar = (percent) => {
      const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
      return '█'.repeat(filled) + '░'.repeat(10 - filled);
    };

    const lines = [];
    lines.push(`╔${'═'.repeat(W)}╗`);
    lines.push(row(center('TWOtails Analysis Summary')));
    lines.push(sep);
    lines.push(row(kv('Files Scanned', stats.filesScanned)));
    lines.push(row(kv('Total Issues', stats.totalIssues)));
    lines.push(row(kv('Errors', stats.errors)));
    lines.push(row(kv('Warnings', stats.warnings)));
    lines.push(row(kv('Info', stats.info)));

    lines.push(sep);
    lines.push(row('  Issues by Category:'));
    Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
      lines.push(row(sub(this.getAnalyzerLabel(source), count)));
    });

    lines.push(sep);
    lines.push(row('  Language Breakdown:'));
    if (stats.languages && stats.languages.length > 0) {
      stats.languages.forEach(lang => {
        const files = String(lang.files).padStart(4);
        const unit = (lang.files === 1 ? 'file' : 'files').padEnd(6);
        const percent = `${lang.percent}%`.padStart(4);
        lines.push(row(`    ${lang.language.padEnd(30)}${pctBar(lang.percent)}  ${files} ${unit}${percent} `));
      });
    } else {
      lines.push(row('    No source files found'));
    }

    lines.push(sep);
    lines.push(row('  Signal Tracing (bidirectional two-signal method):'));
    if (stats.signalTracing) {
      const st = stats.signalTracing;
      lines.push(row(sub('Senders', st.senders)));
      lines.push(row(sub('Receivers', st.receivers)));
      lines.push(row(sub('Connected', st.connected)));
      lines.push(row(sub('Broken', st.broken)));
      lines.push(row(sub('Unused Imports', st.unusedImports ?? 0)));
    } else {
      lines.push(row('    Signal tracing unavailable'));
    }

    lines.push(sep);
    lines.push(row('  Top Issue Types:'));
    Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([type, count]) => {
        lines.push(row(sub(type, count)));
      });

    lines.push(`╚${'═'.repeat(W)}╝`);

    return lines.join('\n');
  }

  getAnalyzerLabel(source) {
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
      multiLanguage: 'Multi-Language',
      signals: 'Signal Tracing'
    };
    return labels[source] || source;
  }
}

module.exports = { MasterAnalyzer };
