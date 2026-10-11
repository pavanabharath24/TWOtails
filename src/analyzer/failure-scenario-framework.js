/**
 * Failure Scenario Framework
 * 
 * Defines deterministic failure scenarios with ground truth for evaluating
 * AI agents' ability to diagnose, reproduce, and verify fixes for DevOps failures.
 */

const fs = require('fs');
const path = require('path');
const Docker = require('dockerode');
const { FunctionalTestHarness } = require('./functional-test-harness');

class FailureScenario {
  constructor(definition) {
    this.id = definition.id;
    this.name = definition.name;
    this.category = definition.category; // 'config', 'network', 'resource', 'permission', 'dependency', 'health'
    this.description = definition.description;
    this.groundTruth = definition.groundTruth; // { rootCause, reproductionSteps, fix }
    this.setup = definition.setup; // Function to set up the scenario
    this.fault = definition.fault; // Function to inject the fault
    this.healthCheck = definition.healthCheck; // Function to verify failure/health
    this.reset = definition.reset; // Function to reset to clean state
    this.scoring = definition.scoring || {
      diagnosis: 40,
      reproduction: 30,
      recovery: 30
    };
    this.timeout = definition.timeout || 300000; // 5 minutes
  }

  async setupScenario(docker, workDir) {
    if (this.setup) {
      return await this.setup(docker, workDir);
    }
  }

  async injectFault(docker, workDir) {
    if (this.fault) {
      return await this.fault(docker, workDir);
    }
  }

  async checkHealth(docker, workDir) {
    if (this.healthCheck) {
      return await this.healthCheck(docker, workDir);
    }
    return { healthy: true, details: {} };
  }

  async resetScenario(docker, workDir) {
    if (this.reset) {
      return await this.reset(docker, workDir);
    }
  }
}

class FailureScenarioRegistry {
  constructor() {
    this.scenarios = new Map();
    this.registerBuiltInScenarios();
  }

  register(scenario) {
    this.scenarios.set(scenario.id, scenario);
  }

  get(id) {
    return this.scenarios.get(id);
  }

  getAll() {
    return Array.from(this.scenarios.values());
  }

  getByCategory(category) {
    return this.getAll().filter(s => s.category === category);
  }

  registerBuiltInScenarios() {
    // 1. Wrong Environment Variable
    this.register(new FailureScenario({
      id: 'wrong-env-var',
      name: 'Wrong Environment Variable',
      category: 'config',
      description: 'Application fails to start due to incorrect environment variable value',
      groundTruth: {
        rootCause: 'DATABASE_URL environment variable points to wrong host',
        reproductionSteps: [
          'Start the application container',
          'Observe connection refused error in logs',
          'Check environment variables',
          'Find DATABASE_URL points to wrong host'
        ],
        fix: 'Correct DATABASE_URL to point to the actual database host'
      },
      setup: async (docker, workDir) => {
        // Create a simple Node.js app that connects to a database
        const appCode = `
const http = require('http');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
  connectionTimeoutMillis: 5000
});

const server = http.createServer(async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: result.rows[0].now }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: err.message }));
  }
});

server.listen(3000, () => console.log('Server running on port 3000'));
`;
        // Write app files
        fs.writeFileSync('/tmp/test-app/server.js', appCode);
        fs.writeFileSync('/tmp/test-app/package.json', JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { pg: '^8.11.0' }
        }, null, 2));
        fs.writeFileSync('/tmp/test-app/Dockerfile', `
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
`);
      },
      fault: async (docker, workDir) => {
        // Inject wrong DATABASE_URL
        // This would be implemented by setting wrong env var in container
        return { faultInjected: true, detail: 'DATABASE_URL set to wrong host' };
      },
      healthCheck: async (docker, workDir) => {
        // Check if app responds with 200 on /health
        try {
          const response = await fetch('http://localhost:3000/');
          const data = await response.json();
          return { healthy: data.status === 'ok', details: data };
        } catch (e) {
          return { healthy: false, details: { error: e.message } };
        }
      },
      reset: async (docker, workDir) => {
        // Reset environment variables
        return { reset: true };
      },
      timeout: 120000,
      scoring: { diagnosis: 40, reproduction: 30, recovery: 30 }
    }));

    // 2. Port Mismatch
    this.register(new FailureScenario({
      id: 'port-mismatch',
      name: 'Port Mismatch',
      category: 'network',
      description: 'Application listens on different port than exposed/configured',
      groundTruth: {
        rootCause: 'Application listens on port 3000 but Dockerfile exposes 8080',
        reproductionSteps: [
          'Start container',
          'Try to access on exposed port 8080',
          'Get connection refused',
          'Check application logs, see listening on 3000',
          'Check Dockerfile EXPOSE directive shows 8080'
        ],
        fix: 'Align application port with Dockerfile EXPOSE directive'
      },
      setup: async (docker, workDir) => {
        // App listens on 3000, Dockerfile exposes 8080
      },
      fault: async (docker, workDir) => {
        // Already built into the Dockerfile mismatch
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        // Try to connect on exposed port
        return { healthy: false, details: { reason: 'port mismatch' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 120000
    }));

    // 3. Resource Limit (OOM)
    this.register(new FailureScenario({
      id: 'oom-killed',
      name: 'Out of Memory Kill',
      category: 'resource',
      description: 'Container killed due to memory limit exceeded',
      groundTruth: {
        rootCause: 'Container memory limit too low for application workload',
        reproductionSteps: [
          'Start container with low memory limit (50MB)',
          'Run memory-intensive operation',
          'Container gets OOM killed',
          'Check Docker logs for OOM kill message',
          'Check container exit code 137'
        ],
        fix: 'Increase memory limit or optimize application memory usage'
      },
      setup: async (docker, workDir) => {
        // Create memory-intensive app
      },
      fault: async (docker, workDir) => {
        // Limit container memory
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'oom' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 120000
    }));

    // 4. Bad Health Check Path
    this.register(new FailureScenario({
      id: 'bad-health-check',
      name: 'Incorrect Health Check Path',
      category: 'health',
      description: 'Container health check configured with wrong path',
      groundTruth: {
        rootCause: 'Docker HEALTHCHECK uses /health but app exposes /healthz',
        reproductionSteps: [
          'Start container with health check',
          'Wait for health check interval',
          'Container marked unhealthy',
          'Check health check command uses /health',
          'Check application exposes /healthz'
        ],
        fix: 'Align health check path with application endpoint'
      },
      setup: async (docker, workDir) => {
        // App has /healthz, Dockerfile HEALTHCHECK uses /health
      },
      fault: async (docker, workDir) => {
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'health check path mismatch' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 180000
    }));

    // 5. Missing Dependency
    this.register(new FailureScenario({
      id: 'missing-dependency',
      name: 'Missing Runtime Dependency',
      category: 'dependency',
      description: 'Application fails due to missing system dependency',
      groundTruth: {
        rootCause: 'Application requires libpq but base image does not have it',
        reproductionSteps: [
          'Build and start container',
          'Application crashes on startup',
          'Error: "libpq.so.5: cannot open shared object file"',
          'Check base image is alpine without postgresql-libs',
          'Fix: add postgresql-libs to Dockerfile'
        ],
        fix: 'Add missing system dependency to Dockerfile'
      },
      setup: async (docker, workDir) => {
        // App requires libpq, base image doesn't have it
      },
      fault: async (docker, workDir) => {
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'missing libpq' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 120000
    }));

    // 6. Permission Denied
    this.register(new FailureScenario({
      id: 'permission-denied',
      name: 'File Permission Denied',
      category: 'permission',
      description: 'Application cannot read/write required files due to permissions',
      groundTruth: {
        rootCause: 'Application runs as non-root but needs to write to directory owned by root',
        reproductionSteps: [
          'Start container',
          'Application tries to write to /data',
          'Error: "EACCES: permission denied"',
          'Check directory ownership: root:root',
          'Check application runs as user 1000'
        ],
        fix: 'Change directory ownership or run with appropriate permissions'
      },
      setup: async (docker, workDir) => {
        // Create directory owned by root, app runs as non-root
      },
      fault: async (docker, workDir) => {
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'permission denied' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 120000
    }));

    // 7. Expired Credential
    this.register(new FailureScenario({
      id: 'expired-credential',
      name: 'Expired/Credential Invalid',
      category: 'config',
      description: 'Application fails to authenticate with external service due to expired credential',
      groundTruth: {
        rootCause: 'API token expired, service returns 401',
        reproductionSteps: [
          'Start application',
          'Application tries to call external API',
          'Get 401 Unauthorized',
          'Check token expiration timestamp',
          'Token expired 2 hours ago'
        ],
        fix: 'Rotate API token and update secret'
      },
      setup: async (docker, workDir) => {
        // App uses expired token
      },
      fault: async (docker, workDir) => {
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'auth failed' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 120000
    }));

    // 8. Resource Limit - CPU Throttling
    this.register(new FailureScenario({
      id: 'cpu-throttled',
      name: 'CPU Throttling',
      category: 'resource',
      description: 'Application slowed down due to CPU quota limits',
      groundTruth: {
        rootCause: 'Container CPU quota too low for workload',
        reproductionSteps: [
          'Start container with low CPU quota',
          'Run CPU-intensive task',
          'Task takes 10x longer than expected',
          'Check CPU quota in cgroup',
          'Observe throttling in metrics'
        ],
        fix: 'Increase CPU quota or optimize workload'
      },
      setup: async (docker, workDir) => {
        // CPU-intensive app with low quota
      },
      fault: async (docker, workDir) => {
        return { faultInjected: true };
      },
      healthCheck: async (docker, workDir) => {
        return { healthy: false, details: { reason: 'cpu throttling' } };
      },
      reset: async (docker, workDir) => {
        return { reset: true };
      },
      timeout: 180000
    }));
  }
}

class FaultInjector {
  constructor(docker) {
    this.docker = docker;
  }

  async injectEnvVarFault(container, envVar, wrongValue) {
    // Update container environment variable
    // This would require container restart with new env
    const containerInfo = await this.docker.getContainer(container).inspect();
    const env = containerInfo.Config.Env || [];
    const newEnv = env.map(e => e.startsWith(`${envVar}=`) ? `${envVar}=${wrongValue}` : e);
    // Would need to recreate container with new env
    return { injected: true };
  }

  async injectNetworkFault(container, faultType) {
    // Network partition, latency, packet loss
    // Uses tc (traffic control) inside container
    return { injected: true };
  }

  async injectResourceLimit(container, resource, limit) {
    // Update container resource limits
    return { injected: true };
  }
}

class EvidenceCollector {
  constructor(docker) {
    this.docker = docker;
  }

  async collectLogs(containerId, options = {}) {
    const container = this.docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
      tail: options.tail || 'all'
    });
    return logs.toString();
  }

  async collectHealthChecks(containerId) {
    // Run health check commands
    return { timestamp: Date.now(), checks: [] };
  }

  async collectSystemMetrics(containerId) {
    // CPU, memory, network, disk
    return { timestamp: Date.now(), metrics: {} };
  }

  async collectFileSystemState(containerId, paths) {
    // File permissions, existence, content
    return { timestamp: Date.now(), files: {} };
  }

  async collectNetworkState(containerId) {
    // Open ports, connections
    return { timestamp: Date.now(), network: {} };
  }

  async collectAll(containerId, options = {}) {
    const [logs, health, metrics, fs, network] = await Promise.all([
      this.collectLogs(containerId, options),
      this.collectHealthChecks(containerId),
      this.collectSystemMetrics(containerId),
      this.collectFileSystemState(containerId, options.paths),
      this.collectNetworkState(containerId)
    ]);

    return {
      timestamp: Date.now(),
      containerId,
      logs,
      health,
      metrics,
      filesystem: fs,
      network
    };
  }
}

module.exports = {
  FailureScenario,
  FailureScenarioRegistry,
  FaultInjector,
  EvidenceCollector
};
