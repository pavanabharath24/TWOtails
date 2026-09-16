/**
 * TWOtails Code Graph
 * Builds and manages the code dependency graph
 */

class CodeGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.adjacencyList = new Map();
  }

  addNode(id, data) {
    this.nodes.set(id, { id, ...data });
    if (!this.adjacencyList.has(id)) {
      this.adjacencyList.set(id, []);
    }
  }

  addEdge(fromId, toId, data = {}) {
    const edge = { from: fromId, to: toId, ...data };
    this.edges.set(`${fromId}->${toId}`, edge);

    if (!this.adjacencyList.has(fromId)) {
      this.adjacencyList.set(fromId, []);
    }
    this.adjacencyList.get(fromId).push(toId);
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  getNeighbors(id) {
    return this.adjacencyList.get(id) || [];
  }

  findPath(fromId, toId, visited = new Set()) {
    if (fromId === toId) return [fromId];
    visited.add(fromId);

    const neighbors = this.getNeighbors(fromId);
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const path = this.findPath(neighbor, toId, visited);
        if (path) return [fromId, ...path];
      }
    }

    return null;
  }

  findDisconnectedNodes() {
    const disconnected = [];
    for (const [id] of this.nodes) {
      const hasIncoming = [...this.edges.values()].some(e => e.to === id);
      const hasOutgoing = this.adjacencyList.get(id)?.length > 0;

      if (!hasIncoming && !hasOutgoing) {
        disconnected.push(id);
      }
    }
    return disconnected;
  }

  findOrphanNodes() {
    const orphans = [];
    for (const [id] of this.nodes) {
      const hasIncoming = [...this.edges.values()].some(e => e.to === id);
      if (!hasIncoming) {
        orphans.push(id);
      }
    }
    return orphans;
  }

  detectCycles() {
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();

    const dfs = (node, path = []) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = this.getNeighbors(node);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor, [...path]);
          if (cycle) return cycle;
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor);
          return path.slice(cycleStart);
        }
      }

      recursionStack.delete(node);
      return null;
    };

    for (const [id] of this.nodes) {
      if (!visited.has(id)) {
        const cycle = dfs(id);
        if (cycle) cycles.push(cycle);
      }
    }

    return cycles;
  }

  getStats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      disconnected: this.findDisconnectedNodes().length,
      orphans: this.findOrphanNodes().length,
      cycles: this.detectCycles().length
    };
  }
}

module.exports = { CodeGraph };
