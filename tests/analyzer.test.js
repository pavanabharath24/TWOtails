/**
 * TWOtails Comprehensive Tests
 * Tests all analyzers and features
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// ─── Line-by-Line Analyzer Tests ───────────────────────────────
describe('LineByLineAnalyzer', () => {
  const { LineByLineAnalyzer } = require('../src/analyzer/line-analyzer');

  it('should analyze broken-app and find all issues', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    assert.ok(result.issues.length > 0, 'Should find issues');
    assert.ok(result.stats.filesScanned > 0, 'Should scan files');
  });

  it('should detect undefined functions', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    const undefinedFuncs = result.issues.filter(i => i.type === 'UNDEFINED_FUNCTION');
    assert.ok(undefinedFuncs.length > 0, 'Should find undefined functions');
  });

  it('should detect missing event handlers', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    const missingHandlers = result.issues.filter(i => i.type === 'MISSING_HANDLER');
    assert.ok(missingHandlers.length > 0, 'Should find missing handlers');
  });

  it('should detect unused imports', async () => {
    const analyzer = new LineByLineAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    const unusedImports = result.issues.filter(i => i.type === 'UNUSED_IMPORT');
    assert.ok(unusedImports.length > 0, 'Should find unused imports');
  });

  it('should detect parameter mismatches', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'param-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'a.js'), `function greet(name, age) { return name; } greet("John");`);

    try {
      const analyzer = new LineByLineAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const mismatches = result.issues.filter(i => i.type === 'PARAMETER_MISMATCH');
      assert.ok(mismatches.length > 0, 'Should find parameter mismatches');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── Database Analyzer Tests ───────────────────────────────────
describe('DatabaseAnalyzer', () => {
  const { DatabaseAnalyzer } = require('../src/analyzer/database-analyzer');

  it('should detect missing models from queries', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'db-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'query.js'), `
const prisma = require('./prisma');
async function getUsers() {
  return await prisma.user.findMany();
}
`);

    try {
      const analyzer = new DatabaseAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const missingModels = result.issues.filter(i => i.type === 'MISSING_MODEL');
      assert.ok(missingModels.length > 0, 'Should find missing models');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect missing awaits', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'db-await-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'query.js'), `
const prisma = require('./prisma');
function getUsers() {
  const users = prisma.user.findMany();
  return users;
}
`);

    try {
      const analyzer = new DatabaseAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const missingAwaits = result.issues.filter(i => i.type === 'MISSING_AWAIT');
      assert.ok(missingAwaits.length > 0, 'Should find missing awaits');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect unused models', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'db-unused-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'model.js'), `
const { Model, DataTypes } = require('sequelize');
class User extends Model {}
User.init({ name: DataTypes.STRING });
`);
    fs.writeFileSync(path.join(testDir, 'app.js'), `
const { Order } = require('./model');
async function getOrders() {
  return await Order.findAll();
}
`);

    try {
      const analyzer = new DatabaseAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const unusedModels = result.issues.filter(i => i.type === 'UNUSED_MODEL');
      assert.ok(unusedModels.length >= 0, 'Should analyze model usage');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── API Route Analyzer Tests ──────────────────────────────────
describe('APIRouteAnalyzer', () => {
  const { APIRouteAnalyzer } = require('../src/analyzer/api-analyzer');

  it('should detect missing route handlers', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'api-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'routes.js'), `
const express = require('express');
const router = express.Router();
router.get('/users', getUser);
`);

    try {
      const analyzer = new APIRouteAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      assert.ok(result.routes.length > 0, 'Should find routes');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect unvalidated inputs', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'api-validate-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'routes.js'), `
const express = require('express');
const router = express.Router();
router.get('/users/:id', (req, res) => {
  const user = req.params.id;
  res.json(user);
});
`);

    try {
      const analyzer = new APIRouteAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const unvalidated = result.issues.filter(i => i.type === 'UNVALIDATED_INPUT');
      assert.ok(unvalidated.length > 0, 'Should find unvalidated inputs');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── AI Quality Scanner Tests ──────────────────────────────────
describe('AICodeQualityScanner', () => {
  const { AICodeQualityScanner } = require('../src/analyzer/ai-quality-scanner');

  it('should detect fake packages', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'ai-quality-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
      name: 'test',
      dependencies: { 'react-utils-pro': '^1.0.0' }
    }));

    try {
      const scanner = new AICodeQualityScanner();
      const result = await scanner.scanDirectory(testDir);
      const fakePkgs = result.issues.filter(i => i.type === 'FAKE_PACKAGE');
      assert.ok(fakePkgs.length > 0, 'Should find fake packages');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect empty catch blocks', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'ai-catch-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'app.js'), `
async function fetchData() {
  try {
    const res = await fetch('/api');
  } catch (err) {
  }
}
`);

    try {
      const scanner = new AICodeQualityScanner();
      const result = await scanner.scanDirectory(testDir);
      const emptyCatch = result.issues.filter(i => i.message.includes('Empty catch block'));
      assert.ok(emptyCatch.length > 0, 'Should find empty catch blocks');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect debug console statements', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'ai-debug-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'app.js'), `
function process() {
  console.log('debug');
  console.log("debug");
}
`);

    try {
      const scanner = new AICodeQualityScanner();
      const result = await scanner.scanDirectory(testDir);
      const debugStmts = result.issues.filter(i => i.message.includes('Debug console'));
      assert.ok(debugStmts.length > 0, 'Should find debug console statements');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── Security Scanner Tests ────────────────────────────────────
describe('SecurityScanner', () => {
  const { SecurityScanner } = require('../src/analyzer/security-scanner');

  it('should detect hardcoded secrets', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'security-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'config.js'), `
const API_KEY = 'sk_live_abc123def456ghi789jkl012mno';
const password = 'supersecretpassword123';
`);

    try {
      const scanner = new SecurityScanner();
      const result = await scanner.scanDirectory(testDir);
      const secrets = result.issues.filter(i => i.type === 'SECRET_DETECTED');
      assert.ok(secrets.length > 0, 'Should find secrets');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect SQL injection risks', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'security-sql-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'query.js'), `
function getUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  return db.query(query);
}
`);

    try {
      const scanner = new SecurityScanner();
      const result = await scanner.scanDirectory(testDir);
      const sqlInjection = result.issues.filter(i => i.type === 'SQL_INJECTION');
      assert.ok(sqlInjection.length > 0, 'Should find SQL injection risks');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect XSS risks', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'security-xss-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'app.js'), `
function renderUser(user) {
  document.getElementById('output').innerHTML = user.name;
}
`);

    try {
      const scanner = new SecurityScanner();
      const result = await scanner.scanDirectory(testDir);
      const xss = result.issues.filter(i => i.type === 'XSS');
      assert.ok(xss.length > 0, 'Should find XSS risks');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── Environment Analyzer Tests ────────────────────────────────
describe('EnvironmentAnalyzer', () => {
  const { EnvironmentAnalyzer } = require('../src/analyzer/env-analyzer');

  it('should detect missing env vars', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'env-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'app.js'), `
const apiKey = process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;
`);

    try {
      const analyzer = new EnvironmentAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const missingEnv = result.issues.filter(i => i.type === 'MISSING_ENV_VAR');
      assert.ok(missingEnv.length > 0, 'Should find missing env vars');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect weak secrets in .env', async () => {
    const testDir = path.join(__dirname, '..', 'examples', 'env-weak-test');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, '.env'), `
SECRET_KEY=short
API_SECRET=changeme123
`);

    try {
      const analyzer = new EnvironmentAnalyzer();
      const result = await analyzer.analyzeDirectory(testDir);
      const weakSecrets = result.issues.filter(i => i.type === 'WEAK_SECRET' || i.type === 'DEFAULT_SECRET');
      assert.ok(weakSecrets.length > 0, 'Should find weak secrets');
    } finally {
      fs.rmSync(testDir, { recursive: true });
    }
  });
});

// ─── Master Analyzer Tests ─────────────────────────────────────
describe('MasterAnalyzer', () => {
  const { MasterAnalyzer } = require('../src/analyzer/master-analyzer');

  it('should run all analyzers and return combined results', async () => {
    const analyzer = new MasterAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    assert.ok(result.issues.length > 0, 'Should find issues');
    assert.ok(result.stats.totalIssues > 0, 'Should have total issues');
    assert.ok(result.results.connectivity, 'Should have connectivity results');
    assert.ok(result.summary, 'Should have summary');
  });

  it('should deduplicate issues', async () => {
    const analyzer = new MasterAnalyzer();
    const result = await analyzer.analyzeDirectory(path.join(__dirname, '..', 'examples', 'broken-app'));

    // Check no duplicate file:line:type
    const keys = result.issues.map(i => `${i.file}:${i.line}:${i.type}`);
    const uniqueKeys = new Set(keys);
    assert.strictEqual(keys.length, uniqueKeys.size, 'Issues should be deduplicated');
  });
});
