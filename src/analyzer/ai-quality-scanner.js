/**
 * TWOtails AI Code Quality Scanner
 * Detects common mistakes made by AI code generators
 */

const fs = require('fs');
const path = require('path');

// Common AI hallucinations and mistakes
const AI_HALLUCINATIONS = {
  // Fake packages that don't exist
  fakePackages: [
    'react-utils-pro', 'react-helpers-extended', 'react-hooks-pro',
    'next-utils', 'next-helpers', 'next-auth-pro',
    'express-utils-pro', 'express-helpers-extended',
    'mongoose-utils', 'sequelize-utils-pro',
    'axios-utils-pro', 'fetch-utils-pro'
  ],

  // Deprecated or wrong patterns
  deprecatedPatterns: [
    { pattern: /componentWillMount\s*\(/, replacement: 'componentDidMount or useEffect', framework: 'React' },
    { pattern: /componentWillReceiveProps\s*\(/, replacement: 'componentDidUpdate or useEffect', framework: 'React' },
    { pattern: /componentWillUpdate\s*\(/, replacement: 'componentDidUpdate or useLayoutEffect', framework: 'React' },
    { pattern: /UNSAFE_componentWillMount\s*\(/, replacement: 'useEffect', framework: 'React' },
    { pattern: /UNSAFE_componentWillReceiveProps\s*\(/, replacement: 'useEffect', framework: 'React' },
    { pattern: /UNSAFE_componentWillUpdate\s*\(/, replacement: 'useLayoutEffect', framework: 'React' },
    { pattern: /ReactDOM\.render\s*\(/, replacement: 'createRoot().render()', framework: 'React' },
    { pattern: /react-dom\/client/, replacement: null, framework: 'React', info: 'This is the correct import for React 18+' }
  ],

  // Wrong framework patterns
  wrongPatterns: [
    { pattern: /import\s+\{[^}]*\}\s+from\s+['"]vue['"]/, message: 'Vue import in non-Vue project', framework: 'Vue' },
    { pattern: /import\s+\{[^}]*\}\s+from\s+['"]svelte['"]/, message: 'Svelte import in non-Svelte project', framework: 'Svelte' },
    { pattern: /import\s+.*from\s+['"]angular\/core['"]/, message: 'Angular import in non-Angular project', framework: 'Angular' }
  ],

  // Common AI mistakes
  commonMistakes: [
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*await\s+fetch\s*\([^)]*\)(?!\s*\.json)/, message: 'fetch() result not converted to JSON', severity: 'WARNING' },
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*await\s+fetch\s*\([^)]*\)\s*\.json\s*\(\s*\)(?!\s*\.)/, message: 'JSON response not checked for errors', severity: 'INFO' },
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*await\s+.*\.json\s*\(\s*\)/, message: 'Missing error handling for JSON parse', severity: 'INFO' },
    { pattern: /catch\s*\(\s*\w*\s*\)\s*\{[\s]*\}/, message: 'Empty catch block swallows errors', severity: 'ERROR' },
    { pattern: /(?:async|await).*\bcatch\b\s*\(\s*\w*\s*\)\s*\{\s*\/\/.*\}/, message: 'Catch block only contains comment', severity: 'WARNING' },
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*new\s+Promise\s*\(\s*\(\s*(?:resolve|reject)\s*\)\s*=>\s*\{\s*\}\s*\)/, message: 'Promise constructor with empty executor', severity: 'ERROR' },
    { pattern: /setTimeout\s*\(\s*function\s*\(\s*\)\s*\{\s*\}\s*,\s*\d+\s*\)/, message: 'setTimeout with empty function', severity: 'WARNING' },
    { pattern: /setInterval\s*\(\s*function\s*\(\s*\)\s*\{\s*\}\s*,\s*\d+\s*\)/, message: 'setInterval with empty function', severity: 'WARNING' },
    { pattern: /(?:const|let|var)\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/, message: 'Empty arrow function', severity: 'INFO' },
    { pattern: /console\.(?:log|debug|info|warn|error)\s*\(\s*['"]?debug['"]?\s*\)/i, message: 'Debug console statement left in code', severity: 'WARNING' }
  ],

  // Security issues from AI code
  securityIssues: [
    { pattern: /(?:innerHTML|outerHTML)\s*=\s*(?:req|request|params|query|body)/, message: 'Direct DOM injection from user input (XSS)', severity: 'ERROR' },
    { pattern: /(?:eval|Function)\s*\(\s*(?:req|request|params|query|body)/, message: 'Code execution from user input', severity: 'ERROR' },
    { pattern: /document\.(?:write|writeln)\s*\(\s*(?:req|request|params|query|body)/, message: 'Document write from user input', severity: 'ERROR' },
    { pattern: /(?:password|secret|token|key)\s*[:=]\s*['"][^'"]+['"]/i, message: 'Hardcoded secret/credential', severity: 'ERROR' },
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/i, message: 'Hardcoded API key', severity: 'ERROR' },
    { pattern: /(?:mysql|postgres|mongo|redis):\/\/[^'"]+:[^'"]+@/, message: 'Database connection string with credentials', severity: 'ERROR' }
  ],

  // Performance issues
  performanceIssues: [
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*\[\s*\](?:\s*;|\s*$)/, message: 'Array declared but may grow unbounded', severity: 'INFO' },
    { pattern: /for\s*\(\s*(?:let|var)\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(?:\w+\.)?(?:length|size)\s*;.*\)\s*\{[^}]*await/, message: 'Sequential await in loop (consider Promise.all)', severity: 'WARNING' },
    { pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/, message: 'Deep clone via JSON (slow for large objects)', severity: 'INFO' },
    { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*.*\.map\s*\(\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>\s*\{[^}]*await[^}]*\}\s*\)(?:\s*;|\s*$)/, message: 'map with async callback (use Promise.all)', severity: 'WARNING' }
  ]
};

class AICodeQualityScanner {
  constructor() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      hallucinations: 0,
      deprecated: 0,
      security: 0,
      performance: 0,
      commonMistakes: 0
    };
  }

  async scanDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx,json}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    for (const file of files) {
      try {
        this.scanFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;
    this.stats.info = this.issues.filter(i => i.severity === 'INFO').length;

    return {
      issues: this.issues,
      stats: this.stats
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);

    this.stats.filesScanned++;

    // Check package.json for fake packages
    if (ext === '.json' && filePath.includes('package.json')) {
      this.checkPackageJson(filePath, content);
      return;
    }

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const nextLine = idx < lines.length - 1 ? lines[idx + 1] : '';
      this.checkLine(filePath, line, idx + 1, nextLine);
    });
  }

  checkPackageJson(filePath, content) {
    try {
      const pkg = JSON.parse(content);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies
      };

      AI_HALLUCINATIONS.fakePackages.forEach(fakePkg => {
        if (allDeps[fakePkg]) {
          this.issues.push({
            file: filePath,
            line: 0,
            type: 'FAKE_PACKAGE',
            severity: 'ERROR',
            message: `Package "${fakePkg}" does not exist on npm`,
            suggestion: `Remove "${fakePkg}" from dependencies`,
            package: fakePkg
          });
          this.stats.hallucinations++;
        }
      });
    } catch (err) {
      // Invalid JSON
    }
  }

  checkLine(filePath, line, lineNum, nextLine) {
    // Check for deprecated patterns
    AI_HALLUCINATIONS.deprecatedPatterns.forEach(check => {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEPRECATED_PATTERN',
          severity: 'WARNING',
          message: `Deprecated ${check.framework} pattern: ${check.replacement ? `use ${check.replacement}` : check.info || 'check usage'}`,
          suggestion: check.replacement || 'Review usage',
          framework: check.framework
        });
        this.stats.deprecated++;
      }
    });

    // Check for common mistakes
    AI_HALLUCINATIONS.commonMistakes.forEach(check => {
      if (check.pattern.test(line) || (nextLine && check.pattern.test(line + ' ' + nextLine))) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'COMMON_MISTAKE',
          severity: check.severity,
          message: check.message,
          suggestion: this.getMistakeSuggestion(check.message)
        });
        this.stats.commonMistakes++;
      }
    });

    // Check for security issues
    AI_HALLUCINATIONS.securityIssues.forEach(check => {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'SECURITY_ISSUE',
          severity: check.severity,
          message: check.message,
          suggestion: this.getSecuritySuggestion(check.message)
        });
        this.stats.security++;
      }
    });

    // Check for performance issues
    AI_HALLUCINATIONS.performanceIssues.forEach(check => {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'PERFORMANCE_ISSUE',
          severity: check.severity,
          message: check.message,
          suggestion: this.getPerformanceSuggestion(check.message)
        });
        this.stats.performance++;
      }
    });
  }

  getMistakeSuggestion(message) {
    const suggestions = {
      'fetch() result not converted to JSON': 'Add .json() after fetch()',
      'JSON response not checked for errors': 'Check response.ok before parsing',
      'Missing error handling for JSON parse': 'Wrap in try/catch',
      'Empty catch block swallows errors': 'Add error logging or rethrow',
      'Catch block only contains comment': 'Handle the error properly',
      'Promise constructor with empty executor': 'Implement the promise logic',
      'setTimeout with empty function': 'Add the callback logic',
      'setInterval with empty function': 'Add the callback logic',
      'Empty arrow function': 'Implement the function body',
      'Debug console statement left in code': 'Remove debug statement'
    };
    return suggestions[message] || 'Review and fix';
  }

  getSecuritySuggestion(message) {
    const suggestions = {
      'Direct DOM injection from user input (XSS)': 'Sanitize input before setting innerHTML',
      'Code execution from user input': 'Never execute user input as code',
      'Document write from user input': 'Use safe DOM manipulation methods',
      'Hardcoded secret/credential': 'Use environment variables for secrets',
      'Hardcoded API key': 'Use environment variables for API keys',
      'Database connection string with credentials': 'Use environment variables for connection strings'
    };
    return suggestions[message] || 'Review security implications';
  }

  getPerformanceSuggestion(message) {
    const suggestions = {
      'Array declared but may grow unbounded': 'Consider using a Map or limiting size',
      'Sequential await in loop (consider Promise.all)': 'Use Promise.all() for parallel execution',
      'Deep clone via JSON (slow for large objects)': 'Use structuredClone() or lodash.cloneDeep()',
      'map with async callback (use Promise.all)': 'Use Promise.all() with map()'
    };
    return suggestions[message] || 'Review performance implications';
  }
}

module.exports = { AICodeQualityScanner, AI_HALLUCINATIONS };
