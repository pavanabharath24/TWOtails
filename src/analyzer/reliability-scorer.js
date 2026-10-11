class ReliabilityScorer {
  constructor(config = {}) {
    this.weights = config.weights || {
      syntax: 15, triggers: 10, jobs: 10, actionPinning: 15,
      permissions: 15, secrets: 15, security: 10,
      concurrency: 5, requiredSteps: 5,
      diagnosis: 40, reproduction: 30, recovery: 30
    };
    this.thresholds = config.thresholds || { excellent: 90, good: 75, fair: 60, poor: 0 };
  }

  scoreCICDWorkflow(result) {
    const scores = {
      syntax: this.scoreSyntax(result),
      triggers: this.scoreTriggers(result),
      jobs: this.scoreJobs(result),
      actionPinning: this.scoreActionPinning(result),
      permissions: this.scorePermissions(result),
      secrets: this.scoreSecrets(result),
      security: this.scoreSecurity(result),
      concurrency: this.scoreConcurrency(result),
      requiredSteps: this.scoreRequiredSteps(result)
    };
    const componentScores = Object.entries(scores).map(([c, s]) => ({
      component: c, score: s, weight: this.weights[c] || 0,
      weighted: s * (this.weights[c] || 0)
    }));
    const totalWeight = componentScores.reduce((sum, c) => sum + c.weight, 0);
    const weightedSum = componentScores.reduce((sum, c) => sum + c.weighted, 0);
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    return { overall, level: this.getLevel(overall), components: componentScores.map(c => ({ component: c.component, score: c.score, weight: c.weight, weighted: c.weighted })), breakdown: this.generateBreakdown(result, scores), passed: overall >= this.thresholds.good };
  }
  scoreSyntax(r) { return r.syntaxErrors > 0 ? 0 : 100; }
  scoreTriggers(r) { const i = r.issues.filter(x => x.type.includes('TRIGGER')); if (i.some(x => x.severity === 'ERROR')) return 0; if (i.some(x => x.severity === 'WARNING')) return 60; return 100; }
  scoreJobs(r) { const ii = r.issues.filter(x => x.type.includes('JOB') || x.type.includes('RUNS_ON') || x.type.includes('STEPS')); const e = ii.filter(x => x.severity === 'ERROR').length; const w = ii.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - e * 25 - w * 10); }
  scoreActionPinning(r) { const i = r.issues.filter(x => x.type.includes('ACTION')); const e = i.filter(x => x.severity === 'ERROR').length; const w = i.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - e * 30 - i.filter(x => x.severity === 'WARNING').length * 15); }
  scorePermissions(r) { const i = r.issues.filter(x => x.type.includes('PERMISSION')); const e = i.filter(x => x.severity === 'ERROR').length; const w = i.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - e * 25 - w * 10); }
  scoreSecrets(r) { const i = r.issues.filter(x => x.type.includes('SECRET')); const e = i.filter(x => x.severity === 'ERROR').length; const w = i.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - e * 40 - w * 15); }
  scoreSecurity(r) { const i = r.issues.filter(x => x.type.includes('SECURITY') || ['CURL_PIPE_BASH','SUDO_USAGE','MISSING_SET_E'].includes(x.type)); const e = i.filter(x => x.severity === 'ERROR').length; const w = i.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - e * 30 - w * 10); }
  scoreConcurrency(r) { const i = r.issues.filter(x => x.type.includes('CONCURRENCY')); const w = i.filter(x => x.severity === 'WARNING').length; return w > 0 ? 70 : 100; }
  scoreRequiredSteps(r) { const i = r.issues.filter(x => x.type.includes('MISSING_')); const w = i.filter(x => x.severity === 'WARNING').length; return Math.max(0, 100 - w * 15); }

  scoreFailureReproduction(agentResult, groundTruth) {
    const d = this.scoreDiagnosis(agentResult.diagnosis, groundTruth);
    const r = this.scoreReproduction(agentResult.reproduction, groundTruth);
    const rec = this.scoreRecovery(agentResult.recovery, groundTruth);
    const scores = { diagnosis: d, reproduction: r, recovery: rec };
    const cs = Object.entries(scores).map(([c, s]) => ({ component: c, score: s, weight: this.weights[c] || 0, weighted: s * (this.weights[c] || 0) }));
    const tw = cs.reduce((sum, c) => sum + c.weight, 0);
    const ws = cs.reduce((sum, c) => sum + c.weighted, 0);
    const o = tw > 0 ? Math.round(ws / tw) : 0;
    return { overall: o, level: this.getLevel(o), components: cs.map(c => ({ component: c.component, score: c.score, weight: c.weight, weighted: c.weighted })), breakdown: { diagnosis: this.explainDiagnosis(d, groundTruth), reproduction: this.explainReproduction(r, groundTruth), recovery: this.explainRecovery(rec, groundTruth) }, passed: o >= this.thresholds.good };
  }
  scoreDiagnosis(a, g) { if (!a || !a.rootCause) return 0; const ac = a.rootCause.toLowerCase(); const tc = g.rootCause.toLowerCase(); if (ac === tc) return 100; const tt = this.extractKeyTerms(tc); const at = this.extractKeyTerms(ac); const ov = tt.filter(t => at.includes(t)).length; const p = ov / Math.max(at.length, 1); const r = ov / Math.max(tt.length, 1); return Math.round(2 * (p * r) / Math.max(p + r, 0.01) * 100); }
  scoreReproduction(a, g) { if (!a || !a.steps) return 0; const as = a.steps.map(s => s.toLowerCase()); const ts = g.reproductionSteps.map(s => s.toLowerCase()); let m = 0; for (const t of ts) { if (as.find(s => this.stepsMatch(s, t))) m++; } const r = m / Math.max(ts.length, 1); const pen = as.length > ts.length ? 0.9 : 1; return Math.round(r * 100 * pen); }
  scoreRecovery(a, g) { if (!a || !a.fix) return 0; const af = a.fix.toLowerCase(); const tf = g.fix.toLowerCase(); const t = this.extractKeyTerms(tf); const at = this.extractKeyTerms(af); const ov = t.filter(x => at.includes(x)).length; const r = ov / Math.max(t.length, 1); const vb = a.verified ? 20 : 0; return Math.min(100, Math.round(r * 100) + vb); }
  extractKeyTerms(t) { const sw = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','this','that','these','those','it','its',"it's"]); return t.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !sw.has(w)); }
  stepsMatch(a, t) { const at = this.extractKeyTerms(a); const tt = this.extractKeyTerms(t); const ov = tt.filter(x => at.includes(x)).length; return ov / Math.max(tt.length, 1) > 0.5; }
  explainDiagnosis(s, g) { if (s >= 90) return 'Excellent: Correctly identified root cause - "' + g.rootCause + '"'; if (s >= 70) return 'Good: Identified key aspects of root cause'; if (s >= 50) return 'Partial: Identified some relevant factors'; return 'Poor: Failed to identify root cause'; }
  explainReproduction(s, g) { if (s >= 90) return 'Excellent: Reproduction steps match ground truth'; if (s >= 70) return 'Good: Reproduction steps mostly correct'; if (s >= 50) return 'Partial: Some reproduction steps correct'; return 'Poor: Reproduction steps missing or incorrect'; }
  explainRecovery(s, g) { if (s >= 90) return 'Excellent: Fix addresses root cause and verified'; if (s >= 70) return 'Good: Fix addresses root cause'; if (s >= 50) return 'Partial: Fix partially addresses issue'; return 'Poor: Fix does not address root cause'; }
  generateBreakdown(r, sc) { const b = {}; for (const [c, s] of Object.entries(sc)) { b[c] = { score: s, weight: this.weights[c] || 0, issues: r.issues.filter(i => this.issueBelongsToComponent(i, c)).length }; } return b; }
  issueBelongsToComponent(i, c) { const tm = { syntax: ['SYNTAX'], triggers: ['TRIGGER'], jobs: ['JOB','RUNS_ON','STEPS'], actionPinning: ['ACTION'], permissions: ['PERMISSION'], secrets: ['SECRET'], security: ['SECURITY','CURL_PIPE_BASH','SUDO_USAGE','MISSING_SET_E'], concurrency: ['CONCURRENCY'], requiredSteps: ['MISSING_'] }; return (tm[c] || []).some(p => i.type.includes(p)); }
  getLevel(s) { if (s >= this.thresholds.excellent) return 'excellent'; if (s >= this.thresholds.good) return 'good'; if (s >= this.thresholds.fair) return 'fair'; return 'poor'; }
  aggregateScores(sc) { if (!sc.length) return { overall: 0, level: 'poor', components: [] }; const cm = {}; for (const s of sc) { for (const c of s.components) { if (!cm[c.component]) cm[c.component] = { sum: 0, weight: c.weight, count: 0 }; cm[c.component].sum += c.score * c.weight; cm[c.component].weight = c.weight; cm[c.component].count++; } } const comps = Object.entries(cm).map(([n, d]) => ({ component: n, score: Math.round(d.sum / (d.weight * d.count)), weight: d.weight })); const tw = comps.reduce((sum, c) => sum + c.weight, 0); const ws = comps.reduce((sum, c) => sum + c.score * c.weight, 0); const o = tw > 0 ? Math.round(ws / tw) : 0; return { overall: o, level: this.getLevel(o), components: comps, sampleSize: sc.length }; }
  getLevel(s) { if (s >= this.thresholds.excellent) return 'excellent'; if (s >= this.thresholds.good) return 'good'; if (s >= this.thresholds.fair) return 'fair'; return 'poor'; }
}

module.exports = { ReliabilityScorer };
