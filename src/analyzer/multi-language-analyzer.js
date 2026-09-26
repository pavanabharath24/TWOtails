/**
 * TWOtails Multi-Language Analyzer
 * Supports Python, Go, Java, Ruby, and more
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class MultiLanguageAnalyzer {
  constructor() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      languagesDetected: new Set(),
      issues: 0,
      errors: 0,
      warnings: 0
    };
    this.supportedExtensions = {
      '.py': 'python',
      '.go': 'go',
      '.java': 'java',
      '.rb': 'ruby',
      '.rs': 'rust',
      '.php': 'php',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala'
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage,__pycache__,vendor,target').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    // Create individual glob patterns for each extension
    const patterns = Object.keys(this.supportedExtensions).map(ext => `**/*${ext}`);
    
    const files = await glob(patterns, {
      cwd: dirPath,
      ignore: [...ignorePatterns, '**/*.min.js', '**/*.map'],
      absolute: true
    });

    for (const file of files) {
      try {
        await this.analyzeFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;
    this.stats.languagesDetected = Array.from(this.stats.languagesDetected);

    return {
      issues: this.issues,
      stats: this.stats
    };
  }

  async analyzeFile(filePath) {
    const ext = path.extname(filePath);
    const language = this.supportedExtensions[ext];
    
    if (!language) return;
    
    this.stats.filesScanned++;
    this.stats.languagesDetected.add(language);

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    switch (language) {
      case 'python':
        await this.analyzePython(filePath, content, lines);
        break;
      case 'go':
        await this.analyzeGo(filePath, content, lines);
        break;
      case 'java':
        await this.analyzeJava(filePath, content, lines);
        break;
      case 'ruby':
        await this.analyzeRuby(filePath, content, lines);
        break;
      case 'rust':
        await this.analyzeRust(filePath, content, lines);
        break;
      case 'php':
        await this.analyzePHP(filePath, content, lines);
        break;
      case 'csharp':
        await this.analyzeCSharp(filePath, content, lines);
        break;
      case 'swift':
        await this.analyzeSwift(filePath, content, lines);
        break;
      case 'kotlin':
        await this.analyzeKotlin(filePath, content, lines);
        break;
      case 'scala':
        await this.analyzeScala(filePath, content, lines);
        break;
    }
  }

  // Python Analysis
  async analyzePython(filePath, content, lines) {
    // Try to use Python's ast module if available
    try {
      const pythonCode = `
import ast
import json
import sys

code = sys.stdin.read()
tree = ast.parse(code)

issues = []

for node in ast.walk(tree):
    # Check for unused imports
    if isinstance(node, ast.Import):
        for alias in node.names:
            issues.append({
                'type': 'IMPORT',
                'name': alias.name,
                'line': node.lineno
            })
    
    # Check for function definitions
    elif isinstance(node, ast.FunctionDef):
        issues.append({
            'type': 'FUNCTION',
            'name': node.name,
            'line': node.lineno,
            'args': len(node.args.args)
        })
    
    # Check for class definitions
    elif isinstance(node, ast.ClassDef):
        issues.append({
            'type': 'CLASS',
            'name': node.name,
            'line': node.lineno
        })

print(json.dumps(issues))
`;
      const result = execSync(`python3 -c "${pythonCode}"`, {
        input: content,
        encoding: 'utf8',
        timeout: 5000
      });
      
      const astIssues = JSON.parse(result);
      this.processPythonAST(filePath, astIssues, lines);
    } catch (err) {
      // Fallback to regex-based analysis
      this.analyzePythonRegex(filePath, content, lines);
    }
  }

  processPythonAST(filePath, astIssues, lines) {
    const imports = [];
    const functions = [];
    const classes = [];

    astIssues.forEach(issue => {
      if (issue.type === 'IMPORT') imports.push(issue);
      if (issue.type === 'FUNCTION') functions.push(issue);
      if (issue.type === 'CLASS') classes.push(issue);
    });

    // Check for unused imports
    imports.forEach(imp => {
      const line = lines[imp.line - 1] || '';
      const importName = imp.name;
      
      // Check if import is used elsewhere
      const isUsed = lines.some((l, i) => i !== imp.line - 1 && l.includes(importName));
      
      if (!isUsed) {
        this.issues.push({
          file: filePath,
          line: imp.line,
          type: 'UNUSED_IMPORT',
          severity: 'WARNING',
          message: `Import "${importName}" is never used`,
          suggestion: `Remove unused import "${importName}"`
        });
      }
    });

    // Check for functions without docstrings
    functions.forEach(func => {
      const line = lines[func.line - 1] || '';
      const nextLine = lines[func.line] || '';
      
      if (!nextLine.trim().startsWith('"""') && !nextLine.trim().startsWith("'''")) {
        this.issues.push({
          file: filePath,
          line: func.line,
          type: 'MISSING_DOCSTRING',
          severity: 'INFO',
          message: `Function "${func.name}" has no docstring`,
          suggestion: `Add docstring to function "${func.name}"`
        });
      }
    });
  }

  analyzePythonRegex(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for unused imports
      const importMatch = line.match(/^from\s+\w+\s+import\s+(.+)/);
      if (importMatch) {
        const imports = importMatch[1].split(',').map(i => i.trim().split(' as ')[0]);
        imports.forEach(imp => {
          if (imp !== '*' && !lines.some((l, i) => i !== idx && l.includes(imp))) {
            this.issues.push({
              file: filePath,
              line: lineNum,
              type: 'UNUSED_IMPORT',
              severity: 'WARNING',
              message: `Import "${imp}" is never used`,
              suggestion: `Remove unused import "${imp}"`
            });
          }
        });
      }

      // Check for bare except
      if (line.trim().startsWith('except:')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'BARE_EXCEPT',
          severity: 'WARNING',
          message: 'Bare except clause catches all exceptions',
          suggestion: 'Use specific exception types (e.g., except ValueError:)'
        });
      }

      // Check for mutable default arguments
      const funcMatch = line.match(/def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/);
      if (funcMatch) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'MUTABLE_DEFAULT',
          severity: 'WARNING',
          message: 'Mutable default argument in function',
          suggestion: 'Use None as default and create mutable inside function'
        });
      }
    });
  }

  // Go Analysis
  async analyzeGo(filePath, content, lines) {
    this.analyzeGoRegex(filePath, content, lines);
  }

  analyzeGoRegex(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for unused imports
      const importMatch = line.match(/^import\s+"([^"]+)"/);
      if (importMatch) {
        const pkg = importMatch[1];
        if (!lines.some((l, i) => i !== idx && l.includes(pkg.split('/').pop()))) {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'UNUSED_IMPORT',
            severity: 'WARNING',
            message: `Import "${pkg}" is never used`,
            suggestion: `Remove unused import "${pkg}"`
          });
        }
      }

      // Check for error handling
      const errMatch = line.match(/if\s+err\s*!=\s*nil\s*\{/);
      if (errMatch) {
        const nextLine = lines[idx + 1] || '';
        if (nextLine.trim() === 'return nil' || nextLine.trim().match(/^return\s+\w+,\s*nil$/)) {
          // Good error handling
        } else if (nextLine.trim().startsWith('//') || nextLine.trim() === '') {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'ERROR_NOT_HANDLED',
            severity: 'WARNING',
            message: 'Error condition checked but not properly handled',
            suggestion: 'Handle the error appropriately (log, return, or wrap)'
          });
        }
      }

      // Check for goroutine leaks
      if (line.includes('go func()')) {
        const hasWaitGroup = content.includes('sync.WaitGroup') || content.includes('wg.Wait()');
        if (!hasWaitGroup) {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'GOROUTINE_LEAK',
            severity: 'WARNING',
            message: 'Goroutine started without WaitGroup',
            suggestion: 'Use sync.WaitGroup to wait for goroutines'
          });
        }
      }
    });
  }

  // Java Analysis
  async analyzeJava(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for empty catch blocks
      if (line.trim().startsWith('catch') && lines[idx + 1]?.trim() === '}') {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'EMPTY_CATCH',
          severity: 'ERROR',
          message: 'Empty catch block - errors will be silently swallowed',
          suggestion: 'Add error handling or rethrow the exception'
        });
      }

      // Check for System.out.println (debug)
      if (line.includes('System.out.print')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'System.out.println left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }

      // Check for raw types
      const rawTypeMatch = line.match(/(?:List|Map|Set|Collection)\s+\w+/);
      if (rawTypeMatch && !line.includes('<')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'RAW_TYPE',
          severity: 'WARNING',
          message: 'Raw type used without generics',
          suggestion: 'Use parameterized type (e.g., List<String>)'
        });
      }

      // Check for null pointer risks
      if (line.includes('.equals(null)')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'NULL_COMPARISON',
          severity: 'ERROR',
          message: 'Comparing with .equals(null) is always false',
          suggestion: 'Use == null instead'
        });
      }
    });
  }

  // Ruby Analysis
  async analyzeRuby(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for empty rescue blocks
      if (line.trim().startsWith('rescue') && lines[idx + 1]?.trim() === 'end') {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'EMPTY_RESCUE',
          severity: 'ERROR',
          message: 'Empty rescue block - errors will be silently swallowed',
          suggestion: 'Add error handling or re-raise the exception'
        });
      }

      // Check for puts (debug)
      if (line.trim().startsWith('puts ') && !line.includes('#')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'puts statement left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }

      // Check for eval usage
      if (line.includes('eval(') || line.includes('instance_eval')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'EVAL_USAGE',
          severity: 'ERROR',
          message: 'eval() usage detected - potential code injection',
          suggestion: 'Avoid eval() and use safer alternatives'
        });
      }

      // Check for rescue without exception class
      if (line.trim() === 'rescue' || line.trim().match(/^rescue\s*$/)) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'BARE_RESCUE',
          severity: 'WARNING',
          message: 'Bare rescue catches all exceptions',
          suggestion: 'Specify exception class (rescue StandardError)'
        });
      }
    });
  }

  // Rust Analysis
  async analyzeRust(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for unwrap() usage
      if (line.includes('.unwrap()')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'UNWRAP_USAGE',
          severity: 'WARNING',
          message: 'unwrap() usage - will panic on None/Err',
          suggestion: 'Use expect() with message or match/if let'
        });
      }

      // Check for panic! usage
      if (line.includes('panic!(')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'PANIC_USAGE',
          severity: 'WARNING',
          message: 'panic!() usage in non-test code',
          suggestion: 'Return Result instead of panicking'
        });
      }

      // Check for unsafe blocks
      if (line.trim().startsWith('unsafe {')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'UNSAFE_BLOCK',
          severity: 'WARNING',
          message: 'unsafe block detected',
          suggestion: 'Ensure unsafe code is necessary and well-documented'
        });
      }
    });
  }

  // PHP Analysis
  async analyzePHP(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for empty catch blocks
      if (line.trim().startsWith('catch') && lines[idx + 1]?.trim() === '}') {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'EMPTY_CATCH',
          severity: 'ERROR',
          message: 'Empty catch block - errors will be silently swallowed',
          suggestion: 'Add error handling or rethrow the exception'
        });
      }

      // Check for echo/print_r (debug)
      if (line.includes('echo ') || line.includes('print_r(') || line.includes('var_dump(')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'Debug output statement left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }

      // Check for SQL injection
      if (line.includes('mysql_query') || line.includes('mysqli_query')) {
        if (line.includes('$') && (line.includes("'") || line.includes('"'))) {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'SQL_INJECTION',
            severity: 'ERROR',
            message: 'Potential SQL injection - string concatenation in query',
            suggestion: 'Use prepared statements or parameterized queries'
          });
        }
      }
    });
  }

  // C# Analysis
  async analyzeCSharp(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for empty catch blocks
      if (line.trim().startsWith('catch') && lines[idx + 1]?.trim() === '}') {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'EMPTY_CATCH',
          severity: 'ERROR',
          message: 'Empty catch block - errors will be silently swallowed',
          suggestion: 'Add error handling or rethrow the exception'
        });
      }

      // Check for Console.WriteLine (debug)
      if (line.includes('Console.WriteLine')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'Console.WriteLine left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }

      // Check for null reference risks
      if (line.includes('.ToString()') && !line.includes('?.')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'NULL_REFERENCE',
          severity: 'WARNING',
          message: 'Possible null reference - use null-conditional operator',
          suggestion: 'Use ?. operator or null check'
        });
      }
    });
  }

  // Swift Analysis
  async analyzeSwift(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for force unwrap
      if (line.includes('!') && !line.includes('!=') && !line.includes('!!')) {
        const forceUnwrapMatch = line.match(/\w+!/);
        if (forceUnwrapMatch && !line.includes('//')) {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'FORCE_UNWRAP',
            severity: 'WARNING',
            message: 'Force unwrap detected - may crash',
            suggestion: 'Use optional binding or guard let'
          });
        }
      }

      // Check for print (debug)
      if (line.trim().startsWith('print(')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'print() statement left in code',
          suggestion: 'Remove debug statement or use os_log'
        });
      }
    });
  }

  // Kotlin Analysis
  async analyzeKotlin(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for !! (force unwrap)
      if (line.includes('!!') && !line.includes('!=')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'FORCE_UNWRAP',
          severity: 'WARNING',
          message: 'Non-null assertion (!!) detected - may throw',
          suggestion: 'Use safe call (?.) or let block'
        });
      }

      // Check for println (debug)
      if (line.includes('println(')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'println() statement left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }
    });
  }

  // Scala Analysis
  async analyzeScala(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for println (debug)
      if (line.includes('println(')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'DEBUG_STATEMENT',
          severity: 'WARNING',
          message: 'println() statement left in code',
          suggestion: 'Remove debug statement or use proper logging'
        });
      }

      // Check for .get on Option
      if (line.includes('.get') && (line.includes('Option') || line.includes('Some'))) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'OPTION_GET',
          severity: 'WARNING',
          message: '.get on Option may throw - use .getOrElse or pattern matching',
          suggestion: 'Use .getOrElse, .fold, or pattern matching'
        });
      }
    });
  }

  // Common pattern detection across all languages
  detectCommonIssues(filePath, content, lines) {
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      
      // Check for TODO/FIXME/HACK
      const todoMatch = line.match(/(?:TODO|FIXME|HACK|XXX):\s*(.+)/i);
      if (todoMatch) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'TODO_COMMENT',
          severity: 'INFO',
          message: `TODO comment: ${todoMatch[1]}`,
          suggestion: 'Address the TODO or create an issue'
        });
      }

      // Check for hardcoded secrets (common patterns)
      const secretPatterns = [
        /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([A-Za-z0-9_\-]{10,})['"]/i,
        /(?:secret|password|passwd|pwd)\s*[:=]\s*['"]([^'"]{6,})['"]/i,
        /(?:token|access[_-]?token)\s*[:=]\s*['"]([A-Za-z0-9_\-\.]{10,})['"]/i
      ];

      secretPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          this.issues.push({
            file: filePath,
            line: lineNum,
            type: 'HARDCODED_SECRET',
            severity: 'ERROR',
            message: 'Potential hardcoded secret detected',
            suggestion: 'Move secret to environment variable or secure vault'
          });
        }
      });

      // Check for magic numbers
      const magicNumberMatch = line.match(/(?<!=)\s(\d{4,})\s*(?![\w.])/);
      if (magicNumberMatch && !line.includes('//') && !line.includes('#')) {
        this.issues.push({
          file: filePath,
          line: lineNum,
          type: 'MAGIC_NUMBER',
          severity: 'INFO',
          message: `Magic number ${magicNumberMatch[1]} detected`,
          suggestion: 'Extract to named constant for better readability'
        });
      }
    });
  }
}

module.exports = { MultiLanguageAnalyzer };
