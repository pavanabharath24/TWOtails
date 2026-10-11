/**
 * Unified Evaluator
 * 
 * Main entry point combining:
 * - CI/CD Workflow Analysis (Paper 1)
 * - Functional Test Harness (Paper 1)
 * - Failure Reproduction Benchmark (Paper 2)
 * - Reliability Scoring (Both)
 * - Agent Evaluation (Both)
 */

const { MasterAnalyzer } = require('./master-analyzer');
const { CICDWorkflowAnalyzer } = require('./cicd-analyzer');
const { FunctionalTestHarness } = require('./functional-test-harness');
const { FailureScenarioRegistry, FaultInjector, EvidenceCollector } = require('./failure-scenario-framework');
const { ReliabilityScorer } = require('./reliability-scorer');
const { AgentRunner } = require('./agent-runner');

class UnifiedEvaluator {
  constructor(config = {}) {
    this.config = config;
    this.masterAnalyzer = new MasterAnalyzer();
    this.cicdAnalyzer = new CICDWorkflowAnalyzer();
    this.testHarness = new FunctionalTestHarness(config.testHarness);
    this.scenarioRegistry = new FailureScenarioRegistry();
    this.faultInjector = new FaultInjector();
    this.evidenceCollector = new EvidenceCollector();
    this.scorer = new ReliabilityScorer(config.scorer);
    this.agentRunner = new AgentRunner(config.agentRunner);
  }

  /**
   * Full evaluation pipeline
   * 1. Static code analysis (MasterAnalyzer)
   * 2. CI/CD workflow analysis
   * 3. Functional tests
   * 4. Failure scenario evaluation (optional)
   * 5. Agent evaluation (optional)
   * 6. Unified reliability score
   */
  async evaluate(options = {}) {
    const runId = `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const evaluation = {
      runId,
      startTime,
      endTime: null,
      duration: null,
      projectDir: options.projectDir,
      config: options,
      staticAnalysis: null,
      cicdAnalysis: null,
      functionalTests: null,
      scenarioEvaluation: null,
      agentEvaluation: null,
      unifiedScore: null,
      status: 'running',
      error: null
    };

    try {
      // 1. Static code analysis
      if (options.staticAnalysis !== false) {
        evaluation.staticAnalysis = await this.masterAnalyzer.analyzeDirectory(
          options.projectDir, 
          options.analyzerOptions
        );
      }

      // 2. CI/CD workflow analysis
      if (options.cicdAnalysis !== false) {
        evaluation.cicdAnalysis = await this.cicdAnalyzer.analyzeDirectory(
          options.projectDir,
          options.cicdOptions
        );
      }

      // 3. Functional tests
      if (options.functionalTests !== false && options.testConfig) {
        evaluation.functionalTests = await this.testHarness.runTestSuite(
          options.projectDir,
          options.testConfig
        );
      }

      // 4. Failure scenario evaluation
      if (options.scenarios && options.scenarios.length > 0) {
        evaluation.scenarioEvaluation = await this.evaluateScenarios(
          options.scenarios,
          options.scenarioOptions
        );
      }

      // 5. Agent evaluation on failure scenarios
      if (options.agentConfig && options.scenarios && options.scenarios.length > 0) {
        evaluation.agentEvaluation = await this.evaluateAgent(
          options.agentConfig,
          options.scenarios,
          options.agentOptions
        );
      }

      // 6. Calculate unified reliability score
      evaluation.unifiedScore = this.calculateUnifiedScore(evaluation);

      evaluation.endTime = Date.now();
      evaluation.duration = evaluation.endTime - startTime;
      evaluation.status = 'completed';

      return evaluation;

    } catch (error) {
      evaluation.endTime = Date.now();
      evaluation.duration = evaluation.endTime - startTime;
      evaluation.status = 'failed';
      evaluation.error = error.message;
      return evaluation;
    }
  }

  /**
   * Evaluate specific failure scenarios
   */
  async evaluateScenarios(scenarioIds, options = {}) {
    const results = [];
    
    for (const scenarioId of scenarioIds) {
      const scenario = this.scenarioRegistry.get(scenarioId);
      if (!scenario) {
        results.push({ scenarioId, error: 'Scenario not found' });
        continue;
      }

      const result = await this.runScenario(scenario, options);
      results.push(result);
    }

    // Aggregate scenario scores
    const scenarioScores = results
      .filter(r => r.score !== undefined)
      .map(r => r.score);

    return {
      scenarios: results,
      aggregateScore: this.scorer.aggregateScores(scenarioScores)
    };
  }

  async runScenario(scenario, options) {
    const runId = `scenario-${scenario.id}-${Date.now()}`;
    const startTime = Date.now();

    try {
      // Setup
      const setupResult = await scenario.setupScenario(this.docker, options.workDir);
      
      // Inject fault
      await scenario.injectFault(this.docker, options.workDir);
      
      // Verify failure
      const health = await scenario.checkHealth(this.docker, options.workDir);
      if (health.healthy) {
        throw new Error('Fault injection did not produce observable failure');
      }

      // Run health check to confirm
      const healthCheck = await scenario.checkHealth(this.docker, options.workDir);

      const duration = Date.now() - startTime;

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        category: scenario.category,
        success: true,
        duration,
        healthCheck,
        groundTruth: scenario.groundTruth,
        score: {
          diagnosis: null,
          reproduction: null,
          recovery: null
        }
      };
    } catch (error) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        success: false,
        duration: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async evaluateAgent(agentConfig, scenarioIds, options = {}) {
    const results = [];

    for (const scenarioId of scenarioIds) {
      const scenario = this.scenarioRegistry.get(scenarioId);
      if (!scenario) continue;

      // Run agent multiple times for repeatability
      const runs = options.repeat || 1;
      const scenarioResults = [];

      for (let i = 0; i < runs; i++) {
        const runResult = await this.agentRunner.runAgent(scenario, agentConfig);
        const scored = this.scorer.scoreFailureReproduction(runResult, scenario.groundTruth);
        
        scenarioResults.push({
          runIndex: i,
          runRecord: runRecord,
          score: scored
        });
      }

      // Calculate variance across runs
      const scores = scenarioResults.map(r => r.score.overall);
      const variance = this.calculateVariance(scores);

      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        runs: scenarioResults,
        aggregateScore: this.scorer.aggregateScores(scenarioResults.map(r => r.score)),
        variance,
        repeatable: variance < 100 // Low variance = repeatable
      });
    }

    return {
      agentConfig: { ...agentConfig, apiKey: '[REDACTED]' },
      scenarios: results,
      overallAggregate: this.scorer.aggregateScores(
        results.flatMap(r => r.runs.map(run => run.score))
      )
    };
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance); // Standard deviation
  }

  calculateUnifiedScore(evaluation) {
    const allScores = [];

    // Add CI/CD scores
    if (evaluation.cicdAnalysis && evaluation.cicdAnalysis.workflowResults) {
      for (const wf of evaluation.cicdAnalysis.workflowResults) {
        if (wf.score !== undefined) {
          allScores.push({
            component: `cicd:${wf.workflowName}`,
            score: wf.score,
            weight: 1
          });
        }
      }
    }

    // Add functional test scores
    if (evaluation.functionalTests) {
      const ft = evaluation.functionalTests;
      let testScore = 0;
      let testCount = 0;
      if (ft.build) { testScore += ft.build.success ? 100 : 0; testCount++; }
      if (ft.tests) { testScore += ft.tests.success ? 100 : 0; testCount++; }
      if (ft.lint) { testScore += ft.lint.success ? 100 : 0; testCount++; }
      if (testCount > 0) {
        allScores.push({
          component: 'functional-tests',
          score: Math.round(testScore / testCount),
          weight: 2
        });
      }
    }

    // Add scenario scores
    if (evaluation.scenarioEvaluation && evaluation.scenarioEvaluation.scenarios) {
      for (const s of evaluation.scenarioEvaluation.scenarios) {
        if (s.score) {
          allScores.push({
            component: `scenario:${s.scenarioId}`,
            score: s.score,
            weight: 1.5
          });
        }
      }
    }

    // Add agent evaluation scores
    if (evaluation.agentEvaluation && evaluation.agentEvaluation.scenarios) {
      for (const s of evaluation.agentEvaluation.scenarios) {
        if (r.score) {
          allScores.push({
            component: `agent:${r.scenarioId}`,
            score: r.score.overall,
            weight: 2
          });
        }
      }
    }

    // Add static analysis penalty/bonus
    if (evaluation.staticAnalysis) {
      const sa = evaluation.staticAnalysis;
      const totalIssues = sa.stats.totalIssues || 0;
      const errorRatio = (sa.stats.errors || 0) / Math.max(totalIssues, 1);
      const staticScore = Math.max(0, 100 - errorRatio * 100);
      allScores.push({
        component: 'static-analysis',
        score: Math.round(staticScore),
        weight: 1
      });
    }

    // Calculate overall
    if (allScores.length === 0) {
      return { overall: 0, level: 'poor', components: [] };
    }

    const totalWeight = allScores.reduce((sum, s) => sum + s.weight, 0);
    const weightedSum = allScores.reduce((sum, s) => sum + s.score * s.weight, 0);
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    const thresholds = {
      excellent: 90,
      good: 75,
      fair: 60,
      poor: 0
    };

    let level = 'poor';
    if (overall >= 90) level = 'excellent';
    else if (overall >= 75) level = 'good';
    else if (overall >= 60) level = 'fair';

    return {
      overall,
      level,
      components: allScores,
      thresholds,
      passed: overall >= 75
    };
  }

  /**
   * Generate human-readable report
   */
  generateReport(evaluation) {
    const lines = [];
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              TWOtails Unified Evaluation Report              ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push(`║ Run ID: ${evaluation.runId.padEnd(55)} ║`);
    lines.push(`║ Status: ${evaluation.status.padEnd(55)} ║`);
    lines.push(`║ Duration: ${evaluation.duration}ms`.padEnd(57) + ' ║');
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    
    if (evaluation.unifiedScore) {
      const us = evaluation.unifiedScore;
      lines.push(`║ Overall Score: ${String(us.overall).padStart(3)} | Level: ${us.level.padEnd(9)} | Passed: ${us.passed ? 'YES' : 'NO'}`.padEnd(57) + ' ║');
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ Component Scores:                                            ║');
      for (const comp of us.components) {
        const bar = '█'.repeat(Math.floor(comp.score / 5)) + '░'.repeat(20 - Math.floor(comp.score / 5));
        lines.push(`║   ${comp.component.padEnd(30)} ${bar} ${String(comp.score).padStart(3)} ║`);
      }
    }

    // Static analysis summary
    if (evaluation.staticAnalysis) {
      const sa = evaluation.staticAnalysis;
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ Static Analysis:                                             ║');
      lines.push(`║   Files Scanned: ${String(sa.stats.filesScanned).padStart(3)} | Total Issues: ${String(sa.stats.totalIssues).padStart(3)} | Errors: ${String(sa.stats.errors).padStart(3)} | Warnings: ${String(sa.stats.warnings).padStart(3)}`.padEnd(57) + ' ║');
    }

    // CI/CD summary
    if (evaluation.cicdAnalysis) {
      const cicd = evaluation.cicdAnalysis;
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ CI/CD Workflow Analysis:                                     ║');
      lines.push(`║   Workflows Found: ${String(cicd.stats.workflowsFound).padStart(3)} | Syntax Errors: ${String(cicd.stats.syntaxErrors).padStart(3)} | Policy Violations: ${String(cicd.stats.policyViolations).padStart(3)} | Security Issues: ${String(cicd.stats.securityIssues).padStart(3)}`.padEnd(57) + ' ║');
      lines.push(`║   Reliability Score: ${String(cicd.stats.reliabilityScore).padStart(3)}`.padEnd(57) + ' ║');
    }

    // Functional tests
    if (evaluation.functionalTests) {
      const ft = evaluation.functionalTests;
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ Functional Tests:                                            ║');
      lines.push(`║   Build: ${ft.build ? (ft.build.success ? 'PASS' : 'FAIL') : 'SKIP'} | Tests: ${ft.tests ? (ft.tests.success ? 'PASS' : 'FAIL') : 'SKIP'} | Lint: ${ft.lint ? (ft.lint.success ? 'PASS' : 'FAIL') : 'SKIP'}`.padEnd(57) + ' ║');
    }

    // Scenario evaluation
    if (evaluation.scenarioEvaluation) {
      const se = evaluation.scenarioEvaluation;
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ Failure Scenarios:                                           ║');
      for (const s of se.scenarios) {
        const status = s.success ? 'PASS' : 'FAIL';
        lines.push(`║   ${s.scenarioName.padEnd(30)} ${status}`.padEnd(57) + ' ║');
      }
      if (se.aggregateScore) {
        lines.push(`║   Aggregate: ${String(se.aggregateScore.overall).padStart(3)} | ${se.aggregateScore.level}`.padEnd(57) + ' ║');
      }
    }

    // Agent evaluation
    if (evaluation.agentEvaluation) {
      const ae = evaluation.agentEvaluation;
      lines.push('╠══════════════════════════════════════════════════════════════╣');
      lines.push('║ Agent Evaluation:                                            ║');
      for (const s of ae.scenarios) {
        const agg = s.aggregateScore;
        lines.push(`║   ${s.scenarioName.padEnd(30)} Score: ${String(agg.overall).padStart(3)} | ${agg.level} | Variance: ${String(s.variance).padStart(6)}`.padEnd(57) + ' ║');
      }
      if (ae.overallAggregate) {
        lines.push(`║   Overall: ${String(ae.overallAggregate.overall).padStart(3)} | ${ae.overallAggregate.level}`.padEnd(57) + ' ║');
      }
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');
    
    return lines.join('\n');
  }
}

// Export a convenience function for CLI usage
async function evaluateProject(projectDir, options = {}) {
  const evaluator = new UnifiedEvaluator(options);
  return await evaluator.evaluate({ projectDir, ...options });
}

module.exports = { UnifiedEvaluator, evaluateProject };
