/**
 * TWOtails Connectivity Checker
 * Checks if connections between code elements are valid
 */

class ConnectivityChecker {
  constructor(graph) {
    this.graph = graph;
    this.issues = [];
  }

  checkAll() {
    this.issues = [];

    this.checkFunctionCalls();
    this.checkImports();
    this.checkEventHandlers();
    this.checkAPICalls();

    return this.issues;
  }

  checkFunctionCalls() {
    const calls = [...this.graph.nodes.values()].filter(n => n.type === 'function_call');
    const definitions = [...this.graph.nodes.values()].filter(n => n.type === 'function_definition');

    calls.forEach(call => {
      const def = definitions.find(d => d.name === call.name);
      if (!def) {
        this.issues.push({
          type: 'MISSING_FUNCTION',
          severity: 'ERROR',
          message: `Function "${call.name}" is called but not defined`,
          file: call.file,
          line: call.line,
          suggestion: `Define function "${call.name}" in ${call.file}`
        });
      }
    });
  }

  checkImports() {
    const imports = [...this.graph.nodes.values()].filter(n => n.type === 'import');

    imports.forEach(imp => {
      const usage = [...this.graph.nodes.values()].find(
        n => n.name === imp.name && n.file === imp.file && n.line !== imp.line
      );

      if (!usage) {
        this.issues.push({
          type: 'UNUSED_IMPORT',
          severity: 'WARNING',
          message: `Import "${imp.name}" is not used`,
          file: imp.file,
          line: imp.line,
          suggestion: `Remove unused import "${imp.name}"`
        });
      }
    });
  }

  checkEventHandlers() {
    const handlers = [...this.graph.nodes.values()].filter(n => n.type === 'event_handler');
    const definitions = [...this.graph.nodes.values()].filter(n => n.type === 'function_definition');

    handlers.forEach(handler => {
      const def = definitions.find(d => d.name === handler.name);
      if (!def) {
        this.issues.push({
          type: 'MISSING_HANDLER',
          severity: 'ERROR',
          message: `Event handler "${handler.name}" is referenced but not defined`,
          file: handler.file,
          line: handler.line,
          suggestion: `Define handler function "${handler.name}"`
        });
      }
    });
  }

  checkAPICalls() {
    const apiCalls = [...this.graph.nodes.values()].filter(n => n.type === 'api_call');
    const routes = [...this.graph.nodes.values()].filter(n => n.type === 'route_definition');

    apiCalls.forEach(call => {
      const route = routes.find(r => r.path === call.name);
      if (!route) {
        this.issues.push({
          type: 'MISSING_ROUTE',
          severity: 'ERROR',
          message: `API call "${call.name}" has no corresponding route`,
          file: call.file,
          line: call.line,
          suggestion: `Add route handler for "${call.name}"`
        });
      }
    });
  }

  getIssueStats() {
    return {
      total: this.issues.length,
      errors: this.issues.filter(i => i.severity === 'ERROR').length,
      warnings: this.issues.filter(i => i.severity === 'WARNING').length,
      info: this.issues.filter(i => i.severity === 'INFO').length
    };
  }
}

module.exports = { ConnectivityChecker };
