/**
 * Functional Test Harness
 * 
 * Runs actual builds and tests in isolated Docker containers.
 * Supports multiple languages and CI/CD environments.
 */

const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

class FunctionalTestHarness {
  constructor(options = {}) {
    this.docker = new Docker(options.docker || {});
    this.defaultTimeout = options.timeout || 120000; // 2 minutes
    this.workDir = options.workDir || '/tmp/twotails-test';
  }

  async runTestSuite(projectDir, config = {}) {
    const results = {
      projectDir,
      language: config.language || this.detectLanguage(projectDir),
      build: null,
      tests: null,
      lint: null,
      startTime: Date.now(),
      endTime: null,
      success: false,
      logs: []
    };

    try {
      // Create isolated workspace
      const workspace = await this.createWorkspace(projectDir);
      
      // Run build if configured
      if (config.buildCommand) {
        results.build = await this.runCommand(workspace, config.buildCommand, { 
          timeout: config.buildTimeout || this.defaultTimeout 
        });
        results.logs.push({ phase: 'build', ...results.build });
        if (!results.build.success) {
          results.endTime = Date.now();
          return results;
        }
      }

      // Run tests if configured
      if (config.testCommand) {
        results.tests = await this.runCommand(workspace, config.testCommand, {
          timeout: config.testTimeout || this.defaultTimeout
        });
        results.logs.push({ phase: 'test', ...results.tests });
        if (!results.tests.success) {
          results.endTime = Date.now();
          return results;
        }
      }

      // Run lint if configured
      if (config.lintCommand) {
        results.lint = await this.runCommand(workspace, config.lintCommand, {
          timeout: config.lintTimeout || this.defaultTimeout
        });
        results.logs.push({ phase: 'lint', ...results.lint });
        if (!results.lint.success) {
          results.endTime = Date.now();
          return results;
        }
      }

      results.success = true;
      results.endTime = Date.now();
      return results;

    } catch (error) {
      results.endTime = Date.now();
      results.error = error.message;
      results.logs.push({ phase: 'error', message: error.message, stack: error.stack });
      return results;
    }
  }

  async createWorkspace(sourceDir) {
    const workspaceId = `twotails-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workspaceDir = path.join(this.workDir, workspaceId);
    
    // Create workspace directory
    fs.mkdirSync(workspaceDir, { recursive: true });
    
    // Copy project files (exclude node_modules, .git, etc.)
    await this.copyProject(sourceDir, workspaceDir);
    
    return workspaceDir;
  }

  async copyProject(sourceDir, destDir) {
    const exclude = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.cache'];
    
    const copyRecursive = (src, dest) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        const baseName = path.basename(src);
        if (exclude.includes(baseName)) return;
        
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
          copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    copyRecursive(sourceDir, destDir);
  }

  async runCommand(workspaceDir, command, options = {}) {
    const timeout = options.timeout || this.defaultTimeout;
    const shell = options.shell || '/bin/bash';
    const env = { ...process.env, ...options.env };
    
    const container = await this.docker.createContainer({
      Image: this.getImageForLanguage(options.language || 'node'),
      Cmd: [shell, '-c', command],
      WorkingDir: '/workspace',
      HostConfig: {
        Binds: [`${workspaceDir}:/workspace`],
        Memory: 512 * 1024 * 1024, // 512MB
        CpuQuota: 50000, // 0.5 CPU
        NetworkMode: 'none', // No network for security
        AutoRemove: true
      },
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      User: '1000:1000' // Non-root user
    });

    return new Promise(async (resolve) => {
      const startTime = Date.now();
      let output = '';
      let errorOutput = '';
      
      try {
        await container.start();
        
        // Stream logs
        const stream = await container.attach({ 
          stream: true, 
          stdout: true, 
          stderr: true 
        });
        
        stream.on('data', (chunk) => {
          const header = chunk.slice(0, 8);
          const isStderr = header[0] === 2;
          const content = chunk.slice(8).toString('utf8');
          if (isStderr) errorOutput += content;
          else output += content;
        });
        
        // Wait with timeout
        const waitPromise = container.wait();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        );
        
        const result = await Promise.race([waitPromise, timeoutPromise]);
        const statusCode = result.StatusCode;
        
        resolve({
          success: statusCode === 0,
          exitCode: statusCode,
          stdout: output,
          stderr: errorOutput,
          duration: Date.now() - startTime,
          command
        });
        
      } catch (error) {
        // Try to get container logs on error
        try {
          const logs = await container.logs({ stdout: true, stderr: true });
          output += logs.toString();
        } catch (e) {}
        
        resolve({
          success: false,
          exitCode: -1,
          stdout: output,
          stderr: errorOutput + '\n' + error.message,
          duration: Date.now() - startTime,
          command,
          error: error.message
        });
      } finally {
        try { await container.remove({ force: true }); } catch (e) {}
      }
    });
  }

  getImageForLanguage(language) {
    const images = {
      node: 'node:20-alpine',
      python: 'python:3.12-alpine',
      go: 'golang:1.22-alpine',
      java: 'eclipse-temurin:21-jdk-alpine',
      ruby: 'ruby:3.3-alpine',
      rust: 'rust:1.78-alpine',
      php: 'php:8.3-cli-alpine',
      dotnet: 'mcr.microsoft.com/dotnet/sdk:8.0-alpine',
      default: 'node:20-alpine'
    };
    return images[language] || images.default;
  }

  detectLanguage(projectDir) {
    const files = fs.readdirSync(projectDir);
    if (files.includes('package.json')) return 'node';
    if (files.includes('pyproject.toml') || files.includes('requirements.txt') || files.includes('setup.py')) return 'python';
    if (files.includes('go.mod')) return 'go';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'java';
    if (files.includes('Gemfile')) return 'ruby';
    if (files.includes('Cargo.toml')) return 'rust';
    if (files.includes('composer.json')) return 'php';
    if (files.some(f => f.endsWith('.csproj'))) return 'dotnet';
    return 'node';
  }

  async cleanup() {
    try {
      const containers = await this.docker.listContainers({ 
        all: true, 
        filters: { label: ['twotails=true'] } 
      });
      
      for (const container of containers) {
        try {
          const c = this.docker.getContainer(container.Id);
          await c.remove({ force: true });
        } catch (e) {}
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  }
}

module.exports = { FunctionalTestHarness };
