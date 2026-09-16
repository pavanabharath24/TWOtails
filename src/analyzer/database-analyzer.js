/**
 * TWOtails Database Analyzer
 * Detects missing models, broken queries, wrong migrations, unused models
 */

const fs = require('fs');
const path = require('path');

// ORM/Database patterns to detect
const DB_PATTERNS = {
  // Sequelize
  sequelize: {
    model: /(?:class\s+\w+\s+extends\s+Model|sequelize\.define\(\s*['"](\w+)['"])/,
    query: /(?:findAll|findOne|findByPk|create|update|destroy|bulkCreate|count|findAndCountAll|findOrCreate|upsert)\s*\(/,
    relation: /(?:belongsTo|hasOne|hasMany|belongsToMany)\s*\(/,
    migration: /(?:queryInterface|QueryInterface)\s*\.\s*(?:createTable|addColumn|removeColumn|renameColumn|changeColumn|addIndex|removeIndex)/
  },
  // Prisma
  prisma: {
    model: /model\s+(\w+)\s*\{/,
    query: /(?:prisma\.\w+\.(?:findMany|findFirst|findUnique|create|update|delete|upsert|count|aggregate|groupBy))\s*\(/,
    relation: /(?:@@relation|@relation)\s*\(/
  },
  // Mongoose
  mongoose: {
    model: /(?:new\s+Schema|mongoose\.model\(\s*['"](\w+)['"]|schema\.\w+\s*=)/,
    query: /(?:\.find\(|\.findOne\(|\.findById\(|\.create\(|\.updateOne\(|\.deleteOne\(|\.aggregate\()/,
    relation: /(?:populate\(|\.ref\s*=)/
  },
  // Knex
  knex: {
    query: /(?:knex\(\s*['"](\w+)['"]\)|\.select\(|\.where\(|\.insert\(|\.update\(|\.del\(|\.from\(|\.join\(|\.leftJoin\(|\.rightJoin\(|\.groupBy\(|\.orderBy\(|\.limit\(|\.offset\()/
  },
  // Raw SQL
  raw: {
    query: /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/i,
    pool: /(?:createPool|createConnection|Pool|Connection)\s*\(/
  }
};

// Common AI mistakes with databases
const AI_DB_MISTAKES = [
  { pattern: /(?:await\s+)?(?:\w+\.)?(?:find|findOne|findAll|findByPk)\s*\([^)]*\)(?!\s*\.)/, issue: 'MISSING_AWAIT', message: 'Database query may be missing await' },
  { pattern: /(?:await\s+)?(?:\w+\.)?(?:create|update|destroy|delete)\s*\([^)]*\)(?!\s*\.)/, issue: 'MISSING_AWAIT', message: 'Database mutation may be missing await' },
  { pattern: /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:\w+\.)?(?:find|findOne|findAll)[^;]*;(?!\s*\n\s*(?:if|switch|try|return|\w+\.))/, issue: 'UNHANDLED_RESULT', message: 'Database query result not checked' }
];

class DatabaseAnalyzer {
  constructor() {
    this.models = new Map();      // name -> {file, line, type, fields}
    this.queries = [];            // {file, line, type, model, method}
    this.relations = [];          // {file, line, type, from, to}
    this.migrations = [];         // {file, line, type, table}
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

    // Phase 1: Scan all files for DB patterns
    for (const file of files) {
      try {
        this.scanFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    // Phase 2: Cross-reference
    this.analyzeMissingModels();
    this.analyzeMissingAwaits();
    this.analyzeUnusedModels();
    this.analyzeBrokenRelations();
    this.analyzeMigrationIssues();

    return {
      models: Array.from(this.models.values()),
      queries: this.queries,
      relations: this.relations,
      migrations: this.migrations,
      issues: this.issues,
      stats: {
        modelsFound: this.models.size,
        queriesFound: this.queries.length,
        relationsFound: this.relations.length,
        migrationsFound: this.migrations.length,
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

      // Detect models
      for (const [orm, patterns] of Object.entries(DB_PATTERNS)) {
        if (patterns.model) {
          const modelMatch = line.match(patterns.model);
          if (modelMatch) {
            const name = modelMatch[1] || this.extractModelName(line);
            this.models.set(name, {
              file: filePath,
              line: lineNum,
              orm,
              type: 'model',
              name
            });
          }
        }

        // Detect queries
        if (patterns.query) {
          const queryMatch = line.match(patterns.query);
          if (queryMatch) {
            this.queries.push({
              file: filePath,
              line: lineNum,
              orm,
              method: queryMatch[0].replace(/\s*\(/, '').trim(),
              raw: line.trim()
            });
          }
        }

        // Detect relations
        if (patterns.relation) {
          const relMatch = line.match(patterns.relation);
          if (relMatch) {
            this.relations.push({
              file: filePath,
              line: lineNum,
              orm,
              raw: line.trim()
            });
          }
        }

        // Detect migrations
        if (patterns.migration) {
          const migMatch = line.match(patterns.migration);
          if (migMatch) {
            this.migrations.push({
              file: filePath,
              line: lineNum,
              type: migMatch[0].replace(/\s*\(/, '').trim(),
              raw: line.trim()
            });
          }
        }
      }
    });
  }

  extractModelName(line) {
    // Try to extract model name from various patterns
    const patterns = [
      /class\s+(\w+)/,
      /mongoose\.model\(\s*['"](\w+)['"]/,
      /sequelize\.define\(\s*['"](\w+)['"]/,
      /model\s+(\w+)\s*\{/
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match[1];
    }
    return 'Unknown';
  }

  analyzeMissingModels() {
    this.queries.forEach(query => {
      // Extract model name from query (e.g., "prisma.user.findMany" -> "user")
      const modelMatch = query.raw.match(/(?:prisma\.|knex\(\s*['"]|mongoose\.model\(\s*['"]?|this\.)(\w+)/);
      if (modelMatch) {
        const modelName = modelMatch[1];
        const model = this.models.get(modelName);
        if (!model && !['console', 'Math', 'JSON', 'Date', 'Array', 'Object'].includes(modelName)) {
          this.issues.push({
            file: query.file,
            line: query.line,
            type: 'MISSING_MODEL',
            severity: 'ERROR',
            message: `Query references model "${modelName}" but no model definition found`,
            suggestion: `Define model "${modelName}" or check for typos`,
            orm: query.orm,
            query: query.raw
          });
        }
      }
    });
  }

  analyzeMissingAwaits() {
    this.queries.forEach(query => {
      if (query.orm === 'raw') return; // Skip raw SQL

      const fileContent = fs.readFileSync(query.file, 'utf8');
      const line = fileContent.split('\n')[query.line - 1] || '';

      // Check if this is an async operation without await
      const asyncOps = ['findMany', 'findFirst', 'findUnique', 'create', 'update', 'delete',
                        'upsert', 'findAll', 'findOne', 'findByPk', 'bulkCreate',
                        'createPool', 'query'];

      const isAsyncOp = asyncOps.some(op => line.includes(op));
      const hasAwait = line.includes('await');
      const hasThen = line.includes('.then');
      const hasCatch = line.includes('.catch');
      const isWrapped = line.includes('async') || line.includes('=>');

      if (isAsyncOp && !hasAwait && !hasThen && !hasCatch && !isWrapped) {
        this.issues.push({
          file: query.file,
          line: query.line,
          type: 'MISSING_AWAIT',
          severity: 'ERROR',
          message: `Database query "${query.method}" may be missing await`,
          suggestion: `Add "await" before the database query`,
          query: query.raw
        });
      }
    });
  }

  analyzeUnusedModels() {
    this.models.forEach((model, name) => {
      // Check if model name is used in queries
      const usedInQueries = this.queries.some(q => q.raw.includes(name));

      // Check if model is exported
      const fileContent = fs.readFileSync(model.file, 'utf8');
      const isExported = fileContent.includes(`module.exports`) && fileContent.includes(name) ||
                         fileContent.includes(`export`) && fileContent.includes(name);

      if (!usedInQueries && !isExported) {
        this.issues.push({
          file: model.file,
          line: model.line,
          type: 'UNUSED_MODEL',
          severity: 'WARNING',
          message: `Model "${name}" is defined but never used in queries`,
          suggestion: `Use model "${name}" in queries or remove it`
        });
      }
    });
  }

  analyzeBrokenRelations() {
    this.relations.forEach(rel => {
      // Check if related models exist
      const relatedModels = rel.raw.match(/(?:belongsTo|hasOne|hasMany|belongsToMany)\s*\(\s*(\w+)/);
      if (relatedModels) {
        const targetModel = relatedModels[1];
        if (!this.models.has(targetModel)) {
          this.issues.push({
            file: rel.file,
            line: rel.line,
            type: 'BROKEN_RELATION',
            severity: 'ERROR',
            message: `Relation references model "${targetModel}" but no model definition found`,
            suggestion: `Define model "${targetModel}" or fix the relation`
          });
        }
      }
    });
  }

  analyzeMigrationIssues() {
    this.migrations.forEach(mig => {
      // Check for common migration mistakes
      if (mig.type === 'addColumn') {
        const tableMatch = mig.raw.match(/addColumn\(\s*['"](\w+)['"]/);
        if (tableMatch) {
          const table = tableMatch[1];
          // Check if table exists in any migration
          const tableExists = this.migrations.some(m =>
            m.type === 'createTable' && m.raw.includes(table)
          );
          if (!tableExists) {
            this.issues.push({
              file: mig.file,
              line: mig.line,
              type: 'MIGRATION_ORDER',
              severity: 'WARNING',
              message: `Migration adds column to table "${table}" but createTable migration not found`,
              suggestion: `Ensure createTable migration runs before addColumn`
            });
          }
        }
      }
    });
  }
}

module.exports = { DatabaseAnalyzer, DB_PATTERNS };
