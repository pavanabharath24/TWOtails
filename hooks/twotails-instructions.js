#!/usr/bin/env node

/**
 * TWOtails Instructions Hook
 * Injects TWOtails rules into agent context
 */

const fs = require('fs');
const path = require('path');

const ACTIVE_FLAG = path.join(process.env.HOME || '~', '.twotails-active');
const RULES_PATH = path.join(__dirname, '..', 'AGENTS.md');

function getMode() {
  if (!fs.existsSync(ACTIVE_FLAG)) {
    return 'off';
  }

  try {
    const flag = JSON.parse(fs.readFileSync(ACTIVE_FLAG, 'utf8'));
    return flag.mode || 'full';
  } catch {
    return 'full';
  }
}

function injectRules() {
  const mode = getMode();

  if (mode === 'off') {
    return;
  }

  const rules = fs.readFileSync(RULES_PATH, 'utf8');

  // Output rules to stdout for agent context injection
  console.log(JSON.stringify({
    type: 'instructions',
    content: rules,
    mode: mode
  }));
}

injectRules();
