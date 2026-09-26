#!/usr/bin/env node

/**
 * TWOtails Context Exporter
 * Export project context to continue in another AI tool
 */

const fs = require('fs');
const path = require('path');

function generateContext(projectDir) {
  const contextDir = path.join(projectDir, '.ai-context');
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  // Read package.json if exists
  let packageInfo = {};
  const packagePath = path.join(projectDir, 'package.json');
  if (fs.existsSync(packagePath)) {
    packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  }

  // Read README if exists
  let readme = '';
  const readmePath = path.join(projectDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    readme = fs.readFileSync(readmePath, 'utf8').substring(0, 2000);
  }

  // Scan directory structure
  const structure = scanDir(projectDir, [], 0, 2);

  // Generate CONTEXT.md
  const context = `# Project Context

## Project Info
- Name: ${packageInfo.name || path.basename(projectDir)}
- Version: ${packageInfo.version || '1.0.0'}
- Description: ${packageInfo.description || 'No description'}

## Directory Structure
\`\`\`
${structure}
\`\`\`

## README Summary
${readme || 'No README found'}

## Key Files
${getKeyFiles(projectDir)}

## Last Updated
${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(projectDir, 'CONTEXT.md'), context);

  // Generate TODO.md
  const todo = `# TODO

## High Priority
- [ ] Complete current task

## Medium Priority
- [ ] Add tests
- [ ] Update documentation

## Low Priority
- [ ] Refactor code
- [ ] Optimize performance
`;

  fs.writeFileSync(path.join(projectDir, 'TODO.md'), todo);

  // Generate .ai-context/project.md
  const project = `# Project: ${packageInfo.name || path.basename(projectDir)}

## What It Does
${packageInfo.description || 'Add description here'}

## Tech Stack
${getTechStack(packageInfo)}

## Current State
- Tests: Check package.json scripts
- Status: In progress

## How to Run
\`\`\`bash
${getRunCommands(packageInfo)}
\`\`\`
`;

  fs.writeFileSync(path.join(contextDir, 'project.md'), project);

  console.log('✅ Context files generated:');
  console.log('   - CONTEXT.md');
  console.log('   - TODO.md');
  console.log('   - .ai-context/project.md');
  console.log('');
  console.log('📋 Copy these files to your new project, then tell AI:');
  console.log('   "Read CONTEXT.md and continue where we left off"');
}

function scanDir(dir, lines, depth, maxDepth) {
  if (depth >= maxDepth) return lines.join('\n');
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const ignore = ['node_modules', '.git', 'dist', 'coverage', '__pycache__'];
  
  items
    .filter(item => !ignore.includes(item.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 50) // Limit items
    .forEach(item => {
      const indent = '  '.repeat(depth);
      if (item.isDirectory()) {
        lines.push(`${indent}${item.name}/`);
        scanDir(path.join(dir, item.name), lines, depth + 1, maxDepth);
      } else {
        lines.push(`${indent}${item.name}`);
      }
    });
  
  return lines.join('\n');
}

function getKeyFiles(dir) {
  const files = [];
  const important = [
    'package.json', 'README.md', 'AGENTS.md', 'opencode.json',
    'src/index.js', 'src/main.js', 'src/app.js',
    'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml'
  ];
  
  important.forEach(file => {
    if (fs.existsSync(path.join(dir, file))) {
      files.push(`- ${file}`);
    }
  });
  
  return files.join('\n') || '- No key files found';
}

function getTechStack(packageInfo) {
  const deps = packageInfo.dependencies || {};
  const devDeps = packageInfo.devDependencies || {};
  const allDeps = { ...deps, ...devDeps };
  
  const stack = [];
  if (allDeps.react) stack.push('React');
  if (allDeps.vue) stack.push('Vue');
  if (allDeps.angular) stack.push('Angular');
  if (allDeps.express) stack.push('Express');
  if (allDeps.next) stack.push('Next.js');
  if (allDeps.typescript) stack.push('TypeScript');
  if (allDeps.jest || allDeps.mocha) stack.push('Testing');
  if (allDeps.webpack || allDeps.vite) stack.push('Bundler');
  
  return stack.length > 0 ? stack.map(s => `- ${s}`).join('\n') : '- Add tech stack';
}

function getRunCommands(packageInfo) {
  const scripts = packageInfo.scripts || {};
  const commands = [];
  
  if (scripts.start) commands.push('npm start');
  if (scripts.dev) commands.push('npm run dev');
  if (scripts.test) commands.push('npm test');
  if (scripts.build) commands.push('npm run build');
  
  return commands.length > 0 ? commands.join('\n') : '# Add run commands';
}

// Run if called directly
if (require.main === module) {
  const dir = process.argv[2] || './';
  generateContext(path.resolve(dir));
}

module.exports = { generateContext };
