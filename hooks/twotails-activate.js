#!/usr/bin/env node

/**
 * TWOtails Activation Hook
 * Activates TWOtails mode on first prompt
 */

const fs = require('fs');
const path = require('path');

const ACTIVE_FLAG = path.join(process.env.HOME || '~', '.twotails-active');
const DEFAULT_MODE = process.env.TWOTAILS_DEFAULT_MODE || 'full';

function activate() {
  // Check if already active
  if (fs.existsSync(ACTIVE_FLAG)) {
    return;
  }

  // Create activation flag
  fs.writeFileSync(ACTIVE_FLAG, JSON.stringify({
    mode: DEFAULT_MODE,
    activatedAt: new Date().toISOString()
  }));

  console.log(`TWOtails activated in ${DEFAULT_MODE} mode`);
}

activate();
