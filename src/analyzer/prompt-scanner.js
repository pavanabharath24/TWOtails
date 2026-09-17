/**
 * TWOtails AI Prompt Scanner
 * Detects prompt injection, jailbreak patterns, unsafe system prompts
 */

const fs = require('fs');
const path = require('path');

// Prompt injection patterns
const INJECTION_PATTERNS = [
  // Direct injection attempts
  { pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts|rules|constraints)/i, type: 'PROMPT_INJECTION', severity: 'ERROR', message: 'Prompt injection: attempting to ignore previous instructions' },
  { pattern: /(?:you\s+are\s+now|from\s+now\s+on|act\s+as\s+if|pretend\s+you\s+are|roleplay\s+as)/i, type: 'PROMPT_INJECTION', severity: 'ERROR', message: 'Prompt injection: attempting to change AI behavior' },
  { pattern: /(?:system\s*:\s*|<\|system\|>|<\|im_start\|>system)/i, type: 'PROMPT_INJECTION', severity: 'ERROR', message: 'Prompt injection: system prompt manipulation' },
  { pattern: /(?:jailbreak|dan\s+mode|developer\s+mode|god\s+mode)/i, type: 'JAILBREAK', severity: 'ERROR', message: 'Jailbreak attempt detected' },
  { pattern: /(?:ignore\s+safety|bypass\s+(?:safety|filter|moderation)|disable\s+(?:filter|moderation|safety))/i, type: 'JAILBREAK', severity: 'ERROR', message: 'Jailbreak: attempting to bypass safety filters' },

  // Data extraction attempts
  { pattern: /(?:show\s+me\s+(?:your|the)\s+(?:system\s+prompt|instructions|rules|constraints))/i, type: 'DATA_EXTRACTION', severity: 'WARNING', message: 'Data extraction: attempting to reveal system prompt' },
  { pattern: /(?:what\s+(?:are|is)\s+your\s+(?:system\s+prompt|instructions|rules))/i, type: 'DATA_EXTRACTION', severity: 'WARNING', message: 'Data extraction: asking for system prompt' },
  { pattern: /(?:repeat\s+(?:everything|all|the)\s+(?:above|before|from))/i, type: 'DATA_EXTRACTION', severity: 'WARNING', message: 'Data extraction: attempting to repeat previous context' },

  // Unsafe patterns in prompts
  { pattern: /(?:exec|eval|Function)\s*\(\s*(?:user|input|request|prompt)/i, type: 'UNSAFE_EXECUTION', severity: 'ERROR', message: 'Unsafe code execution from user input' },
  { pattern: /(?:innerHTML|outerHTML|document\.write)\s*=\s*(?:user|input|request|prompt)/i, type: 'UNSAFE_DOM', severity: 'ERROR', message: 'Unsafe DOM manipulation from user input' },
  { pattern: /(?:fetch|axios|request)\s*\(\s*(?:user|input|request|prompt)/i, type: 'UNSAFE_REQUEST', severity: 'WARNING', message: 'Request to user-controlled URL' },

  // Prompt leakage patterns
  { pattern: /(?:print|output|return|echo)\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|message|instruction)/i, type: 'PROMPT_LEAKAGE', severity: 'WARNING', message: 'Prompt leakage attempt' },
  { pattern: /(?:what\s+was\s+(?:your|the)\s+(?:first|initial|original)\s+(?:message|prompt|instruction))/i, type: 'PROMPT_LEAKAGE', severity: 'WARNING', message: 'Prompt leakage: asking for initial prompt' },

  // Role manipulation
  { pattern: /(?:you\s+are\s+no\s+longer|stop\s+being|forget\s+you\s+are)/i, type: 'ROLE_MANIPULATION', severity: 'WARNING', message: 'Role manipulation: attempting to change AI identity' },
  { pattern: /(?:hypothetically|in\s+a\s+fictional|for\s+entertainment|just\s+imagine)/i, type: 'HYPOTHETICAL_BYPASS', severity: 'INFO', message: 'Hypothetical bypass pattern detected' }
];

// Unsafe system prompt patterns
const UNSAFE_SYSTEM_PROMPTS = [
  { pattern: /(?:do\s+anything|no\s+restrictions|no\s+limitations|unfiltered)/i, type: 'UNRESTRICTED_PROMPT', severity: 'ERROR', message: 'Unrestricted system prompt - no safety guardrails' },
  { pattern: /(?:you\s+have\s+no\s+(?:rules|restrictions|limitations|boundaries))/i, type: 'UNRESTRICTED_PROMPT', severity: 'ERROR', message: 'System prompt removes safety constraints' },
  { pattern: /(?:always\s+(?:obey|comply|follow)\s+(?:all\s+)?(?:instructions|commands|orders))/i, type: 'OVERCOMPLIANT_PROMPT', severity: 'WARNING', message: 'Over-compliant system prompt - may follow malicious instructions' },
  { pattern: /(?:never\s+(?:refuse|say\s+no|decline|reject))/i, type: 'OVERCOMPLIANT_PROMPT', severity: 'WARNING', message: 'System prompt prevents AI from refusing harmful requests' }
];

class AIPromptScanner {
  constructor() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      injections: 0,
      jailbreaks: 0,
      dataExtraction: 0,
      unsafePatterns: 0,
      unsafePrompts: 0
    };
  }

  async scanDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx,json,md,txt,yaml,yml,env}', {
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

    return {
      issues: this.issues,
      stats: this.stats
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    this.stats.filesScanned++;

    // Scan for prompt injection patterns
    INJECTION_PATTERNS.forEach(check => {
      if (check.pattern.test(content)) {
        this.issues.push({
          file: filePath,
          line: this.findLineNumber(content, check.pattern),
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: this.getSuggestion(check.type)
        });
        this.updateStats(check.type);
      }
    });

    // Scan for unsafe system prompts (JSON config files)
    if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
      UNSAFE_SYSTEM_PROMPTS.forEach(check => {
        if (check.pattern.test(content)) {
          this.issues.push({
            file: filePath,
            line: 0,
            type: check.type,
            severity: check.severity,
            message: check.message,
            suggestion: 'Add safety guardrails to system prompt'
          });
          this.stats.unsafePrompts++;
        }
      });
    }
  }

  findLineNumber(content, pattern) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  updateStats(type) {
    switch (type) {
      case 'PROMPT_INJECTION':
      case 'SYSTEM_PROMPT_MANIPULATION':
        this.stats.injections++;
        break;
      case 'JAILBREAK':
        this.stats.jailbreaks++;
        break;
      case 'DATA_EXTRACTION':
      case 'PROMPT_LEAKAGE':
        this.stats.dataExtraction++;
        break;
      default:
        this.stats.unsafePatterns++;
    }
  }

  getSuggestion(type) {
    const suggestions = {
      'PROMPT_INJECTION': 'Sanitize user input before including in prompts',
      'JAILBREAK': 'Implement input filtering for jailbreak patterns',
      'DATA_EXTRACTION': 'Add instructions to never reveal system prompts',
      'UNSAFE_EXECUTION': 'Never execute user input as code',
      'UNSAFE_DOM': 'Sanitize user input before DOM manipulation',
      'UNSAFE_REQUEST': 'Validate and whitelist allowed URLs',
      'PROMPT_LEAKAGE': 'Add instructions to never repeat system prompts',
      'ROLE_MANIPULATION': 'Add instructions to maintain consistent identity',
      'HYPOTHETICAL_BYPASS': 'Add instructions to not play along with hypothetical bypasses',
      'UNRESTRICTED_PROMPT': 'Add safety guardrails and content policies',
      'OVERCOMPLIANT_PROMPT': 'Allow AI to refuse harmful requests'
    };
    return suggestions[type] || 'Review and fix';
  }
}

module.exports = { AIPromptScanner, INJECTION_PATTERNS, UNSAFE_SYSTEM_PROMPTS };
