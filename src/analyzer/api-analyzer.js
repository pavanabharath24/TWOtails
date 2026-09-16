/**
 * TWOtails API Route Analyzer
 * Detects missing routes, wrong methods, missing middleware, broken endpoints
 */

const fs = require('fs');
const path = require('path');

// Framework patterns
const ROUTE_PATTERNS = {
  express: {
    route: /(?:app|router)\s*\.\s*(get|post|put|patch|delete|use|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/,
    middleware: /(?:app|router)\s*\.\s*use\s*\(\s*(?:['"]([^'"]+)['"]|(\w+))\s*(?:,\s*(?:['"]([^'"]+)['"]|(\w+)))?\s*\)/,
    handler: /(?:app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?:=>|{)/,
    param: /(?:req|request)\s*\.\s*params\s*\.\s*(\w+)/,
    query: /(?:req|request)\s*\.\s*query\s*\.\s*(\w+)/,
    body: /(?:req|request)\s*\.\s*body\s*\.\s*(\w+)/
  },
  fastify: {
    route: /fastify\s*\.\s*(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/,
    handler: /fastify\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?:=>|{)/
  },
  koa: {
    route: /router\s*\.\s*(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/,
    handler: /router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?:=>|{)/
  },
  nextjs: {
    route: /(?:export\s+(?:default\s+)?async\s+function\s+(GET|POST|PUT|PATCH|DELETE)|export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE))/,
    api: /(?:app|pages)\/api\/.*\.(?:js|jsx|ts|tsx)$/
  },
  nestjs: {
    decorator: /@(Get|Post|Put|Patch|Delete|UseGuards|UseInterceptors|Controller)\s*\(\s*['"`]?([^'"`\)]*)['"]?\s*\)/,
    controller: /@Controller\s*\(\s*['"`]?([^'"`\)]*)['"]?\s*\)/
  }
};

// Common AI mistakes with routes
const AI_ROUTE_MISTAKES = [
  { pattern: /(?:req|request)\s*\.\s*(?:params|query|body)\s*\.\s*(\w+)/, issue: 'UNVALIDATED_INPUT', message: 'Route parameter not validated' },
  { pattern: /(?:res|response)\s*\.\s*json\s*\(\s*(?:req|request)\s*\.\s*body/, issue: 'SENSITIVE_DATA_EXPOSURE', message: 'Request body directly in response' },
  { pattern: /(?:res|response)\s*\.\s*send\s*\(\s*(?:`|'|\")\s*\+/, issue: 'XSS_VIA_CONCAT', message: 'String concatenation in response may cause XSS' }
];

class APIRouteAnalyzer {
  constructor() {
    this.routes = [];         // {file, line, method, path, handler, middleware}
    this.params = [];         // {file, line, name, type}
    this.controllers = [];    // {file, line, name, prefix}
    this.middleware = [];     // {file, line, name}
    this.issues = [];
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    const files = await glob('**/*.{js,jsx,ts,tsx}', {
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

    this.analyzeMissingHandlers();
    this.analyzeMissingValidation();
    this.analyzeMissingErrorHandling();
    this.analyzeMissingAuth();
    this.analyzeDuplicateRoutes();
    this.analyzeMissingParams();

    return {
      routes: this.routes,
      params: this.params,
      controllers: this.controllers,
      middleware: this.middleware,
      issues: this.issues,
      stats: {
        routesFound: this.routes.length,
        paramsFound: this.params.length,
        controllersFound: this.controllers.length,
        middlewareFound: this.middleware.length,
        issues: this.issues.length,
        errors: this.issues.filter(i => i.severity === 'ERROR').length,
        warnings: this.issues.filter(i => i.severity === 'WARNING').length
      }
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;

      for (const [framework, patterns] of Object.entries(ROUTE_PATTERNS)) {
        // Detect routes
        if (patterns.route) {
          const match = line.match(patterns.route);
          if (match) {
            this.routes.push({
              file: filePath,
              line: lineNum,
              method: match[1].toUpperCase(),
              path: match[2] || match[0],
              framework,
              raw: line.trim()
            });
          }
        }

        // Detect parameters
        if (patterns.param) {
          const match = line.match(patterns.param);
          if (match) {
            this.params.push({
              file: filePath,
              line: lineNum,
              name: match[1],
              type: 'param',
              source: line.trim()
            });
          }
        }

        if (patterns.query) {
          const match = line.match(patterns.query);
          if (match) {
            this.params.push({
              file: filePath,
              line: lineNum,
              name: match[1],
              type: 'query',
              source: line.trim()
            });
          }
        }

        if (patterns.body) {
          const match = line.match(patterns.body);
          if (match) {
            this.params.push({
              file: filePath,
              line: lineNum,
              name: match[1],
              type: 'body',
              source: line.trim()
            });
          }
        }

        // Detect controllers (NestJS)
        if (patterns.controller) {
          const match = line.match(patterns.controller);
          if (match) {
            this.controllers.push({
              file: filePath,
              line: lineNum,
              prefix: match[1] || '',
              framework,
              raw: line.trim()
            });
          }
        }

        // Detect middleware
        if (patterns.middleware) {
          const match = line.match(patterns.middleware);
          if (match) {
            const name = match[1] || match[2] || match[3] || match[4];
            if (name && !['app', 'router', 'express', 'fastify'].includes(name)) {
              this.middleware.push({
                file: filePath,
                line: lineNum,
                name,
                framework,
                raw: line.trim()
              });
            }
          }
        }
      }
    });
  }

  analyzeMissingHandlers() {
    this.routes.forEach(route => {
      const fileContent = fs.readFileSync(route.file, 'utf8');
      const lines = fileContent.split('\n');

      // Check if route has a handler function
      const routeLine = lines[route.line - 1] || '';
      const hasInlineHandler = routeLine.includes('=>') || routeLine.includes('function');
      const hasNextLineHandler = route.line < lines.length && lines[route.line]?.includes('=>');

      if (!hasInlineHandler && !hasNextLineHandler) {
        // Check if handler is imported
        const handlerMatch = routeLine.match(/,\s*(\w+)\s*\)/);
        if (handlerMatch) {
          const handlerName = handlerMatch[1];
          const isImported = fileContent.includes(`import`) && fileContent.includes(handlerName);
          const isDefined = fileContent.includes(`function ${handlerName}`) ||
                           fileContent.includes(`const ${handlerName} =`);

          if (!isImported && !isDefined) {
            this.issues.push({
              file: route.file,
              line: route.line,
              type: 'MISSING_ROUTE_HANDLER',
              severity: 'ERROR',
              message: `Route ${route.method} ${route.path} references handler "${handlerName}" but it's not defined or imported`,
              suggestion: `Define or import handler "${handlerName}"`
            });
          }
        }
      }
    });
  }

  analyzeMissingValidation() {
    this.params.forEach(param => {
      const fileContent = fs.readFileSync(param.file, 'utf8');
      const lines = fileContent.split('\n');

      // Check if parameter is validated
      const paramLine = lines[param.line - 1] || '';
      const hasValidation = paramLine.includes('validate') ||
                           paramLine.includes('sanitize') ||
                           paramLine.includes('check') ||
                           paramLine.includes('schema') ||
                           paramLine.includes('joi') ||
                           paramLine.includes('zod') ||
                           paramLine.includes('yup');

      // Check surrounding lines for validation
      const start = Math.max(0, param.line - 5);
      const end = Math.min(lines.length, param.line + 5);
      const context = lines.slice(start, end).join('\n');
      const hasContextValidation = context.includes('validate') ||
                                   context.includes('schema') ||
                                   context.includes('joi') ||
                                   context.includes('zod');

      if (!hasValidation && !hasContextValidation) {
        this.issues.push({
          file: param.file,
          line: param.line,
          type: 'UNVALIDATED_INPUT',
          severity: 'WARNING',
          message: `Route ${param.type} parameter "${param.name}" is not validated`,
          suggestion: `Add validation for parameter "${param.name}"`,
          source: param.source
        });
      }
    });
  }

  analyzeMissingErrorHandling() {
    this.routes.forEach(route => {
      const fileContent = fs.readFileSync(route.file, 'utf8');
      const lines = fileContent.split('\n');

      // Find the handler function
      const routeLine = lines[route.line - 1] || '';
      const hasTryCatch = routeLine.includes('try');

      // Check next few lines for try/catch
      const start = route.line - 1;
      const end = Math.min(lines.length, route.line + 20);
      const handlerCode = lines.slice(start, end).join('\n');
      const hasErrorHandling = handlerCode.includes('try') ||
                               handlerCode.includes('catch') ||
                               handlerCode.includes('.catch') ||
                               handlerCode.includes('errorHandler') ||
                               handlerCode.includes('onError');

      if (!hasErrorHandling && !route.path.includes('*')) {
        this.issues.push({
          file: route.file,
          line: route.line,
          type: 'MISSING_ERROR_HANDLING',
          severity: 'WARNING',
          message: `Route ${route.method} ${route.path} has no error handling`,
          suggestion: `Add try/catch or error handler middleware`
        });
      }
    });
  }

  analyzeMissingAuth() {
    const PUBLIC_PATHS = ['/', '/health', '/healthcheck', '/ping', '/status', '/favicon.ico'];

    this.routes.forEach(route => {
      if (route.method === 'OPTIONS' || route.method === 'HEAD') return;
      if (PUBLIC_PATHS.includes(route.path)) return;
      if (route.path.includes('public') || route.path.includes('static')) return;

      const fileContent = fs.readFileSync(route.file, 'utf8');
      const lines = fileContent.split('\n');
      const routeLine = lines[route.line - 1] || '';

      const hasAuth = routeLine.includes('auth') ||
                     routeLine.includes('Auth') ||
                     routeLine.includes('token') ||
                     routeLine.includes('Token') ||
                     routeLine.includes('jwt') ||
                     routeLine.includes('JWT') ||
                     routeLine.includes('session') ||
                     routeLine.includes('Session') ||
                     routeLine.includes('passport') ||
                     routeLine.includes('cookie') ||
                     routeLine.includes('guard') ||
                     routeLine.includes('Guard') ||
                     routeLine.includes('middleware') ||
                     routeLine.includes('@UseGuards');

      // Check for auth middleware in route definition
      const hasMiddlewareAuth = this.middleware.some(m =>
        m.file === route.file &&
        (m.name.includes('auth') || m.name.includes('Auth') || m.name.includes('guard') || m.name.includes('Guard'))
      );

      if (!hasAuth && !hasMiddlewareAuth) {
        this.issues.push({
          file: route.file,
          line: route.line,
          type: 'MISSING_AUTH',
          severity: 'WARNING',
          message: `Route ${route.method} ${route.path} has no authentication`,
          suggestion: `Add authentication middleware to protect this route`
        });
      }
    });
  }

  analyzeDuplicateRoutes() {
    const routeMap = new Map();

    this.routes.forEach(route => {
      const key = `${route.method}:${route.path}`;
      if (routeMap.has(key)) {
        const existing = routeMap.get(key);
        this.issues.push({
          file: route.file,
          line: route.line,
          type: 'DUPLICATE_ROUTE',
          severity: 'ERROR',
          message: `Duplicate route ${route.method} ${route.path} (first defined at ${existing.file}:${existing.line})`,
          suggestion: `Remove duplicate route or use different path`
        });
      }
      routeMap.set(key, route);
    });
  }

  analyzeMissingParams() {
    this.params.forEach(param => {
      const fileContent = fs.readFileSync(param.file, 'utf8');

      // Check if parameter is used
      const isUsed = fileContent.includes(param.name) &&
                    fileContent.indexOf(param.name) !== param.file.indexOf(param.name);

      if (!isUsed) {
        this.issues.push({
          file: param.file,
          line: param.line,
          type: 'UNUSED_PARAM',
          severity: 'INFO',
          message: `Route parameter "${param.name}" is extracted but never used`,
          suggestion: `Remove unused parameter extraction or use it`
        });
      }
    });
  }
}

module.exports = { APIRouteAnalyzer, ROUTE_PATTERNS };
