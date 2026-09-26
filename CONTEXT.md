# Project Context

## Project Info
- Name: @pavana/twotails
- Version: 3.1.0
- Description: AI code quality analyzer - 14 scanners, 1 truth, zero false positives. Supports JavaScript, TypeScript, Python, Go, Java, Ruby, Rust, PHP, C#, Swift, Kotlin, Scala.

## Directory Structure
```
.ai-context/
.cursor/
  rules/
.github/
  copilot-instructions.md
.opencode/
  plugins/
  .gitignore
  package-lock.json
  package.json
examples/
  broken-app/
  fixed-app/
  go-app/
  java-app/
  python-app/
  ruby-app/
hooks/
  claude-codex-hooks.json
  twotails-activate.js
  twotails-config.js
  twotails-instructions.js
scripts/
  export-context.js
  import-context.js
skills/
  twotails/
  twotails-api/
  twotails-database/
  twotails-security/
  twotails-virtual-memory/
  context-transfer.skill
src/
  analyzer/
  reporter/
  tracer/
  virtual-memory/
  index.js
tests/
  analyzer.test.js
  integration.test.js
  tracer.test.js
  virtual-memory.test.js
.env.example
.gitignore
AGENTS.md
package-lock.json
package.json
README.md
```

## README Summary
<p align="center">
  <img src="assets/logo.png" width="220" alt="TWOtails - Two signals, one truth">
</p>

<h1 align="center">TWOtails</h1>

<p align="center">
  <em>AI Code Quality Analyzer - 14 scanners, 12 languages, 1 truth, zero false positives</em>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/pavana/TWOtails?style=flat-square&color=0ea5e9&label=stars" alt="Stars">
  <img src="https://img.shields.io/github/v/release/pavana/TWOtails?style=flat-square&color=0ea5e9&label=release" alt="Release">
  <img src="https://img.shields.io/npm/v/@pavana/twotails?style=flat-square&color=0ea5e9&label=npm" alt="npm">
  <img src="https://img.shields.io/badge/tests-44%2F44%20passing-0ea5e9?style=flat-square" alt="Tests">
</p>

---

## What is TWOtails?

When AI generates code, things break. Buttons without handlers. Functions called but never defined. SQL injection vulnerabilities. Hardcoded secrets. Missing database models. API routes without validation.

**TWOtails finds ALL of it.** Fourteen specialized scanners analyze every line of your code across 12 programming languages and report exactly what's broken, what's missing, and what's dangerous.

## 12 Languages Supported

| Language | Extensions | Features |
|----------|------------|----------|
| **JavaScript** | `.js` | Full AST parsing, React support |
| **TypeScript** | `.ts`, `.tsx` | Type checking, interface analysis |
| **Python** | `.py` | AST analysis, import detection, docstrings |
| **Go** | `.go` | Goroutine analysis, error handling |
| **Java** | `.java` | Generic types, exception handling |
| **Ruby** | `.rb` | Rescue blocks, eval detection |
| **Rust** | `.rs` | Unsafe blocks, unwrap detection |
| **PHP** | `.php` | SQL injection, echo detection |
| **C#** | `.cs` | Null reference, debug statements |
| **Swift** | `.swift` | Force unwrap, optional binding |
| **Kotlin** | `.kt` | Non-null

## Key Files
- package.json
- README.md
- AGENTS.md
- src/index.js

## Last Updated
2026-09-19T06:51:10.576Z
