/**
 * TWOtails Environment/Config Analyzer
 * Detects missing env vars, wrong configs, .env issues
 */

const fs = require('fs');
const path = require('path');

// Common env var patterns
const ENV_PATTERNS = {
  node: /process\.env\s*\.\s*(\w+)/,
  nodeBracket: /process\.env\s*\[\s*['"](\w+)['"]\s*\]/,
  dotenv: /(?:dotenv|config)\s*\.\s*(?:config|load|parsed)\s*\(/,
  nextPublic: /NEXT_PUBLIC_(\w+)/,
  react: /REACT_APP_(\w+)/,
  vite: /VITE_(\w+)/
};

// Config file patterns
const CONFIG_PATTERNS = {
  envFile: /\.env(?:\.\w+)?$/,
  configFile: /(?:config|configuration)\.(?:js|jsx|ts|tsx|json|yaml|yml)$/,
  dockerEnv: /docker-compose\.(?:ya?ml|env)$/,
  envExample: /\.env(?:\.\w+)?\.example$/,
  envLocal: /\.env\.local$/,
  envGlobal: /\.env(?:\.production|\.development|\.test)?$/
};

// Known framework env vars
const FRAMEWORK_ENV_VARS = {
  next: ['NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'DATABASE_URL', 'NEXT_PUBLIC_API_URL'],
  react: ['REACT_APP_API_URL', 'REACT_APP_SECRET'],
  vite: ['VITE_API_URL', 'VITE_SECRET'],
  express: ['PORT', 'NODE_ENV', 'DATABASE_URL', 'JWT_SECRET'],
  nest: ['DATABASE_URL', 'JWT_SECRET', 'PORT'],
  prisma: ['DATABASE_URL'],
  sequelize: ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'],
  mongoose: ['MONGODB_URI', 'MONGO_URI']
};

class EnvironmentAnalyzer {
  constructor() {
    this.envVars = new Map();     // name -> [{file, line, type}]
    this.configFiles = [];        // {file, type, exists}
    this.envFiles = [];           // {file, exists, vars}
    this.issues = [];
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx,json,yaml,yml,env,env.*}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Also check for .env files specifically
    const envFiles = await glob('.env*', {
      cwd: dirPath,
      ignore: ['node_modules/**'],
      absolute: true,
      dot: true
    });

    // Scan all files
    for (const file of [...files, ...envFiles]) {
      try {
        this.scanFile(file, dirPath);
      } catch (err) {
        // Skip unparseable files
      }
    }

    // Cross-reference
    this.analyzeMissingEnvVars();
    this.analyzeMissingEnvFiles();
    this.analyzeEnvFileSecurity();
    this.analyzeConfigIssues();

    return {
      envVars: Array.from(this.envVars.entries()),
      configFiles: this.configFiles,
      envFiles: this.envFiles,
      issues: this.issues,
      stats: {
        envVarsFound: this.envVars.size,
        configFilesFound: this.configFiles.length,
        envFilesFound: this.envFiles.length,
        issues: this.issues.length,
        errors: this.issues.filter(i => i.severity === 'ERROR').length,
        warnings: this.issues.filter(i => i.severity === 'WARNING').length
      }
    };
  }

  scanFile(filePath, baseDir) {
    const content = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath);
    const basename = path.basename(filePath);

    // Check if it's an env file
    if (CONFIG_PATTERNS.envFile.test(basename)) {
      this.scanEnvFile(filePath, content, baseDir);
      return;
    }

    // Check if it's a config file
    if (CONFIG_PATTERNS.configFile.test(basename) || CONFIG_PATTERNS.dockerEnv.test(basename)) {
      this.configFiles.push({
        file: filePath,
        type: this.getConfigType(basename),
        exists: true
      });
    }

    // Scan for env var usage in code files
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        this.scanLineForEnvVars(filePath, line, idx + 1);
      });
    }
  }

  scanEnvFile(filePath, content, baseDir) {
    const lines = content.split('\n');
    const vars = [];

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) return;

      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)/);
      if (match) {
        const name = match[1];
        const value = match[2];
        vars.push({ name, value, line: lineNum });

        if (!this.envVars.has(name)) {
          this.envVars.set(name, []);
        }
        this.envVars.get(name).push({
          file: filePath,
          line: lineNum,
          type: 'definition',
          value
        });
      }
    });

    this.envFiles.push({
      file: filePath,
      exists: true,
      vars
    });
  }

  scanLineForEnvVars(filePath, line, lineNum) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    // Check process.env.VAR
    const envMatch = line.match(ENV_PATTERNS.node);
    if (envMatch) {
      const name = envMatch[1];
      if (!this.envVars.has(name)) {
        this.envVars.set(name, []);
      }
      this.envVars.get(name).push({
        file: filePath,
        line: lineNum,
        type: 'usage'
      });
    }

    // Check process.env['VAR']
    const bracketMatch = line.match(ENV_PATTERNS.nodeBracket);
    if (bracketMatch) {
      const name = bracketMatch[1];
      if (!this.envVars.has(name)) {
        this.envVars.set(name, []);
      }
      this.envVars.get(name).push({
        file: filePath,
        line: lineNum,
        type: 'usage'
      });
    }
  }

  getConfigType(basename) {
    if (basename.includes('docker')) return 'docker';
    if (basename.includes('next')) return 'nextjs';
    if (basename.includes('vite')) return 'vite';
    if (basename.includes('webpack')) return 'webpack';
    if (basename.includes('tsconfig')) return 'typescript';
    if (basename.includes('eslint')) return 'eslint';
    if (basename.includes('prettier')) return 'prettier';
    return 'unknown';
  }

  analyzeMissingEnvVars() {
    // Check for env vars used but not defined
    this.envVars.forEach((usages, name) => {
      const definitions = usages.filter(u => u.type === 'definition');
      const usageOnly = usages.filter(u => u.type === 'usage');

      if (usageOnly.length > 0 && definitions.length === 0) {
        // Check if it's defined in .env.example or .env.local
        const hasExample = this.envFiles.some(f =>
          f.file.includes('.example') && f.vars.some(v => v.name === name)
        );

        if (!hasExample) {
          usageOnly.forEach(usage => {
            this.issues.push({
              file: usage.file,
              line: usage.line,
              type: 'MISSING_ENV_VAR',
              severity: 'ERROR',
              message: `Environment variable "${name}" is used but never defined`,
              suggestion: `Add "${name}" to .env or .env.example`
            });
          });
        }
      }
    });
  }

  analyzeMissingEnvFiles() {
    const hasEnvFile = this.envFiles.some(f => !f.file.includes('.example'));
    const hasEnvExample = this.envFiles.some(f => f.file.includes('.example'));

    if (!hasEnvFile) {
      this.issues.push({
        file: '.env',
        line: 0,
        type: 'MISSING_ENV_FILE',
        severity: 'WARNING',
        message: 'No .env file found',
        suggestion: 'Create .env file with required environment variables'
      });
    }

    if (!hasEnvExample) {
      this.issues.push({
        file: '.env.example',
        line: 0,
        type: 'MISSING_ENV_EXAMPLE',
        severity: 'INFO',
        message: 'No .env.example file found',
        suggestion: 'Create .env.example to document required variables'
      });
    }
  }

  analyzeEnvFileSecurity() {
    this.envFiles.forEach(envFile => {
      if (envFile.file.includes('.example')) return;

      const content = fs.readFileSync(envFile.file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)/);
        if (match) {
          const name = match[1];
          const value = match[2];

          // Check for weak secrets
          if (name.includes('SECRET') || name.includes('KEY') || name.includes('TOKEN')) {
            if (value.length < 32) {
              this.issues.push({
                file: envFile.file,
                line: idx + 1,
                type: 'WEAK_SECRET',
                severity: 'WARNING',
                message: `Secret "${name}" appears to be weak (less than 32 characters)`,
                suggestion: `Use a strong random secret (at least 32 characters)`
              });
            }

            // Check for default/example values
            if (['secret', 'password', 'changeme', 'example', 'test', 'default'].some(v => value.toLowerCase().includes(v))) {
              this.issues.push({
                file: envFile.file,
                line: idx + 1,
                type: 'DEFAULT_SECRET',
                severity: 'ERROR',
                message: `Secret "${name}" appears to use a default/example value`,
                suggestion: `Replace with a real secret value`
              });
            }
          }
        }
      });
    });
  }

  analyzeConfigIssues() {
    // Check if required config files exist based on framework
    const requiredConfigs = {
      'package.json': 'Node.js project',
      'tsconfig.json': 'TypeScript project'
    };

    Object.entries(requiredConfigs).forEach(([file, desc]) => {
      const found = this.configFiles.some(c => c.file.endsWith(file));
      if (!found) {
        this.issues.push({
          file,
          line: 0,
          type: 'MISSING_CONFIG',
          severity: 'INFO',
          message: `No ${file} found (${desc})`,
          suggestion: `Create ${file} for proper project configuration`
        });
      }
    });
  }
}

module.exports = { EnvironmentAnalyzer, ENV_PATTERNS, FRAMEWORK_ENV_VARS };
