/**
 * TWOtails Token Counter
 * Counts tokens in code for LLM cost optimization
 * Estimates API costs for OpenAI, Anthropic, Google models
 */

const fs = require('fs');
const path = require('path');

// Token costs per 1M tokens (as of 2024)
const MODEL_COSTS = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'o3-mini': { input: 1.10, output: 4.40 },

  // Anthropic
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.80, output: 4.00 },
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // Google
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.0-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 }
};

// Rough token estimation (1 token ≈ 4 chars for English)
function estimateTokens(text) {
  if (!text) return 0;
  // More accurate estimation considering code
  const words = text.split(/\s+/).length;
  const chars = text.length;
  // Code tends to have more tokens per word
  return Math.ceil(chars / 3.5);
}

// Count actual tokens using simple tokenizer
function countTokens(text) {
  if (!text) return 0;

  let count = 0;
  let i = 0;

  while (i < text.length) {
    // Check for multi-byte sequences
    const code = text.charCodeAt(i);

    // Skip whitespace
    if (code === 32 || code === 9 || code === 10 || code === 13) {
      i++;
      continue;
    }

    // Check for common tokens
    if (code >= 48 && code <= 57) { // Numbers
      let num = '';
      while (i < text.length && text.charCodeAt(i) >= 48 && text.charCodeAt(i) <= 57) {
        num += text[i];
        i++;
      }
      count++;
      continue;
    }

    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) { // Letters
      let word = '';
      while (i < text.length && /[a-zA-Z0-9_]/.test(text[i])) {
        word += text[i];
        i++;
      }
      // Split long words into multiple tokens
      count += Math.ceil(word.length / 4);
      continue;
    }

    // Punctuation and special characters
    count++;
    i++;
  }

  return count;
}

class TokenCounter {
  constructor() {
    this.results = [];
    this.stats = {
      filesScanned: 0,
      totalChars: 0,
      totalTokens: 0,
      totalLines: 0,
      largestFile: { path: '', tokens: 0 },
      averageTokensPerFile: 0
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage,.next').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const extensions = (options.extensions || '.js,.jsx,.ts,.tsx,.json,.md,.css,.html').split(',');
    const pattern = `**/*{${extensions.join(',')}}`;

    const files = await glob(pattern, {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    for (const file of files) {
      try {
        this.analyzeFile(file);
      } catch (err) {
        // Skip unreadable files
      }
    }

    // Calculate stats
    this.stats.averageTokensPerFile = this.stats.filesScanned > 0
      ? Math.round(this.stats.totalTokens / this.stats.filesScanned)
      : 0;

    return {
      results: this.results,
      stats: this.stats,
      costs: this.estimateCosts()
    };
  }

  analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const chars = content.length;
    const tokens = countTokens(content);

    this.stats.filesScanned++;
    this.stats.totalChars += chars;
    this.stats.totalTokens += tokens;
    this.stats.totalLines += lines.length;

    if (tokens > this.stats.largestFile.tokens) {
      this.stats.largestFile = { path: filePath, tokens };
    }

    this.results.push({
      file: filePath,
      chars,
      tokens,
      lines: lines.length,
      tokensPerLine: lines.length > 0 ? Math.round(tokens / lines.length) : 0
    });
  }

  estimateCosts() {
    const costs = {};
    const tokensInMillions = this.stats.totalTokens / 1_000_000;

    for (const [model, pricing] of Object.entries(MODEL_COSTS)) {
      costs[model] = {
        inputCost: (tokensInMillions * pricing.input).toFixed(4),
        outputCost: (tokensInMillions * pricing.output).toFixed(4),
        totalCost: (tokensInMillions * (pricing.input + pricing.output)).toFixed(4)
      };
    }

    return costs;
  }

  getTopFiles(count = 10) {
    return this.results
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, count);
  }

  getRecommendations() {
    const recommendations = [];

    if (this.stats.totalTokens > 100_000) {
      recommendations.push({
        type: 'LARGE_CODEBASE',
        message: `Large codebase (${this.stats.totalTokens.toLocaleString()} tokens)`,
        suggestion: 'Consider splitting into smaller files or using code splitting'
      });
    }

    const largeFiles = this.results.filter(r => r.tokens > 10_000);
    if (largeFiles.length > 0) {
      recommendations.push({
        type: 'LARGE_FILES',
        message: `${largeFiles.length} files exceed 10K tokens`,
        suggestion: 'Consider splitting large files for better LLM context window usage'
      });
    }

    const avgTokensPerLine = this.stats.totalLines > 0
      ? this.stats.totalTokens / this.stats.totalLines
      : 0;

    if (avgTokensPerLine > 20) {
      recommendations.push({
        type: 'DENSE_CODE',
        message: 'Code is dense (high tokens per line)',
        suggestion: 'Consider adding comments and whitespace for better readability'
      });
    }

    return recommendations;
  }
}

module.exports = { TokenCounter, countTokens, estimateTokens, MODEL_COSTS };
