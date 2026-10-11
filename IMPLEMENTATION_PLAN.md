# TWOtails Master Implementation Plan
## Universal Skill Portability + Zero-Known-Failure-Modes

---

## Phase 0: Foundation Hardening (Week 1-2)
**Goal: Make the existing codebase mathematically reliable before extending**

### 0.1 TypeScript Migration with Strict Contracts
- [ ] Add `tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [ ] Add JSDoc `@param` `@returns` `@throws` to every exported function
- [ ] Run `tsc --noEmit` → 0 errors
- [ ] Add `tsd` for type-level testing

### 0.2 Property-Based Testing Infrastructure
```bash
npm i -D fast-check @fast-check/vitest
```
- [ ] Create `tests/property/` directory
- [ ] Write property tests for:
  - `ast-walk.js` walkers: `simple(node) ≡ full(node)` for all valid ASTs
  - `signal-matcher.js`: `traceSignal(sender) → receiver` is bijective when connected
  - `env-analyzer.js`: missing env detection invariant
  - `master-analyzer.js`: `scan(dir).issues` all have required fields
- [ ] Target: 10,000+ generated cases per property

### 0.3 Mutation Testing Setup
```bash
npm i -D @stryker-mutator/core @stryker-mutator/javascript-mutator @stryker-mutator/vitest-runner
```
- [ ] Configure `stryker.conf.json` targeting `src/analyzer/`, `src/tracer/`, `src/utils/`
- [ ] Run → achieve 100% mutant kill rate on core analyzers
- [ ] Fix surviving mutants (they reveal missing tests)

### 0.4 Contract Assertions (Design by Contract)
- [ ] Add `contracts.js` utility: `precondition`, `postcondition`, `invariant`
- [ ] Decorate every exported function in `src/analyzer/*.js`, `src/tracer/*.js`, `src/utils/*.js`
- [ ] Dev mode: assertions throw with context; Prod mode: optional strip via build flag

### 0.5 Supply Chain Lockdown
- [ ] `npm audit signatures` verification
- [ ] Add `socket.dev` CLI to CI
- [ ] Pin all deps to exact versions (no `^` `~`)
- [ ] Generate SBOM: `npm sbom`

### 0.5 Chaos Testing Harness
- [ ] Create `tests/chaos/` with mocked `fs`, `net`, `child_process`
- [ ] Scenarios: ENOENT, EACCES, ENOSPC, EMFILE, ECONNREFUSED, ETIMEDOUT, SIGKILL mid-operation
- [ ] Verify: no crashes, clean errors, no partial writes, cleanup runs

---

## Phase 1: Universal Skill Portability (Week 3-6)
**Goal: One skill manifest → installs everywhere**

### 1.1 Universal Skill Manifest v1.0
Create `skill-manifest.json` at repo root (schema in `research/skill-systems.md`):
- [ ] Define JSON Schema (`schemas/skill-manifest.schema.json`) with AJV validation
- [ ] Include: name, version, description, entryPoints, capabilities, commands, configSchema, exports
- [ ] Auto-generate from `package.json` + filesystem scan (script: `scripts/generate-manifest.js`)

### 1.2 Exporters for Each Target Platform

| Platform | Output | Location |
|----------|--------|----------|
| **OpenCode** | ES module plugin + hooks | `.opencode/plugins/twotails.mjs` |
| **Cursor** | `.mdc` rule file | `.cursor/rules/twotails.mdc` (enhanced) |
| **Claude Code** | Hooks JSON + skills dir | `hooks/claude-code-hooks.json` + `skills/` |
| **GitHub Copilot** | Instructions markdown | `.github/copilot-instructions.md` |
| **Antigravity/Gemini** | Extension manifest + AGENTS.md | `gemini-extension.json` + `AGENTS.md` |
| **Codex / Amp / Jules** | AGENTS.md (primary) | `AGENTS.md` (enhanced) |
| **Cline / Windsurf** | Rules markdown | `.clinerules/twotails.md` / `.windsurf/rules/twotails.md` |
| **Qoder** | Plugin manifest + rules | `.qoder-plugin/plugin.json` + `.qoder/rules/twotails.md` |
| **Swival** | Skills collection | `swival-skills/` |
| **VS Code Extension** | Native extension | `vscode-extension/` (optional) |

### 1.3 Skill Manifest Generator
```javascript
// scripts/generate-manifest.js
// Reads: package.json, filesystem, skill-manifest.json template
// Outputs: skill-manifest.json (validated against schema)
// Also generates all platform-specific files via templates
```
- [ ] Template engine (simple string replacement or eta)
- [ ] One command: `npm run build:skills` → generates all platform files
- [ ] Verify: each generated file passes platform-specific lint

### 1.4 Skill Registry & Discovery
- [ ] `skills-registry.json` at `skills-registry.twotails.dev` (or GitHub Pages)
- [ ] Schema: `{name, version, description, repo, manifestUrl, platforms[], capabilities[]}`
- [ ] CLI: `twotails skill list`, `twotails skill install <name>`, `twotails skill publish`

### 1.5 Cross-Platform Skill SDK
Create `skill-sdk/` (published as `@twotails/skill-sdk`):
- [ ] Base classes: `Skill`, `Hook`, `Command`, `Analyzer`
- [ ] Platform adapters: `OpencodeAdapter`, `CursorAdapter`, `ClaudeCodeAdapter`, etc.
- [ ] Shared utilities: config schema validation, logging, error formatting
- [ ] Example: build a dummy skill using SDK in 5 minutes

### 1.6 Skill Composition & Marketplace
- [ ] Skills can depend on other skills (DAG)
- [ ] Conflict resolution: same capability from multiple skills → user chooses
- [ ] Version resolution: semver, lockfile
- [ ] Local development: `twotails skill link ../my-skill`

---

## Phase 2: Zero-Failure Reliability Engineering (Week 5-10, overlaps Phase 1)
**Goal: Eliminate every known failure mode**

### 2.1 Property-Based Testing Suite (10k+ cases each)
| Module | Properties |
|--------|------------|
| `ast-walk.js` | Walker visits every node exactly once; `simple ≡ recursive ≡ full` for valid ASTs; no stack overflow on deep trees |
| `signal-matcher.js` | Bidirectional trace is symmetric; no false connections; no missed connections on valid code |
| `env-analyzer.js` | Every `process.env.X` usage matched to `.env` or `.env.example` or reported; no false positives |
| `master-analyzer.js` | Output schema invariant; dedup is idempotent; stats consistent with issues |
| `virtual-memory/runner.js` | Browser context always cleaned up; no orphaned pages; timeout always fires |

### 2.2 Mutation Testing → 100% Kill Rate
- Target files: all `src/analyzer/*.js`, `src/tracer/*.js`, `src/utils/*.js`, `src/virtual-memory/*.js`
- Mutators: arithmetic, boolean, comparison, string, array, object, conditional, remove statement
- Surviving mutants = missing tests → add tests until 100%

### 2.3 TLA+ Model Checking (Core Algorithms)
- [ ] Model `signal-matcher.js` bidirectional trace as PlusCal spec
- [ ] Model `ast-walk.js` walker state machine
- [ ] Model `virtual-memory/runner.js` browser lifecycle (init → test → cleanup)
- [ ] Run TLC model checker → 0 invariant violations

### 2.4 Fuzzing (1M+ iterations each)
- [ ] Config parser: random JSON/YAML/JS → never crashes, always valid schema or clear error
- [ ] File readers: random bytes → never crashes, valid UTF-8 or clear encoding error
- [ ] AST input: `acorn.parse(randomString)` → walker handles all node types or graceful skip
- [ ] CLI args: random argv → never crashes, clear usage error or valid command

### 2.4 Chaos Testing Suite
```javascript
// tests/chaos/fs-chaos.test.js
// Mock fs with: ENOENT, EACCES, ENOSPC, EMFILE, EISDIR, ENOTDIR, ELOOP
// Verify: clean error message, no partial writes, temp files cleaned up
```
- [ ] FS chaos: ENOENT, EACCES, ENOSPC, EMFILE, EISDIR, ENOTDIR, ELOOP, ENAMETOOLONG
- [ ] Network chaos: ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH, ECONNRESET, 5xx responses
- [ ] Process chaos: SIGKILL, SIGTERM, OOM kill, zombie children
- [ ] Playwright chaos: browser crash, context close, page crash, timeout, OOM
- [ ] Verify: no unhandled rejections, no leaked resources, clear user-facing errors

### 2.5 Self-Test / Health Check
- [ ] Add `--self-test` flag to every CLI command
- [ ] Runs: config validation, analyzer instantiation, virtual memory probe, signal matcher sanity
- [ ] Runs in < 2 seconds, exits 0 on healthy, 1 with diagnostics on failure

### 2.6 Observability & Structured Logging
- [ ] Replace `console.log` with `pino` structured logger (JSON, levels, redaction)
- [ ] Add `--log-level` and `--log-format=json|pretty`
- [ ] Correlation IDs for request tracing

---

## Phase 3: Integration & Release Engineering (Week 10-12)

### 3.1 CI/CD Pipeline (GitHub Actions)
```yaml
# .github/workflows/zero-failure.yml
jobs:
  typecheck:
    runs: tsc --strict --noEmit
  lint:
    runs: eslint --max-warnings=0
  unit:
    runs: vitest --coverage
  property:
    runs: vitest --project=property
  mutation:
    runs: stryker run
  fuzz:
    runs: node tests/fuzz/*.js --iterations=1000000
  chaos:
    runs: vitest --project=chaos
  tla:
    runs: tlc -model checking
  supply-chain:
    runs: npm audit && socket scan
  self-test:
    runs: node src/index.js --self-test
```

### 3.2 Release Checklist Automation
- [ ] `scripts/release-checklist.js` - runs all zero-failure gates
- [ ] Only allows version bump if ALL gates pass
- [ ] Generates `RELEASE_REPORT.md` with evidence

### 3.3 Documentation & Examples
- [ ] `SKILLS.md` - how to build a skill using SDK
- [ ] `PLATFORMS.md` - per-platform installation guide
- [ ] `RELIABILITY.md` - our guarantees, how we verify them
- [ ] `CONTRIBUTING.md` - zero-failure contribution requirements

---

## Phase 4: Community & Ecosystem (Week 12+)

### 4.1 Skill Registry Launch
- [ ] Deploy `skills.twotails.dev` (GitHub Pages + JSON registry)
- [ ] Submit TWOtails core skills + 3 community skills

### 4.2 Education Track
- [ ] "Building Reliable AI Skills" tutorial series
- [ ] "Zero-Failure JavaScript" workshop materials
- [ ] Student-friendly: "Your First AI Code Analyzer Skill"

### 4.3 Enterprise Hardening
- [ ] SBOM generation, license scanning, CVE monitoring
- [ ] Offline/air-gapped installation support
- [ ] Policy-as-code: org-wide skill allow/block lists

---

## Success Metrics (Definition of Done)

| Metric | Target |
|--------|--------|
| TypeScript strict errors | 0 |
| ESLint warnings | 0 |
| Mutation kill rate (core) | 100% |
| Property test cases | ≥ 50,000 total |
| Fuzzing iterations | ≥ 5,000,000 total |
| Chaos scenarios | 100% pass |
| TLA+ model check | 0 violations |
| Supply chain vulnerabilities | 0 (excl. false positives) |
| Self-test time | < 2 seconds |
| Platform exporters | 10/10 working |
| Skill manifest validation | 100% schema compliance |
| Cross-platform install test | 10/10 platforms |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Scope creep | Strict phase gates; no Phase N+1 until Phase N 100% |
| Tooling gaps (e.g., no JS TLA+ runtime) | Use PlusCal → TLA+ → TLC; keep models in repo |
| Mutation testing slow | Parallelize; run only on changed files in CI |
| Platform API changes | Versioned adapters; integration tests per platform |
| Performance regression | Benchmark in CI; fail if >10% slower |

---

## Start Now: Immediate Actions (Today)

1. [ ] `npm i -D fast-check @fast-check/vitest @stryker-mutator/core @stryker-mutator/javascript-mutator @stryker-mutator/vitest-runner zod pino`
2. [ ] Add `tsconfig.json` with strict mode
3. [ ] Write first property test: `ast-walk.js` walker invariant
4. [ ] Configure `stryker.conf.json`
5. [ ] Create `skill-manifest.json` template + generator script skeleton

---

*This plan is ambitious but every item is achievable with existing tools. The difference from typical projects: we don't ship until the checklist is 100% green. Perfection is the process, not the destination.*
