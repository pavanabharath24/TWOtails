#!/usr/bin/env node

/**
 * TWOtails Configuration
 * Manages mode settings and preferences
 */

const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(process.env.HOME || '~', '.config', 'twotails');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const ACTIVE_FLAG = path.join(process.env.HOME || '~', '.twotails-active');

const DEFAULT_CONFIG = {
  defaultMode: 'full',
  scanOnSave: false,
  virtualMemoryTimeout: 30000,
  maxFileSize: 1024 * 1024,
  ignoreDirs: ['node_modules', 'dist', '.git', 'coverage'],
  fileExtensions: ['.js', '.jsx', '.ts', '.tsx', '.py']
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getMode() {
  if (!fs.existsSync(ACTIVE_FLAG)) {
    return loadConfig().defaultMode;
  }

  try {
    const flag = JSON.parse(fs.readFileSync(ACTIVE_FLAG, 'utf8'));
    return flag.mode || 'full';
  } catch {
    return 'full';
  }
}

function setMode(mode) {
  const validModes = ['lite', 'full', 'ultra', 'off'];
  if (!validModes.includes(mode)) {
    console.error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    process.exit(1);
  }

  fs.writeFileSync(ACTIVE_FLAG, JSON.stringify({
    mode: mode,
    changedAt: new Date().toISOString()
  }));

  console.log(`TWOtails mode set to: ${mode}`);
}

module.exports = { loadConfig, saveConfig, getMode, setMode };
