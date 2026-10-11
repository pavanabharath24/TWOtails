# Skill/Plugin System Research

## Existing Systems to Study

### 1. OpenCode Plugins
- Location: `~/.config/opencode/plugin/` or project `.opencode/plugin/`
- Format: ES modules exporting hooks, commands, tools
- Example: @dietrichgebert/ponytail plugin structure

### 2. Cursor Rules
- `.cursor/rules/*.mdc` - Markdown with frontmatter (globs, alwaysApply)
- Plain markdown instructions loaded per-project or global

### 3. GitHub Copilot
- `.github/copilot-instructions.md` - plain markdown
- VS Code extension reads workspace instructions

### 4. Claude Code Plugins
- `/plugin marketplace add` + `/plugin install`
- Hooks: sessionStart, userPromptSubmit, preToolUse, postToolUse
- Skills: slash commands with `@` invocation

### 5. Antigravity / Gemini Extensions
- `gemini extensions install <url>`
- Reads AGENTS.md from repo root
- Registers slash commands as skills

### 6. Codex (OpenAI)
- Reads AGENTS.md from workspace
- No plugin system yet, instruction-only

### 7. Amp (Sourcegraph)
- Reads AGENTS.md from working directory and parents up to $HOME

### 8. Jules (Google)
- Reads AGENTS.md from repository root

### 9. Cline / Windsurf
- `.clinerules/` or `.windsurf/rules/` - markdown rules

### 10. Qoder
- `.qoder/rules/` markdown rules
- Plugin manifest at `.qoder-plugin/plugin.json` pointing to skills dir

### 11. Swival
- `swival skills add --global <url>` stages into `~/.config/swival/library`
- Skills activated per-project or global

## Common Patterns
- All read some form of AGENTS.md / rules / instructions markdown
- Most support slash commands or @-invoked skills
- Hooks/lifecycle events vary: sessionStart, userPromptSubmit, preToolUse, postToolUse
- Configuration: JSON (opencode), markdown frontmatter (cursor), plain files (copilot)

## Universal Skill Manifest Design
```json
{
  "name": "twotails",
  "version": "3.1.0",
  "description": "AI code quality analyzer - 14 scanners, bidirectional signal tracing",
  "entryPoints": {
    "cli": "src/index.js",
    "hooks": "hooks/twotails-hooks.json",
    "skills": "skills/",
    "rules": ".cursor/rules/twotails.mdc",
    "copilot": ".github/copilot-instructions.md",
    "agentsMd": "AGENTS.md"
  },
  "capabilities": [
    "code-analysis",
    "signal-tracing",
    "virtual-memory-testing",
    "context-transfer"
  ],
  "commands": ["scan", "security", "database", "api", "env", "connectivity", "languages", "paywall", "test", "trace", "report"],
  "configSchema": { ... },
  "exports": {
    "analyzers": ["connectivity", "database", "api", "security", "env", "prompts", "tokens", "errors", "deps", "docker", "websocket", "tests", "multi-language", "paywall"],
    "utils": ["ast-walk", "signal-matching", "virtual-memory"]
  }
}
```
