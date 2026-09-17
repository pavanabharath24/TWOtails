/**
 * TWOtails Docker Analyzer
 * Checks Dockerfiles for security issues and best practices
 */

const fs = require('fs');
const path = require('path');

// Dockerfile patterns
const DOCKER_PATTERNS = {
  // Security issues
  rootUser: {
    pattern: /(?:^|\s)USER\s+root\b/m,
    type: 'RUNNING_AS_ROOT',
    severity: 'ERROR',
    message: 'Container runs as root user',
    suggestion: 'Add a non-root user with "USER appuser"'
  },
  latestTag: {
    pattern: /FROM\s+[\w\-]+:latest\b/m,
    type: 'USING_LATEST_TAG',
    severity: 'WARNING',
    message: 'Using "latest" tag - builds are not reproducible',
    suggestion: 'Pin to specific version (e.g., node:20-alpine)'
  },
  noHealthcheck: {
    pattern: /HEALTHCHECK/,
    type: 'NO_HEALTHCHECK',
    severity: 'INFO',
    message: 'No HEALTHCHECK instruction found',
    suggestion: 'Add HEALTHCHECK for container orchestration'
  },
  addFromUrl: {
    pattern: /ADD\s+https?:\/\//m,
    type: 'ADD_FROM_URL',
    severity: 'WARNING',
    message: 'ADD from URL - use COPY + RUN wget/curl instead',
    suggestion: 'Use COPY for local files, RUN for downloading'
  },
  exposedPorts: {
    pattern: /EXPOSE\s+(\d+)/gm,
    type: 'EXPOSED_PORTS',
    severity: 'INFO',
    message: 'Exposed port detected'
  },
  secretsInEnv: {
    pattern: /(?:ENV|ARG)\s+(?:.*(?:SECRET|PASSWORD|TOKEN|KEY|CREDENTIAL).*=\s*.+)/i,
    type: 'SECRET_IN_DOCKERFILE',
    severity: 'ERROR',
    message: 'Secret/credential in Dockerfile ENV/ARG',
    suggestion: 'Use build secrets or runtime environment variables'
  },
  curlPipeBash: {
    pattern: /curl\s+.*\|\s*(?:ba)?sh/g,
    type: 'CURL_PIPE_BASH',
    severity: 'ERROR',
    message: 'curl | bash - potential code execution risk',
    suggestion: 'Download script first, verify checksum, then execute'
  },
  noMultiStage: {
    pattern: /^FROM\s+/gm,
    type: 'SINGLE_STAGE_BUILD',
    severity: 'INFO',
    message: 'Single-stage build - consider multi-stage for smaller images'
  }
};

// Docker Compose patterns
const COMPOSE_PATTERNS = {
  privileged: {
    pattern: /privileged:\s*true/m,
    type: 'PRIVILEGED_CONTAINER',
    severity: 'ERROR',
    message: 'Container runs in privileged mode',
    suggestion: 'Remove privileged: true and use specific capabilities'
  },
  hostNetwork: {
    pattern: /network_mode:\s*host/m,
    type: 'HOST_NETWORK',
    severity: 'WARNING',
    message: 'Container uses host network',
    suggestion: 'Use bridge network with port mapping'
  },
  noReadonlyRootfs: {
    pattern: /read_only:\s*false|read_only:\s*true/,
    type: 'WRITABLE_ROOTFS',
    severity: 'INFO',
    message: 'Root filesystem writable - consider read_only: true'
  },
  noResourceLimits: {
    pattern: /deploy:/,
    type: 'NO_RESOURCE_LIMITS',
    severity: 'WARNING',
    message: 'No resource limits defined',
    suggestion: 'Add mem_limit, cpus, etc.'
  }
};

class DockerAnalyzer {
  constructor() {
    this.issues = [];
    this.dockerfiles = [];
    this.composeFiles = [];
    this.stats = {
      filesScanned: 0,
      dockerfiles: 0,
      composeFiles: 0,
      issues: 0,
      errors: 0,
      warnings: 0
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    // Find Dockerfiles
    const dockerfiles = await glob('**/Dockerfile*', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Find docker-compose files
    const composeFiles = await glob('**/docker-compose*.{yml,yaml}', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    // Find .dockerignore
    const dockerignore = await glob('**/.dockerignore', {
      cwd: dirPath,
      ignore: ignorePatterns,
      absolute: true
    });

    for (const file of dockerfiles) {
      this.analyzeDockerfile(file);
    }

    for (const file of composeFiles) {
      this.analyzeComposeFile(file);
    }

    for (const file of dockerignore) {
      this.analyzeDockerignore(file);
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;

    return {
      issues: this.issues,
      dockerfiles: this.dockerfiles,
      composeFiles: this.composeFiles,
      stats: this.stats
    };
  }

  analyzeDockerfile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;
    this.stats.dockerfiles++;

    this.dockerfiles.push({
      file: filePath,
      lines: content.split('\n').length,
      stages: (content.match(/^FROM\s+/gm) || []).length
    });

    // Check each pattern
    for (const [name, check] of Object.entries(DOCKER_PATTERNS)) {
      if (check.pattern.test(content)) {
        const line = this.findLineNumber(content, check.pattern);
        this.issues.push({
          file: filePath,
          line,
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: check.suggestion
        });
      }
    }
  }

  analyzeComposeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;
    this.stats.composeFiles++;

    this.composeFiles.push({
      file: filePath,
      services: (content.match(/^\s{2}\w+:/gm) || []).length
    });

    // Check each pattern
    for (const [name, check] of Object.entries(COMPOSE_PATTERNS)) {
      if (check.pattern.test(content)) {
        const line = this.findLineNumber(content, check.pattern);
        this.issues.push({
          file: filePath,
          line,
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: check.suggestion
        });
      }
    }
  }

  analyzeDockerignore(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;

    // Check for common patterns that should be in .dockerignore
    const shouldIgnore = ['.git', 'node_modules', '.env', '*.log', 'dist', 'build'];
    const missing = shouldIgnore.filter(pattern => !content.includes(pattern));

    if (missing.length > 0) {
      this.issues.push({
        file: filePath,
        line: 0,
        type: 'INCOMPLETE_DOCKERIGNORE',
        severity: 'INFO',
        message: `.dockerignore missing common patterns: ${missing.join(', ')}`,
        suggestion: `Add these to .dockerignore: ${missing.join(', ')}`
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

  getRecommendations() {
    const recommendations = [];

    if (this.stats.dockerfiles > 0 && !this.dockerfiles.some(d => d.stages > 1)) {
      recommendations.push({
        type: 'MULTI_STAGE',
        message: 'No multi-stage builds detected',
        suggestion: 'Use multi-stage builds to reduce final image size'
      });
    }

    const rootIssues = this.issues.filter(i => i.type === 'RUNNING_AS_ROOT');
    if (rootIssues.length > 0) {
      recommendations.push({
        type: 'ROOT_USER',
        message: 'Containers running as root',
        suggestion: 'Add non-root user for better security'
      });
    }

    return recommendations;
  }
}

module.exports = { DockerAnalyzer, DOCKER_PATTERNS, COMPOSE_PATTERNS };
