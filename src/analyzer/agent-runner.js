/**
 * Agent Runner
 * 
 * Bounded prompt/tool interface for evaluating AI agents on failure scenarios.
 * Records all steps, outputs, and evidence for reproducibility.
 */

const Docker = require('dockerode');
const { EvidenceCollector } = require('./failure-scenario-framework');
const { FunctionalTestHarness } = require('./functional-test-harness');

class AgentRunner {
  constructor(config = {}) {
    this.docker = new Docker(config.docker || {});
    this.evidenceCollector = new EvidenceCollector(this.docker);
    this.testHarness = new FunctionalTestHarness(config.testHarness);
    this.maxSteps = config.maxSteps || 20;
    this.stepTimeout = config.stepTimeout || 60000;
    this.totalTimeout = config.totalTimeout || 300000; // 5 minutes
  }

  /**
   * Run agent against a failure scenario
   */
  async runAgent(scenario, agentConfig) {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    const runRecord = {
      runId,
      scenarioId: scenario.id,
      agentConfig: { ...agentConfig, apiKey: '[REDACTED]' },
      startTime,
      endTime: null,
      steps: [],
      evidence: [],
      diagnosis: null,
      reproduction: null,
      recovery: null,
      status: 'running',
      error: null
    };

    try {
      // 1. Set up the scenario environment
      const setupResult = await this.setupScenario(scenario, runRecord);
      if (!setupResult.success) {
        throw new Error(`Scenario setup failed: ${setupResult.error}`);
      }

      // 2. Inject the fault
      const faultResult = await this.injectFault(scenario, runRecord);
      if (!faultResult.success) {
        throw new Error(`Fault injection failed: ${faultResult.error}`);
      }

      // 3. Verify failure is observable
      const healthCheck = await this.verifyFailure(scenario, runRecord);
      if (healthCheck.healthy) {
        throw new Error('Fault injection did not produce observable failure');
      }

      // 4. Run the agent
      const agentResult = await this.executeAgent(agentConfig, scenario, runRecord);

      // 4a. Diagnosis phase
      runRecord.diagnosis = agentResult.diagnosis;
      runRecord.steps.push(...agentResult.diagnosisSteps);

      // 4b. Reproduction phase
      runRecord.reproduction = agentResult.reproduction;
      runRecord.steps.push(...agentResult.reproductionSteps);

      // 4c. Recovery/Fix phase
      runRecord.recovery = agentResult.recovery;
      runRecord.steps.push(...agentResult.recoverySteps);

      // 5. Collect final evidence
      runRecord.evidence = await this.collectAllEvidence(runRecord);

      runRecord.endTime = Date.now();
      runRecord.duration = runRecord.endTime - startTime;
      runRecord.status = 'completed';

      return runRecord;

    } catch (error) {
      runRecord.endTime = Date.now();
      runRecord.duration = runRecord.endTime - startTime;
      runRecord.status = 'failed';
      runRecord.error = error.message;
      return runRecord;
    }
  }

  async setupScenario(scenario, runRecord) {
    const step = this.createStep('setup', 'Setting up scenario environment');
    runRecord.steps.push(step);
    
    try {
      // Create temporary workspace
      const workspace = await this.createWorkspace(scenario);
      
      // Run scenario setup
      if (scenario.setup) {
        await scenario.setup(this.docker, workspace);
      }
      
      step.success = true;
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      return { success: true, workspace };
    } catch (error) {
      step.success = false;
      step.error = error.message;
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      return { success: false, error: error.message };
    }
  }

  async injectFault(scenario, runRecord) {
    const step = this.createStep('fault_injection', 'Injecting failure');
    runRecord.steps.push(step);
    
    try {
      if (scenario.fault) {
        const result = await scenario.fault(this.docker, '/tmp/test-workspace');
        step.success = true;
        step.endTime = Date.now();
        step.duration = step.endTime - step.startTime;
        step.output = result;
        return { success: true, result };
      }
      step.success = true;
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      return { success: true };
    } catch (error) {
      step.success = false;
      step.error = error.message;
      step.endTime = Date.now();
      return { success: false, error: error.message };
    }
  }

  async verifyFailure(scenario, runRecord) {
    const step = this.createStep('verify_failure', 'Verifying failure is observable');
    runRecord.steps.push(step);
    
    try {
      const health = await scenario.checkHealth(this.docker, '/tmp/test-workspace');
      step.success = true;
      step.endTime = Date.now();
      step.duration = step.endTime - step.startTime;
      step.output = health;
      
      if (health.healthy) {
        step.success = false;
        step.error = 'Fault injection did not produce observable failure';
      }
      
      return health;
    } catch (error) {
      step.success = false;
      step.error = error.message;
      step.endTime = Date.now();
      return { healthy: false, error: error.message };
    }
  }

  async executeAgent(agentConfig, scenario, runRecord) {
    const result = {
      diagnosis: null,
      reproduction: null,
      recovery: null,
      diagnosisSteps: [],
      reproductionSteps: [],
      recoverySteps: []
    };

    // Phase 1: Diagnosis
    const diagnosisPrompt = this.buildDiagnosisPrompt(scenario, runRecord);
    const diagnosis = await this.callAgent(agentConfig, diagnosisPrompt, 'diagnosis');
    result.diagnosis = this.parseAgentResponse(diagnosis, 'diagnosis');
    result.diagnosisSteps = this.formatSteps(diagnosis, 'diagnosis');

    // Phase 2: Reproduction
    const reproductionPrompt = this.buildReproductionPrompt(scenario, result.diagnosis, runRecord);
    const reproduction = await this.callAgent(agentConfig, reproductionPrompt, 'reproduction');
    result.reproduction = this.parseAgentResponse(reproduction, 'reproduction');
    result.reproductionSteps = this.formatSteps(reproduction, 'reproduction');

    // Phase 3: Recovery/Fix
    const recoveryPrompt = this.buildRecoveryPrompt(scenario, result.diagnosis, result.reproduction, runRecord);
    const recovery = await this.callAgent(agentConfig, recoveryPrompt, 'recovery');
    result.recovery = this.parseAgentResponse(recovery, 'recovery');
    result.recoverySteps = this.formatSteps(recovery, 'recovery');

    return result;
  }

  buildDiagnosisPrompt(scenario, runRecord) {
    const evidence = this.summarizeEvidence(runRecord);
    return `You are a DevOps engineer diagnosing a production failure.

SCENARIO: ${scenario.name}
CATEGORY: ${scenario.category}
DESCRIPTION: ${scenario.description}

OBSERVED EVIDENCE:
${evidence}

TASK: Analyze the evidence and provide your diagnosis.

REQUIRED OUTPUT FORMAT (JSON):
{
  "rootCause": "Your diagnosis of the root cause in one sentence",
  "confidence": 0.0-1.0,
  "reasoning": "Step-by-step reasoning",
  "evidenceUsed": ["evidence1", "evidence2"]
}`;
  }

  buildReproductionPrompt(scenario, diagnosis, runRecord) {
    const evidence = this.summarizeEvidence(runRecord);
    return `You are a DevOps engineer reproducing a failure.

SCENARIO: ${scenario.name}
YOUR DIAGNOSIS: ${diagnosis.rootCause}
CONFIDENCE: ${diagnosis.confidence}

OBSERVED EVIDENCE:
${evidence}

TASK: Provide step-by-step reproduction steps that would reliably reproduce this failure in a clean environment.

REQUIRED OUTPUT FORMAT (JSON):
{
  "steps": ["step 1", "step 2", "step 3"],
  "expectedOutcome": "What should happen when steps are followed",
  "prerequisites": ["prereq1", "prereq2"]
}`;
  }

  buildRecoveryPrompt(scenario, diagnosis, reproduction, runRecord) {
    const evidence = this.summarizeEvidence(runRecord);
    return `You are a DevOps engineer fixing a production failure.

SCENARIO: ${scenario.name}
YOUR DIAGNOSIS: ${diagnosis.rootCause}
REPRODUCTION STEPS: ${reproduction.steps.join(' -> ')}

OBSERVED EVIDENCE:
${evidence}

TASK: Provide a fix that addresses the root cause, and explain how to verify it works.

REQUIRED OUTPUT FORMAT (JSON):
{
  "fix": "Description of the fix",
  "implementation": "How to implement the fix",
  "verification": "How to verify the fix works",
  "verified": false
}`;
  }

  async callAgent(agentConfig, prompt, phase) {
    // This would call the actual agent (Claude, GPT, etc.)
    // For now, return a mock structure
    // In real implementation, this would call the agent API
    return {
      rootCause: 'Mock diagnosis',
      confidence: 0.5,
      reasoning: 'Mock reasoning',
      evidenceUsed: [],
      steps: ['Mock step 1', 'Mock step 2'],
      expectedOutcome: 'Mock outcome',
      prerequisites: [],
      fix: 'Mock fix',
      implementation: 'Mock implementation',
      verification: 'Mock verification',
      verified: false
    };
  }

  parseAgentResponse(response, phase) {
    // Parse JSON from agent response
    try {
      if (typeof response === 'string') {
        return JSON.parse(response);
      }
      return response;
    } catch (e) {
      // Return fallback
      return {
        rootCause: 'Failed to parse',
        confidence: 0,
        reasoning: 'Parse error',
        evidenceUsed: []
      };
    }
  }

  formatSteps(response, phase) {
    return [{
      phase,
      prompt: '...',
      response,
      timestamp: Date.now()
    }];
  }

  summarizeEvidence(runRecord) {
    // Summarize logs, health checks, etc.
    return 'Evidence summary from run record';
  }

  async collectAllEvidence(runRecord) {
    // Collect all evidence from the run
    return [];
  }

  createStep(phase, description) {
    return {
      phase,
      description,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      success: null,
      output: null,
      error: null
    };
  }

  async createWorkspace(scenario) {
    // Create isolated workspace for scenario
    return `/tmp/twotails-${scenario.id}-${Date.now()}`;
  }
}

module.exports = { AgentRunner };
