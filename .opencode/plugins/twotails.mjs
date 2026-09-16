/**
 * TWOtails OpenCode Plugin
 * AI code connectivity analyzer
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

function loadSkills() {
  const skills = [];
  const skillDirs = fs.readdirSync(SKILLS_DIR).filter(d =>
    fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
  );

  for (const dir of skillDirs) {
    const skillFile = path.join(SKILLS_DIR, dir, 'skill.md');
    if (fs.existsSync(skillFile)) {
      skills.push({
        name: dir,
        content: fs.readFileSync(skillFile, 'utf8')
      });
    }
  }

  return skills;
}

function injectInstructions() {
  const agentsFile = path.join(__dirname, '..', '..', 'AGENTS.md');
  if (fs.existsSync(agentsFile)) {
    return fs.readFileSync(agentsFile, 'utf8');
  }
  return '';
}

module.exports = {
  name: 'twotails',
  version: '1.0.0',
  description: 'AI code connectivity analyzer - traces signals between sender and receiver endpoints',
  
  hooks: {
    'session:start': async (context) => {
      const instructions = injectInstructions();
      return {
        type: 'instructions',
        content: instructions
      };
    }
  },

  commands: [
    {
      name: 'twotails',
      description: 'Set TWOtails intensity level (lite/full/ultra/off)',
      handler: async (args) => {
        const mode = args[0] || 'full';
        const validModes = ['lite', 'full', 'ultra', 'off'];
        
        if (!validModes.includes(mode)) {
          return `Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`;
        }

        const flagPath = path.join(process.env.HOME || '~', '.twotails-active');
        fs.writeFileSync(flagPath, JSON.stringify({
          mode,
          changedAt: new Date().toISOString()
        }));

        return `TWOtails mode set to: ${mode}`;
      }
    },
    {
      name: 'twotails-scan',
      description: 'Scan codebase for broken connections and missing functions',
      handler: async (args) => {
        const dir = args[0] || './';
        const { scan } = require('../../src/analyzer/ast-parser');
        const results = await scan(dir, {});
        
        const broken = results.filter(r => r.status.includes('BROKEN'));
        return `Found ${broken.length} broken connections in ${results.length} total connections`;
      }
    },
    {
      name: 'twotails-trace',
      description: 'Trace signals from a specific file using bidirectional matching',
      handler: async (args) => {
        const file = args[0];
        if (!file) return 'Please specify a file to trace';
        
        const { SignalMatcher } = require('../../src/tracer/signal-matcher');
        const matcher = new SignalMatcher();
        const results = await matcher.trace(file);
        
        return matcher.formatResults(results);
      }
    },
    {
      name: 'twotails-test',
      description: 'Test UI elements in virtual memory sandbox',
      handler: async (args) => {
        const dir = args[0] || './';
        const { testVirtualMemory } = require('../../src/virtual-memory/memory-manager');
        const results = await testVirtualMemory(dir, {});
        
        return `Tested ${results.length} elements`;
      }
    },
    {
      name: 'twotails-fix',
      description: 'Auto-fix detected issues',
      handler: async (args) => {
        const dir = args[0] || './';
        const { fix } = require('../../src/reporter/results-formatter');
        await fix(dir, { auto: true });
        
        return 'Fixes applied';
      }
    },
    {
      name: 'twotails-help',
      description: 'Show TWOtails help and commands',
      handler: async () => {
        return `
TWOtails Commands:
  /twotails [lite|full|ultra|off] - Set intensity level
  /twotails-scan [dir] - Scan for broken connections
  /twotails-trace [file] - Trace signals from file
  /twotails-test [dir] - Test in virtual memory
  /twotails-fix [dir] - Auto-fix issues
  /twotails-help - Show this help
        `.trim();
      }
    }
  ],

  skills: loadSkills()
};
