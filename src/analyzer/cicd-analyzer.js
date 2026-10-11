/**
 * CI/CD Workflow Analyzer
 * 
 * Analyzes GitHub Actions workflow files for:
 * - Syntax/schema validation
 * - Static policy checks (action pinning, permissions, secrets)
 * - Required job/step presence
 * - Security best practices
 * - Reliability scoring
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class CICDWorkflowAnalyzer {
  constructor() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      workflowsFound: 0,
      syntaxErrors: 0,
      policyViolations: 0,
      securityIssues: 0,
      reliabilityScore: 0
    };
    this.workflowResults = [];
  }

  async analyzeDirectory(dirPath, options = {}) {
    this.reset();
    const workflowFiles = this.findWorkflowFiles(dirPath);
    
    for (const file of workflowFiles) {
      await this.analyzeWorkflowFile(file, options);
    }

    this.calculateReliabilityScore();
    
    return {
      issues: this.issues,
      stats: this.stats,
      workflowResults: this.workflowResults,
      source: 'cicd'
    };
  }

  reset() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      workflowsFound: 0,
      syntaxErrors: 0,
      policyViolations: 0,
      securityIssues: 0,
      reliabilityScore: 0
    };
    this.workflowResults = [];
  }

  findWorkflowFiles(dirPath) {
    const files = [];
    const githubWorkflowsDir = path.join(dirPath, '.github', 'workflows');
    
    if (fs.existsSync(githubWorkflowsDir)) {
      const workflowFiles = fs.readdirSync(githubWorkflowsDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(f => path.join(githubWorkflowsDir, f));
      files.push(...workflowFiles);
    }

    // Also check for other CI/CD configs
    const otherConfigs = [
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'azure-pipelines.yml',
      'Jenkinsfile'
    ];
    
    for (const config of otherConfigs) {
      const configPath = path.join(dirPath, config);
      if (fs.existsSync(configPath)) files.push(configPath);
    }

    return files;
  }

  async analyzeWorkflowFile(filePath, options) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;

    let workflow;
    try {
      workflow = yaml.load(content);
      this.stats.workflowsFound++;
    } catch (e) {
      this.addIssue(filePath, 0, 'SYNTAX_ERROR', 'ERROR', 
        `YAML syntax error: ${e.message}`, 'Fix YAML syntax');
      this.stats.syntaxErrors++;
      return;
    }

    const result = {
      file: filePath,
      workflowName: workflow.name || path.basename(filePath),
      triggers: this.extractTriggers(workflow),
      jobs: this.extractJobs(workflow),
      issues: [],
      score: 0
    };

    // Run all checks
    this.checkTriggers(workflow, result, filePath);
    this.checkJobs(workflow, result, filePath);
    this.checkActionPinning(workflow, result, filePath);
    this.checkPermissions(workflow, result, filePath);
    this.checkSecrets(workflow, result, filePath);
    this.checkSecurityPractices(workflow, result, filePath);
    this.checkRequiredSteps(workflow, result, filePath);
    this.checkConcurrency(workflow, result, filePath);

    // Calculate workflow score
    result.score = this.calculateWorkflowScore(result);
    
    this.workflowResults.push(result);
    this.issues.push(...result.issues.map(i => ({ ...i, source: 'cicd' })));
  }

  extractTriggers(workflow) {
    const triggers = [];
    if (workflow.on) {
      if (typeof workflow.on === 'string') {
        triggers.push(workflow.on);
      } else if (Array.isArray(workflow.on)) {
        triggers.push(...workflow.on);
      } else if (typeof workflow.on === 'object') {
        triggers.push(...Object.keys(workflow.on));
      }
    }
    return triggers;
  }

  extractJobs(workflow) {
    if (!workflow.jobs || typeof workflow.jobs !== 'object') return [];
    return Object.entries(workflow.jobs).map(([name, job]) => ({
      name,
      runsOn: job['runs-on'],
      steps: job.steps || [],
      needs: job.needs,
      if: job.if,
      permissions: job.permissions,
      concurrency: job.concurrency,
      timeoutMinutes: job['timeout-minutes'],
      env: job.env,
      defaults: job.defaults
    }));
  }

  checkTriggers(workflow, result, filePath) {
    if (!workflow.on) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_TRIGGER', 'ERROR',
        'Workflow has no trigger (on:)', 'Add trigger events (push, pull_request, etc.)');
    }

    const triggers = this.extractTriggers(workflow);
    const hasPullRequest = triggers.some(t => t === 'pull_request' || (typeof t === 'object' && t.pull_request));
    const hasPush = triggers.some(t => t === 'push' || (typeof t === 'object' && t.push));

    if (!hasPullRequest) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_PR_TRIGGER', 'WARNING',
        'No pull_request trigger', 'Add pull_request trigger for PR validation');
    }

    if (!hasPush) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_PUSH_TRIGGER', 'WARNING',
        'No push trigger', 'Add push trigger for branch protection');
    }

    // Check for dangerous triggers
    if (triggers.includes('workflow_dispatch') || triggers.some(t => t === 'workflow_dispatch')) {
      this.addIssueToResult(result, filePath, 0, 'MANUAL_TRIGGER_ONLY', 'INFO',
        'workflow_dispatch allows manual runs', 'Ensure proper access controls');
    }
  }

  checkJobs(workflow, result, filePath) {
    const jobs = this.extractJobs(workflow);
    
    if (jobs.length === 0) {
      this.addIssueToResult(result, filePath, 0, 'NO_JOBS', 'ERROR',
        'Workflow has no jobs', 'Add at least one job');
      return;
    }

    for (const job of jobs) {
      this.checkJob(job, result, filePath);
    }
  }

  checkJob(job, result, filePath) {
    // Check runs-on
    if (!job.runsOn) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_RUNS_ON', 'ERROR',
        `Job "${job.name}" missing runs-on`, 'Add runs-on (e.g., ubuntu-latest)');
    }

    // Check for self-hosted runners without labels
    if (job.runsOn && typeof job.runsOn === 'string' && job.runsOn.includes('self-hosted')) {
      if (!Array.isArray(job.runsOn) || job.runsOn.length === 1) {
        this.addIssueToResult(result, filePath, 0, 'SELF_HOSTED_NO_LABELS', 'WARNING',
          `Job "${job.name}" uses self-hosted runner without labels`, 'Add labels to self-hosted runner');
      }
    }

    // Check steps
    if (!job.steps || job.steps.length === 0) {
      this.addIssueToResult(result, filePath, 0, 'JOB_NO_STEPS', 'WARNING',
        `Job "${job.name}" has no steps`, 'Add at least one step');
    }

    // Check for timeout
    if (!job.timeoutMinutes) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_TIMEOUT', 'INFO',
        `Job "${job.name}" has no timeout`, 'Add timeout-minutes to prevent stuck jobs');
    } else if (job.timeoutMinutes > 360) {
      this.addIssueToResult(result, filePath, 0, 'TIMEOUT_TOO_LONG', 'WARNING',
        `Job "${job.name}" timeout is ${job.timeoutMinutes} minutes`, 'Consider shorter timeout');
    }

    // Check permissions
    this.checkJobPermissions(job, result);
  }

  checkJobPermissions(job, result) {
    if (!job.permissions) {
      this.addIssueToResult(result, '', 0, 'MISSING_PERMISSIONS', 'WARNING',
        `Job "${job.name}" has no explicit permissions`, 'Add permissions: read/write for minimal access');
      this.stats.policyViolations++;
    } else if (typeof job.permissions === 'object') {
      // Check for write-all or broad permissions
      if (job.permissions.contents === 'write' || job.permissions.packages === 'write') {
        this.addIssueToResult(result, '', 0, 'BROAD_WRITE_PERMISSION', 'WARNING',
          `Job has broad write permissions`, 'Use minimal required permissions');
        this.stats.securityIssues++;
      }
      // Check for missing explicit read permissions
      if (!job.permissions.contents && !job.permissions['contents'] === 'read') {
        this.addIssueToResult(result, '', 0, 'MISSING_CONTENTS_READ', 'INFO',
          'Missing explicit contents read permission', 'Add contents: read for checkout');
      }
    }
  }

  checkActionPinning(workflow, result, filePath) {
    const jobs = this.extractJobs(workflow);
    
    for (const job of jobs) {
      for (const step of job.steps || []) {
        if (step.uses) {
          const actionRef = step.uses;
          
          // Check for unpinned actions (no @sha or @tag)
          if (!actionRef.includes('@')) {
            this.addIssueToResult(result, filePath, 0, 'UNPINNED_ACTION', 'ERROR',
              `Action "${actionRef}" is not pinned`, 'Pin action to specific SHA (e.g., actions/checkout@v4.1.0 or sha)');
            this.stats.policyViolations++;
          } else {
            const parts = actionRef.split('@');
            const ref = parts[1];
            
            // Check if pinned to mutable tag (not SHA)
            if (!/^[0-9a-f]{40}$/i.test(ref) && !ref.includes('.') && ref !== 'latest') {
              // Could be a major version tag like v4 - warn
              if (/^v\d+$/.test(ref)) {
                this.addIssueToResult(result, filePath, 0, 'ACTION_PINNED_TO_MAJOR_VERSION', 'WARNING',
                  `Action "${actionRef}" pinned to major version only`, 'Pin to specific minor/patch version or SHA');
                this.stats.policyViolations++;
              }
            }
          }

          // Check for local actions
          if (actionRef.startsWith('./') || actionRef.startsWith('../')) {
            this.addIssueToResult(result, filePath, 0, 'LOCAL_ACTION', 'INFO',
              `Uses local action: ${actionRef}`, 'Ensure local action is reviewed');
          }
        }
      }
    }
  }

  checkPermissions(workflow, result, filePath) {
    // Top-level permissions
    if (workflow.permissions) {
      if (workflow.permissions === 'write-all') {
        this.addIssueToResult(result, filePath, 0, 'WRITE_ALL_PERMISSIONS', 'ERROR',
          'Workflow has write-all permissions', 'Use minimal required permissions');
        this.stats.securityIssues++;
      }
    }

    // Check default permissions
    if (workflow.defaults && workflow.defaults.run && workflow.defaults.run.shell) {
      if (workflow.defaults.run.shell.includes('bash') && !workflow.defaults.run.shell.includes('pipefail')) {
        this.addIssueToResult(result, filePath, 0, 'SHELL_WITHOUT_PIPEFAIL', 'WARNING',
          'Bash shell without pipefail', 'Use bash -eo pipefail for better error handling');
      }
    }
  }

  checkSecrets(workflow, result, filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for hardcoded secrets in env
    const secretPatterns = [
      /(api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"]?[a-zA-Z0-9+/=]{20,}/i,
      /github_token\s*[:=]\s*['"]?[^$\s{]+/i,
      /aws_access_key_id\s*[:=]\s*['"]?[A-Z0-9]{20}/i,
      /aws_secret_access_key\s*[:=]\s*['"]?[A-Za-z0-9+/=]{40}/i
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        this.addIssueToResult(result, filePath, 0, 'HARDCODED_SECRET', 'ERROR',
          'Potential hardcoded secret detected', 'Use GitHub secrets: ${{ secrets.SECRET_NAME }}');
        this.stats.securityIssues++;
      }
    }

    // Check for proper secret usage in steps
    const jobs = this.extractJobs(workflow);
    for (const job of jobs) {
      for (const step of job.steps || []) {
        if (step.env) {
          for (const [key, value] of Object.entries(step.env)) {
            if (typeof value === 'string' && value.length > 20 && !value.includes('${{') && !value.includes('${{ secrets.')) {
              this.addIssueToResult(result, filePath, 0, 'POSSIBLE_HARDCODED_ENV_SECRET', 'WARNING',
                `Environment variable ${key} may contain hardcoded secret`, 'Use ${{ secrets.SECRET_NAME }}');
              this.stats.securityIssues++;
            }
          }
        }
      }
    }
  }

  checkSecurityPractices(workflow, result, filePath) {
    const jobs = this.extractJobs(workflow);
    
    for (const job of jobs) {
      for (const step of job.steps || []) {
        // Check for curl | bash patterns
        if (step.run && /curl\s+.*\|\s*(bash|sh)/i.test(step.run)) {
          this.addIssueToResult(result, filePath, 0, 'CURL_PIPE_BASH', 'ERROR',
            'Piping curl to bash is dangerous', 'Download script first, verify checksum, then execute');
          this.stats.securityIssues++;
        }

        // Check for set -e missing
        if (step.run && !step.run.includes('set -e') && !step.run.includes('set -euo pipefail')) {
          this.addIssueToResult(result, filePath, 0, 'MISSING_SET_E', 'WARNING',
            'Script does not fail on error', 'Add "set -euo pipefail" at start of run');
        }

        // Check for sudo usage
        if (step.run && /sudo\s+/i.test(step.run)) {
          this.addIssueToResult(result, filePath, 0, 'SUDO_USAGE', 'WARNING',
            'Step uses sudo', 'Avoid sudo; use appropriate permissions instead');
        }
      }
    }

    // Check for actions with known vulnerabilities (basic)
    const vulnerableActions = [
      'actions/checkout@v1',
      'actions/checkout@v2',
      'actions/setup-node@v1',
      'actions/setup-node@v2',
      'actions/setup-python@v1',
      'actions/setup-python@v2'
    ];

    const content = fs.readFileSync(filePath, 'utf8');
    for (const vulnAction of vulnerableActions) {
      if (content.includes(vulnAction)) {
        this.addIssueToResult(result, filePath, 0, 'OUTDATED_ACTION_VERSION', 'WARNING',
          `Uses outdated action: ${vulnAction}`, 'Upgrade to latest major version');
        this.stats.policyViolations++;
      }
    }
  }

  checkRequiredSteps(workflow, result, filePath) {
    const jobs = this.extractJobs(workflow);
    
    for (const job of jobs) {
      const stepNames = (job.steps || []).map(s => s.name || s.uses || '').join(' ').toLowerCase();
      const stepUses = (job.steps || []).map(s => s.uses || '').join(' ');

      // Check for checkout
      if (!stepUses.includes('actions/checkout')) {
        this.addIssueToResult(result, filePath, 0, 'MISSING_CHECKOUT', 'WARNING',
          `Job "${job.name}" missing actions/checkout`, 'Add checkout step to access repository code');
      }

      // Check for setup steps based on job type
      if (stepNames.includes('node') || stepNames.includes('npm') || stepNames.includes('yarn')) {
        if (!stepUses.includes('actions/setup-node')) {
          this.addIssueToResult(result, filePath, 0, 'MISSING_SETUP_NODE', 'INFO',
            `Job "${job.name}" uses Node.js but missing setup-node`, 'Add actions/setup-node step');
        }
      }
    }
  }

  checkConcurrency(workflow, result, filePath) {
    if (!workflow.concurrency) {
      this.addIssueToResult(result, filePath, 0, 'MISSING_CONCURRENCY', 'INFO',
        'No concurrency control', 'Add concurrency group to cancel in-progress runs on new pushes');
    } else if (typeof workflow.concurrency === 'object') {
      if (!workflow.concurrency.cancelInProgress) {
        this.addIssueToResult(result, filePath, 0, 'CONCURRENCY_NO_CANCEL', 'WARNING',
          'Concurrency group without cancel-in-progress', 'Add cancel-in-progress: true');
      }
    }
  }

  addIssue(filePath, line, type, severity, message, suggestion) {
    this.issues.push({
      file: filePath,
      line,
      type,
      severity,
      message,
      suggestion
    });
  }

  addIssueToResult(result, filePath, line, type, severity, message, suggestion) {
    const issue = { file: filePath, line, type, severity, message, suggestion };
    result.issues.push(issue);
    this.issues.push({ ...issue, source: 'cicd' });
  }

  calculateWorkflowScore(result) {
    const weights = {
      ERROR: 20,
      WARNING: 5,
      INFO: 1
    };

    let deductions = 0;
    for (const issue of result.issues) {
      deductions += weights[issue.severity] || 0;
    }

    // Base score 100, deduct for issues
    const score = Math.max(0, 100 - deductions);
    return score;
  }

  calculateReliabilityScore() {
    if (this.workflowResults.length === 0) {
      this.stats.reliabilityScore = 0;
      return;
    }

    const totalScore = this.workflowResults.reduce((sum, w) => sum + w.score, 0);
    this.stats.reliabilityScore = Math.round(totalScore / this.workflowResults.length);
  }
}

module.exports = { CICDWorkflowAnalyzer };
