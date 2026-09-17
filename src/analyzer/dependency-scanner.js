/**
 * TWOtails Dependency Scanner
 * Checks npm packages for vulnerabilities and outdated versions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Known vulnerable packages (examples - in production, use a real vulnerability database)
const KNOWN_VULNERABILITIES = {
  'minimist': { versions: '<1.2.6', severity: 'HIGH', issue: 'Prototype pollution' },
  'node-fetch': { versions: '<2.6.7', severity: 'HIGH', issue: 'Information exposure' },
  'glob-parent': { versions: '<5.1.2', severity: 'HIGH', issue: 'ReDoS vulnerability' },
  'trim': { versions: '<0.0.3', severity: 'HIGH', issue: 'ReDoS vulnerability' },
  'marked': { versions: '<4.0.10', severity: 'HIGH', issue: 'ReDoS vulnerability' },
  'qs': { versions: '<6.5.3', severity: 'HIGH', issue: 'Prototype pollution' },
  'express': { versions: '<4.18.2', severity: 'MEDIUM', issue: 'Open redirect' },
  'jsonwebtoken': { versions: '<9.0.0', severity: 'HIGH', issue: 'Insecure key handling' },
  'lodash': { versions: '<4.17.21', severity: 'HIGH', issue: 'Prototype pollution' },
  'axios': { versions: '<0.21.1', severity: 'HIGH', issue: 'SSRF vulnerability' },
  'webpack-dev-middleware': { versions: '<5.3.4', severity: 'HIGH', issue: 'Path traversal' },
  'cookie': { versions: '<0.7.0', severity: 'MEDIUM', issue: 'Out of bounds read' },
  'body-parser': { versions: '<1.20.3', severity: 'HIGH', issue: 'DoS vulnerability' },
  'multer': { versions: '<1.4.5-lts.1', severity: 'HIGH', issue: 'Path traversal' }
};

// Deprecated packages
const DEPRECATED_PACKAGES = {
  'request': 'Use node-fetch or axios instead',
  'moment': 'Use date-fns or dayjs instead',
  'bluebird': 'Use native Promises instead',
  'node-uuid': 'Use crypto.randomUUID() instead',
  'mkdirp': 'Use fs.mkdirSync({ recursive: true }) instead',
  'rimraf': 'Use fs.rmSync({ recursive: true }) instead',
  'glob': 'Use fs.globSync() or fast-glob instead',
  'chalk': 'Use picocolors or kleur instead (smaller bundle)',
  'inquirer': 'Use @inquirer/prompts instead',
  'dotenv': 'Use built-in process.env or .env.local'
};

class DependencyScanner {
  constructor() {
    this.issues = [];
    this.packages = new Map();
    this.stats = {
      filesScanned: 0,
      packagesFound: 0,
      vulnerabilities: 0,
      outdated: 0,
      deprecated: 0
    };
  }

  async scanDirectory(dirPath, options = {}) {
    // Scan package.json files
    await this.scanPackageJson(dirPath);

    // Try to run npm audit if available
    if (!options.skipAudit) {
      await this.runNpmAudit(dirPath);
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'HIGH' || i.severity === 'CRITICAL').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'MEDIUM' || i.severity === 'LOW').length;

    return {
      issues: this.issues,
      packages: Array.from(this.packages.values()),
      stats: this.stats
    };
  }

  async scanPackageJson(dirPath) {
    const { glob } = require('glob');
    const files = await glob('**/package.json', {
      cwd: dirPath,
      ignore: ['node_modules/**', 'dist/**'],
      absolute: true
    });

    for (const file of files) {
      try {
        this.analyzePackageJson(file);
      } catch (err) {
        // Skip invalid JSON
      }
    }
  }

  analyzePackageJson(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;

    try {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies
      };

      for (const [name, version] of Object.entries(allDeps)) {
        this.packages.set(name, {
          name,
          version,
          file: filePath,
          isDev: !!pkg.devDependencies?.[name],
          isPeer: !!pkg.peerDependencies?.[name]
        });

        this.stats.packagesFound++;

        // Check for known vulnerabilities
        this.checkVulnerability(name, version, filePath);

        // Check for deprecated packages
        this.checkDeprecated(name, filePath);
      }
    } catch (err) {
      // Skip invalid JSON
    }
  }

  checkVulnerability(name, version, filePath) {
    const vuln = KNOWN_VULNERABILITIES[name];
    if (vuln) {
      this.issues.push({
        file: filePath,
        line: 0,
        type: 'VULNERABLE_DEPENDENCY',
        severity: vuln.severity,
        message: `Package "${name}" has known vulnerability: ${vuln.issue}`,
        suggestion: `Update "${name}" to version ${vuln.versions.replace('<', '>=')}`,
        package: name,
        version
      });
      this.stats.vulnerabilities++;
    }
  }

  checkDeprecated(name, filePath) {
    const reason = DEPRECATED_PACKAGES[name];
    if (reason) {
      this.issues.push({
        file: filePath,
        line: 0,
        type: 'DEPRECATED_PACKAGE',
        severity: 'WARNING',
        message: `Package "${name}" is deprecated`,
        suggestion: reason,
        package: name
      });
      this.stats.deprecated++;
    }
  }

  async runNpmAudit(dirPath) {
    try {
      const result = execSync('npm audit --json 2>/dev/null', {
        cwd: dirPath,
        timeout: 30000,
        encoding: 'utf8'
      });

      const audit = JSON.parse(result);

      if (audit.vulnerabilities) {
        for (const [name, info] of Object.entries(audit.vulnerabilities)) {
          if (info.severity === 'critical' || info.severity === 'high') {
            this.issues.push({
              file: path.join(dirPath, 'package.json'),
              line: 0,
              type: 'NPM_AUDIT_VULNERABILITY',
              severity: info.severity.toUpperCase(),
              message: `npm audit: ${name} - ${info.via?.[0]?.title || 'vulnerability'}`,
              suggestion: `Run "npm audit fix" or update "${name}"`,
              package: name
            });
            this.stats.vulnerabilities++;
          }
        }
      }

      if (audit.metadata?.vulnerabilities) {
        const vulns = audit.metadata.vulnerabilities;
        if (vulns.high > 0 || vulns.critical > 0) {
          this.stats.outdated += vulns.high + vulns.critical;
        }
      }
    } catch (err) {
      // npm audit not available or failed
    }
  }

  getTopVulnerable(count = 10) {
    return this.issues
      .filter(i => i.type === 'VULNERABLE_DEPENDENCY' || i.type === 'NPM_AUDIT_VULNERABILITY')
      .sort((a, b) => {
        const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
      })
      .slice(0, count);
  }

  getRecommendations() {
    const recommendations = [];

    if (this.stats.vulnerabilities > 0) {
      recommendations.push({
        type: 'VULNERABILITIES',
        message: `${this.stats.vulnerabilities} vulnerable packages found`,
        suggestion: 'Run "npm audit fix" to auto-fix vulnerabilities'
      });
    }

    if (this.stats.deprecated > 0) {
      recommendations.push({
        type: 'DEPRECATED',
        message: `${this.stats.deprecated} deprecated packages found`,
        suggestion: 'Replace deprecated packages with modern alternatives'
      });
    }

    if (this.stats.packagesFound > 100) {
      recommendations.push({
        type: 'MANY_DEPENDENCIES',
        message: `${this.stats.packagesFound} dependencies found`,
        suggestion: 'Consider reducing dependencies for smaller bundle size'
      });
    }

    return recommendations;
  }
}

module.exports = { DependencyScanner, KNOWN_VULNERABILITIES, DEPRECATED_PACKAGES };
