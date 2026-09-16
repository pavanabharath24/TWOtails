/**
 * TWOtails Results Formatter
 * Formats and displays analysis results
 */

const { TableGenerator } = require('./table-generator');
const { scan } = require('../analyzer/ast-parser');

class ResultsFormatter {
  constructor(options = {}) {
    this.tableGen = new TableGenerator(options);
    this.format = options.format || 'table';
  }

  formatConnectionReport(results) {
    switch (this.format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'markdown':
        return this.toMarkdown(results);
      case 'table':
      default:
        return this.tableGen.generateConnectionReport(results);
    }
  }

  formatSignalTrace(results) {
    switch (this.format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'markdown':
        return this.toMarkdownTrace(results);
      case 'table':
      default:
        return this.tableGen.generateSignalTrace(results);
    }
  }

  formatVirtualMemoryReport(results) {
    switch (this.format) {
      case 'json':
        return JSON.stringify(results, null, 2);
      case 'markdown':
        return this.toMarkdownVirtualMemory(results);
      case 'table':
      default:
        return this.tableGen.generateVirtualMemoryReport(results);
    }
  }

  toMarkdown(results) {
    let md = '# Connection Report\n\n';
    md += '| # | Type | Sender | Receiver | Status | Action |\n';
    md += '|---|------|--------|----------|--------|--------|\n';

    results.forEach((result, index) => {
      md += `| ${index + 1} | ${result.type} | ${result.sender} | ${result.receiver} | ${result.status} | ${result.action} |\n`;
    });

    return md;
  }

  toMarkdownTrace(results) {
    let md = '# Signal Trace Results\n\n';

    results.forEach((result, index) => {
      md += `## Signal ${index + 1}\n\n`;
      md += `- **Sender:** ${result.sender.source.file}:${result.sender.source.line}\n`;
      md += `- **Receiver:** ${result.receiver ? `${result.receiver.source.file}:${result.receiver.source.line}` : 'NOT FOUND'}\n`;
      md += `- **Status:** ${result.status}\n\n`;
    });

    return md;
  }

  toMarkdownVirtualMemory(results) {
    let md = '# Virtual Memory Test Results\n\n';
    md += '| Element | File | Result | Time |\n';
    md += '|---------|------|--------|------|\n';

    results.forEach(result => {
      md += `| ${result.element || result.file} | ${result.file} | ${result.status} | ${result.time || '—'} |\n`;
    });

    return md;
  }

  async fix(directory, options = {}) {
    const results = await scan(directory, {});
    const issues = results.filter(r => r.status.includes('BROKEN'));

    if (options.dryRun) {
      console.log('\nWould apply fixes:\n');
      issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.sender} - ${issue.action}`);
      });
      console.log('\nNo changes made. Run without --dry-run to apply.');
      return;
    }

    if (!options.auto) {
      console.log(`\nFound ${issues.length} issues to fix.`);
      // In interactive mode, would prompt user here
    }

    // Apply fixes
    const appliedFixes = [];
    for (const issue of issues) {
      try {
        const fix = await this.applyFix(issue);
        appliedFixes.push(fix);
      } catch (error) {
        console.error(`Failed to fix ${issue.sender}:`, error.message);
      }
    }

    console.log(`\nApplied ${appliedFixes.length} fixes.`);

    // Retest
    console.log('\nRetesting...');
    const newResults = await scan(directory, {});
    const remainingIssues = newResults.filter(r => r.status.includes('BROKEN'));

    if (remainingIssues.length === 0) {
      console.log('All issues fixed! ✓');
    } else {
      console.log(`${remainingIssues.length} issues remaining.`);
    }

    return appliedFixes;
  }

  async applyFix(issue) {
    const fs = require('fs');
    const path = require('path');

    // Parse file location
    const [filePath, lineNum] = issue.sender.split(':');
    const line = parseInt(lineNum);

    // Read file
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Apply fix based on issue type
    switch (issue.type) {
      case 'MISSING_FUNCTION':
        // Add function definition
        const funcName = issue.action.replace('Define ', '');
        lines.splice(line - 1, 0, `\n// Function added by TWOtails\nconst ${funcName} = () => {};\n`);
        break;

      case 'UNUSED_IMPORT':
        // Remove import line
        lines.splice(line - 1, 1);
        break;

      case 'MISSING_HANDLER':
        // Connect handler
        const handlerName = issue.action.replace('Define handler ', '');
        lines[line - 1] = lines[line - 1].replace(
          /onClick={\w*}/,
          `onClick={${handlerName}}`
        );
        break;

      default:
        console.log(`No fix available for issue type: ${issue.type}`);
    }

    // Write updated file
    fs.writeFileSync(filePath, lines.join('\n'));

    return {
      file: filePath,
      line: line,
      issue: issue.type,
      status: 'fixed'
    };
  }
}

async function fix(directory, options = {}) {
  const formatter = new ResultsFormatter(options);
  return formatter.fix(directory, options);
}

module.exports = { ResultsFormatter, fix };
