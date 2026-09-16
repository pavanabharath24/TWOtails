/**
 * TWOtails Master Analyzer
 * Combines all analyzers into one comprehensive scan
 */

const { LineByLineAnalyzer } = require('./line-analyzer');
const { DatabaseAnalyzer } = require('./database-analyzer');
const { APIRouteAnalyzer } = require('./api-analyzer');
const { AICodeQualityScanner } = require('./ai-quality-scanner');
const { SecurityScanner } = require('./security-scanner');
const { EnvironmentAnalyzer } = require('./env-analyzer');

class MasterAnalyzer {
  constructor() {
    this.analyzers = {
      connectivity: new LineByLineAnalyzer(),
      database: new DatabaseAnalyzer(),
      api: new APIRouteAnalyzer(),
      aiQuality: new AICodeQualityScanner(),
      security: new SecurityScanner(),
      environment: new EnvironmentAnalyzer()
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const results = {};
    const allIssues = [];

    // Run all analyzers
    const analyzerNames = Object.keys(this.analyzers);

    for (const name of analyzerNames) {
      try {
        const analyzer = this.analyzers[name];
        let result;

        if (name === 'aiQuality' || name === 'security') {
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

    // Calculate summary stats
    const stats = this.calculateStats(results, uniqueIssues);

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
    const lines = [];
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              TWOtails Analysis Summary                      ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║  Files Scanned:     ${String(stats.filesScanned).padEnd(38)}║`);
    lines.push(`║  Total Issues:      ${String(stats.totalIssues).padEnd(38)}║`);
    lines.push(`║  Errors:            ${String(stats.errors).padEnd(38)}║`);
    lines.push(`║  Warnings:          ${String(stats.warnings).padEnd(38)}║`);
    lines.push(`║  Info:              ${String(stats.info).padEnd(38)}║`);
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  Issues by Category:                                         ║');

    Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
      const label = this.getAnalyzerLabel(source);
      lines.push(`║    ${label.padEnd(22)} ${String(count).padEnd(33)}║`);
    });

    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║  Top Issue Types:                                            ║');

    Object.entries(stats.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([type, count]) => {
        lines.push(`║    ${type.padEnd(22)} ${String(count).padEnd(33)}║`);
      });

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }

  getAnalyzerLabel(source) {
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
}

module.exports = { MasterAnalyzer };
