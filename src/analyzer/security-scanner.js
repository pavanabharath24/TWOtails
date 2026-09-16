/**
 * TWOtails Security Scanner
 * Detects vulnerabilities, secrets, and security issues in AI-generated code
 */

const fs = require('fs');
const path = require('path');

// Secret patterns
const SECRET_PATTERNS = [
  // API Keys
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([A-Za-z0-9_\-]{10,})['"]/i, type: 'API_KEY', severity: 'ERROR' },
  { pattern: /(?:secret[_-]?key|secretkey)\s*[:=]\s*['"]([A-Za-z0-9_\-]{10,})['"]/i, type: 'SECRET_KEY', severity: 'ERROR' },
  { pattern: /(?:access[_-]?token|accesstoken)\s*[:=]\s*['"]([A-Za-z0-9_\-\.]{10,})['"]/i, type: 'ACCESS_TOKEN', severity: 'ERROR' },

  // AWS
  { pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/, type: 'AWS_KEY', severity: 'ERROR' },
  { pattern: /(?:aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*['"]([A-Za-z0-9/+=]{40})['"]/i, type: 'AWS_SECRET', severity: 'ERROR' },

  // Google
  { pattern: /AIza[0-9A-Za-z\-_]{35}/, type: 'GOOGLE_API_KEY', severity: 'ERROR' },
  { pattern: /ya29\.[0-9A-Za-z\-_]+/, type: 'GOOGLE_OAUTH_TOKEN', severity: 'ERROR' },

  // GitHub
  { pattern: /ghp_[A-Za-z0-9]{36}/, type: 'GITHUB_TOKEN', severity: 'ERROR' },
  { pattern: /gho_[A-Za-z0-9]{36}/, type: 'GITHUB_OAUTH_TOKEN', severity: 'ERROR' },
  { pattern: /github_pat_[A-Za-z0-9_]{82}/, type: 'GITHUB_PAT', severity: 'ERROR' },

  // Slack
  { pattern: /xox[bporas]-[0-9]{10,13}-[0-9a-zA-Z\-]{24,}/, type: 'SLACK_TOKEN', severity: 'ERROR' },

  // Stripe
  { pattern: /sk_live_[0-9a-zA-Z]{24,}/, type: 'STRIPE_SECRET_KEY', severity: 'ERROR' },
  { pattern: /pk_live_[0-9a-zA-Z]{24,}/, type: 'STRIPE_PUBLIC_KEY', severity: 'WARNING' },

  // Generic private key
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, type: 'PRIVATE_KEY', severity: 'ERROR' },

  // Connection strings
  { pattern: /(?:mysql|postgres|postgresql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@[^/\s]+/i, type: 'CONNECTION_STRING', severity: 'ERROR' },

  // Password in code
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{6,})['"]/i, type: 'HARDCODED_PASSWORD', severity: 'ERROR' },

  // JWT
  { pattern: /eyJ[A-Za-z0-9_\-]*\.eyJ[A-Za-z0-9_\-]*\.[A-Za-z0-9_\-]+/, type: 'JWT_TOKEN', severity: 'ERROR' }
];

// Vulnerability patterns
const VULNERABILITY_PATTERNS = [
  // SQL Injection
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*/i, type: 'SQL_INJECTION', severity: 'ERROR', message: 'SQL query with string concatenation (SQL injection risk)' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\$\{[^}]*\}/i, type: 'SQL_INJECTION', severity: 'ERROR', message: 'SQL query with template literal (SQL injection risk)' },
  { pattern: /(?:query|execute|exec)\s*\(\s*['"`].*\+\s*/i, type: 'SQL_INJECTION', severity: 'ERROR', message: 'SQL query with string concatenation' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\$\{/, type: 'SQL_INJECTION', severity: 'ERROR', message: 'SQL query with template literal (SQL injection risk)' },

  // XSS
  { pattern: /innerHTML\s*=\s*/, type: 'XSS', severity: 'WARNING', message: 'innerHTML usage (potential XSS)' },
  { pattern: /outerHTML\s*=\s*/, type: 'XSS', severity: 'WARNING', message: 'outerHTML usage (potential XSS)' },
  { pattern: /document\.write\s*\(/, type: 'XSS', severity: 'WARNING', message: 'document.write (potential XSS)' },
  { pattern: /(?:v-html|dangerouslySetInnerHTML)\s*=/i, type: 'XSS', severity: 'WARNING', message: 'HTML injection directive (potential XSS)' },

  // Command Injection
  { pattern: /(?:exec|execSync|spawn|spawnSync|execFile)\s*\(\s*(?:req|request|params|query|body)/i, type: 'COMMAND_INJECTION', severity: 'ERROR', message: 'Command execution with user input' },
  { pattern: /child_process\s*\.\s*(?:exec|spawn)\s*\(/, type: 'COMMAND_INJECTION', severity: 'WARNING', message: 'Child process execution detected' },

  // Path Traversal
  { pattern: /(?:readFile|readFileSync|createReadStream)\s*\(\s*(?:req|request|params|query|body)/i, type: 'PATH_TRAVERSAL', severity: 'ERROR', message: 'File read with user input (path traversal risk)' },
  { pattern: /(?:writeFile|writeFileSync|createWriteStream)\s*\(\s*(?:req|request|params|query|body)/i, type: 'PATH_TRAVERSAL', severity: 'ERROR', message: 'File write with user input (path traversal risk)' },

  // Insecure Crypto
  { pattern: /(?:md5|sha1)\s*\(/i, type: 'WEAK_CRYPTO', severity: 'WARNING', message: 'Weak hashing algorithm (use SHA-256+)' },
  { pattern: /Math\.random\s*\(\s*\)/, type: 'WEAK_RANDOM', severity: 'WARNING', message: 'Math.random() is not cryptographically secure' },

  // Missing CSRF Protection
  { pattern: /(?:app|router)\s*\.\s*post\s*\(/, type: 'CSRF', severity: 'INFO', message: 'POST route without CSRF protection check' },

  // Insecure CORS
  { pattern: /(?:Access-Control-Allow-Origin|cors)\s*\(\s*\{[^}]*origin\s*:\s*(?:true|['"]\*['"])/i, type: 'INSECURE_CORS', severity: 'WARNING', message: 'Permissive CORS configuration' },

  // Missing Rate Limiting
  { pattern: /(?:app|router)\s*\.\s*(?:post|put|delete)\s*\(/, type: 'RATE_LIMIT', severity: 'INFO', message: 'Mutation route without rate limiting check' }
];

// Common AI security mistakes
const AI_SECURITY_MISTAKES = [
  { pattern: /(?:const|let|var)\s+\w+\s*=\s*(?:JSON\.parse|eval|Function)\s*\(\s*(?:req|request|params|query|body)/, message: 'Parsing/evaluating user input without validation', severity: 'ERROR' },
  { pattern: /(?:const|let|var)\s+\w+\s*=\s*(?:new\s+Function|eval)\s*\(/, message: 'Dynamic code execution (potential code injection)', severity: 'ERROR' },
  { pattern: /(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*(?:req|request|params|query|body)/, message: 'Dynamic require with user input', severity: 'ERROR' },
  { pattern: /(?:process\.env|ENV)\s*\.\s*(\w+)\s*(?::|=)\s*(?:req|request|params|query|body)/, message: 'Setting environment variable from user input', severity: 'ERROR' },
  { pattern: /(?:const|let|var)\s+\w+\s*=\s*(?:req|request|params|query|body)/, message: 'Direct use of user input without sanitization', severity: 'WARNING' }
];

class SecurityScanner {
  constructor() {
    this.issues = [];
    this.secrets = [];
    this.stats = {
      filesScanned: 0,
      secrets: 0,
      vulnerabilities: 0,
      aiSecurityMistakes: 0
    };
  }

  async scanDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    // Also skip common non-code files
    const files = await glob('**/*.{js,jsx,ts,tsx,py,rb,go,java,php,env,config,yaml,yml,toml,ini,xml,json}', {
      cwd: dirPath,
      ignore: [...ignorePatterns, '**/*.min.js', '**/*.map'],
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

    return {
      issues: this.issues,
      secrets: this.secrets,
      stats: this.stats
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    this.stats.filesScanned++;

    lines.forEach((line, idx) => {
      this.checkForSecrets(filePath, line, idx + 1);
      this.checkForVulnerabilities(filePath, line, idx + 1);
      this.checkForAISecurityMistakes(filePath, line, idx + 1);
    });
  }

  checkForSecrets(filePath, line, lineNum) {
    // Skip comments and test files
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) return;
    if (filePath.includes('.test.') || filePath.includes('.spec.')) return;
    if (filePath.includes('__tests__')) return;

    SECRET_PATTERNS.forEach(check => {
      const match = line.match(check.pattern);
      if (match) {
        const secret = match[1] || match[0];
        const masked = secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);

        this.secrets.push({
          file: filePath,
          line: lineNum,
          type: check.type,
          severity: check.severity,
          masked: masked,
          line: line.trim()
        });

        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'SECRET_DETECTED',
          severity: check.severity,
          message: `${check.type} detected in code`,
          suggestion: `Move secret to environment variable`,
          secretType: check.type
        });

        this.stats.secrets++;
      }
    });
  }

  checkForVulnerabilities(filePath, line, lineNum) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    VULNERABILITY_PATTERNS.forEach(check => {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: this.getVulnerabilitySuggestion(check.type)
        });
        this.stats.vulnerabilities++;
      }
    });
  }

  checkForAISecurityMistakes(filePath, line, lineNum) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    AI_SECURITY_MISTAKES.forEach(check => {
      if (check.pattern.test(line)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'AI_SECURITY_MISTAKE',
          severity: check.severity,
          message: check.message,
          suggestion: 'Validate and sanitize all user input'
        });
        this.stats.aiSecurityMistakes++;
      }
    });
  }

  getVulnerabilitySuggestion(type) {
    const suggestions = {
      'SQL_INJECTION': 'Use parameterized queries or prepared statements',
      'XSS': 'Sanitize output and use textContent instead of innerHTML',
      'COMMAND_INJECTION': 'Use execFile with fixed arguments or validate input strictly',
      'PATH_TRAVERSAL': 'Validate and sanitize file paths, use path.resolve with base directory',
      'WEAK_CRYPTO': 'Use SHA-256 or stronger hashing algorithms',
      'WEAK_RANDOM': 'Use crypto.randomBytes() for security-sensitive random values',
      'CSRF': 'Add CSRF token validation to mutation routes',
      'INSECURE_CORS': 'Restrict CORS to specific trusted origins',
      'RATE_LIMIT': 'Add rate limiting middleware to prevent abuse'
    };
    return suggestions[type] || 'Review security implications';
  }
}

module.exports = { SecurityScanner, SECRET_PATTERNS, VULNERABILITY_PATTERNS };
