/**
 * TWOtails WebSocket Analyzer
 * Checks WebSocket connections, handlers, reconnection logic
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
const walk = require('acorn-walk');

// WebSocket patterns
const WS_PATTERNS = {
  // Connection patterns
  newWebSocket: {
    pattern: /new\s+WebSocket\s*\(/,
    type: 'WEBSOCKET_CONNECTION',
    message: 'WebSocket connection created'
  },
  wsConnect: {
    pattern: /(?:ws|websocket|socket)\s*\.\s*connect\s*\(/,
    type: 'WS_CONNECT',
    message: 'WebSocket connect() call'
  },
  socketIo: {
    pattern: /io\s*\(\s*(?:['"][^'"]+['"]|{[^}]*})\s*\)/,
    type: 'SOCKET_IO_CONNECTION',
    message: 'Socket.IO connection'
  },

  // Event handlers
  onOpen: {
    pattern: /(?:ws|socket|connection)\s*\.\s*on\s*\(\s*['"]open['"]/,
    type: 'WS_ON_OPEN',
    message: 'WebSocket onopen handler'
  },
  onMessage: {
    pattern: /(?:ws|socket|connection)\s*\.\s*on\s*\(\s*['"]message['"]/,
    type: 'WS_ON_MESSAGE',
    message: 'WebSocket onmessage handler'
  },
  onClose: {
    pattern: /(?:ws|socket|connection)\s*\.\s*on\s*\(\s*['"]close['"]/,
    type: 'WS_ON_CLOSE',
    message: 'WebSocket onclose handler'
  },
  onError: {
    pattern: /(?:ws|socket|connection)\s*\.\s*on\s*\(\s*['"]error['"]/,
    type: 'WS_ON_ERROR',
    message: 'WebSocket onerror handler'
  },

  // Send patterns
  wsSend: {
    pattern: /(?:ws|socket|connection)\s*\.\s*send\s*\(/,
    type: 'WS_SEND',
    message: 'WebSocket send() call'
  },

  // Reconnection patterns
  reconnect: {
    pattern: /reconnect|retry|backoff/i,
    type: 'RECONNECTION_LOGIC',
    message: 'Reconnection logic detected'
  },
  heartbeat: {
    pattern: /heartbeat|ping|pong|keepalive/i,
    type: 'HEARTBEAT',
    message: 'Heartbeat/ping-pong detected'
  }
};

// Common WebSocket mistakes
const WS_MISTAKES = [
  {
    pattern: /WebSocket\s*\([^)]*\)(?!\s*\.on\s*\(\s*['"]error)/,
    type: 'NO_ERROR_HANDLER',
    severity: 'ERROR',
    message: 'WebSocket created without error handler',
    suggestion: 'Add .on("error", handler) to handle connection errors'
  },
  {
    pattern: /(?:ws|socket)\s*\.\s*send\s*\([^)]*\)(?!\s*\.catch|try)/,
    type: 'SEND_NO_ERROR_HANDLING',
    severity: 'WARNING',
    message: 'WebSocket send() without error handling',
    suggestion: 'Add try/catch or .catch() for send failures'
  },
  {
    pattern: /(?:ws|socket)\s*\.\s*close\s*\(\s*\)(?!\s*\.catch|try)/,
    type: 'CLOSE_NO_ERROR_HANDLING',
    severity: 'INFO',
    message: 'WebSocket close() without error handling',
    suggestion: 'Add try/catch for close failures'
  },
  {
    pattern: /setInterval\s*\(\s*(?:function|\([^)]*\)\s*=>)\s*\{[^}]*send/,
    type: 'POLLING_INSTEAD_OF_WS',
    severity: 'INFO',
    message: 'Polling pattern detected - consider WebSocket',
    suggestion: 'Use WebSocket for real-time communication instead of polling'
  }
];

class WebSocketAnalyzer {
  constructor() {
    this.issues = [];
    this.connections = [];
    this.handlers = [];
    this.stats = {
      filesScanned: 0,
      connections: 0,
      handlers: 0,
      issues: 0,
      errors: 0,
      warnings: 0
    };
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

    for (const file of files) {
      try {
        this.scanFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;

    return {
      issues: this.issues,
      connections: this.connections,
      handlers: this.handlers,
      stats: this.stats
    };
  }

  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    this.stats.filesScanned++;

    // Regex-based scanning
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      this.checkLine(filePath, line, idx + 1);
    });

    // Check for common mistakes
    WS_MISTAKES.forEach(check => {
      if (check.pattern.test(content)) {
        const line = this.findLineNumber(content, check.pattern);
        this.issues.push({
          file: filePath,
          line,
          type: check.type,
          severity: check.severity,
          message: check.message,
          suggestion: check.suggestion
        });
      }
    });

    // Check for missing reconnection logic
    const hasConnection = /new\s+WebSocket|\.connect\s*\(|io\s*\(/.test(content);
    const hasReconnect = /reconnect|retry|backoff|onclose.*connect/i.test(content);

    if (hasConnection && !hasReconnect) {
      this.issues.push({
        file: filePath,
        line: 1,
        type: 'NO_RECONNECTION',
        severity: 'WARNING',
        message: 'WebSocket connection without reconnection logic',
        suggestion: 'Add reconnection logic with exponential backoff'
      });
    }

    // Check for missing heartbeat
    const hasHeartbeat = /heartbeat|ping|pong|keepalive/i.test(content);
    if (hasConnection && !hasHeartbeat) {
      this.issues.push({
        file: filePath,
        line: 1,
        type: 'NO_HEARTBEAT',
        severity: 'INFO',
        message: 'WebSocket connection without heartbeat/ping',
        suggestion: 'Add heartbeat to detect stale connections'
      });
    }
  }

  checkLine(filePath, line, lineNum) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

    for (const [name, check] of Object.entries(WS_PATTERNS)) {
      if (check.pattern.test(line)) {
        if (check.type === 'WEBSOCKET_CONNECTION' || check.type === 'SOCKET_IO_CONNECTION') {
          this.connections.push({
            file: filePath,
            line: lineNum,
            type: check.type
          });
          this.stats.connections++;
        } else if (check.type.includes('ON_')) {
          this.handlers.push({
            file: filePath,
            line: lineNum,
            type: check.type
          });
          this.stats.handlers++;
        }
      }
    }
  }

  findLineNumber(content, pattern) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  getRecommendations() {
    const recommendations = [];

    const noError = this.issues.filter(i => i.type === 'NO_ERROR_HANDLER');
    if (noError.length > 0) {
      recommendations.push({
        type: 'ERROR_HANDLING',
        message: `${noError.length} WebSocket connections without error handlers`,
        suggestion: 'Add .on("error") handler to all WebSocket connections'
      });
    }

    const noReconnect = this.issues.filter(i => i.type === 'NO_RECONNECTION');
    if (noReconnect.length > 0) {
      recommendations.push({
        type: 'RECONNECTION',
        message: `${noReconnect.length} connections without reconnection logic`,
        suggestion: 'Add reconnection with exponential backoff'
      });
    }

    if (this.connections.length > 0 && this.handlers.length === 0) {
      recommendations.push({
        type: 'NO_HANDLERS',
        message: 'WebSocket connections found but no event handlers',
        suggestion: 'Add onmessage, onerror, onclose handlers'
      });
    }

    return recommendations;
  }
}

module.exports = { WebSocketAnalyzer, WS_PATTERNS, WS_MISTAKES };
