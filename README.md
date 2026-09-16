<p align="center">
  <img src="assets/logo.png" width="220" alt="TWOtails - Two signals, one truth">
</p>

<h1 align="center">TWOtails</h1>

<p align="center">
  <em>Two signals. One truth. Every connection verified.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/pavana/TWOtails?style=flat-square&color=0ea5e9&label=stars" alt="Stars">
  <img src="https://img.shields.io/github/v/release/pavana/TWOtails?style=flat-square&color=0ea5e9&label=release" alt="Release">
  <img src="https://img.shields.io/npm/v/@pavana/twotails?style=flat-square&color=0ea5e9&label=npm" alt="npm">
  <img src="https://img.shields.io/badge/works%20with-5%20agents-0ea5e9?style=flat-square" alt="Works with 5 agents">
  <img src="https://img.shields.io/badge/license-MIT-0ea5e9?style=flat-square" alt="MIT license">
</p>

---

## What is TWOtails?

When AI generates code, things get messy. Buttons don't connect to handlers. Functions get called but never defined. Signals go out but nothing receives them. Code gets misplaced, lines get skipped, connections break silently.

**TWOtails finds all of it.** It traces every signal from both ends - sender and receiver - and shows you exactly what's connected, what's broken, and what's missing. All in one table.

### The Two-Signal Method

```
Sender ───signal───▶ ??? ◀───signal─── Receiver
                      │
              Are they the same?
                      │
              YES → Connected ✓
              NO  → Broken ✗ → Fix → Retest
```

## Before / After

Your AI generates a React app. Buttons everywhere. Half of them do nothing.

**Without TWOtails:**
```bash
# User clicks button, nothing happens
# User debugging for 30 minutes
# User gives up, rewrites from scratch
```

**With TWOtails:**
```bash
$ twotails scan ./src

┌─────────────────────────────────────────────────────────────┐
│                    CONNECTION REPORT                        │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│ Type     │ Sender   │ Receiver │ Status   │ Action         │
├──────────┼──────────┼──────────┼──────────┼────────────────┤
│ Button   │ Submit   │ handleSubmit │ ✗ BROKEN │ Auto-fix available │
│ API Call │ fetch()  │ /api/users │ ✓ OK     │ —              │
│ Event    │ onClick  │ addTodo   │ ✗ MISSING │ Function not defined │
│ Route    │ /dashboard │ Dashboard │ ✓ OK     │ —              │
│ Import   │ utils.js │ formatDate │ ✗ UNUSED │ Remove import  │
└──────────┴──────────┴──────────┴──────────┴────────────────┘

Found 3 issues. Fix all? [Y/n]
```

## How It Works

### 1. AST Code Graph Analysis
Parses your entire codebase into a dependency graph. Every function call, import, event handler, and API endpoint becomes a node.

### 2. Bidirectional Signal Tracing
For every connection, TWOtails sends a signal from the sender side AND the receiver side. If they don't collide, the connection is broken.

### 3. Virtual Memory Testing
Creates an isolated sandbox in memory. Tests UI elements (buttons, forms, navigation) without deploying. If it works in virtual memory, it works in production.

### 4. Auto-Fix + Retest Loop
```
Scan → Find Issues → Fix Code → Create Virtual Memory → Test → 
  ├── PASS → Show "Working" → Delete Virtual Memory
  └── FAIL → Apply Changes → Retest → Repeat until PASS
```

## Commands

| Command | What it does |
|---------|--------------|
| `twotails scan [dir]` | Scan codebase for broken connections, missing functions, misplaced code |
| `twotails trace [file]` | Trace all signals from a specific file (bidirectional) |
| `twotails test [dir]` | Run virtual memory tests on UI elements |
| `twotails fix [dir]` | Auto-fix all detected issues |
| `twotails report [dir]` | Generate full connection report as table |
| `twotails help` | Show help and examples |

## Install

### Claude Code
```
/plugin marketplace add pavana/TWOtails
/plugin install twotails@twotails
```

### OpenCode
Add to `opencode.json`:
```json
{ "plugin": ["@pavana/twotails"] }
```

### Cursor
```bash
git clone https://github.com/pavana/TWOtails
node TWOtails/scripts/cursor-hooks.js install
```

### Codex
```bash
codex plugin marketplace add pavana/TWOtails
codex plugin install twotails@twotails
```

## What It Detects

| Issue Type | Description | Example |
|-----------|-------------|---------|
| **Disconnected Buttons** | UI element with no handler | `<button onClick={undefined}>` |
| **Missing Functions** | Function called but not defined | `handleSubmit()` without implementation |
| **Orphan Imports** | Import with no usage | `import { util } from './utils'` |
| **Skipped Lines** | Code that never executes | Dead code after `return` |
| **Broken API Routes** | Frontend calls non-existent endpoint | `fetch('/api/missing')` |
| **Event Mismatches** | Event emitted but not listened | `emit('save')` without listener |
| **Type Mismatches** | Wrong types passed between modules | String expected, number received |
| **Circular Dependencies** | A imports B imports A | Module dependency loops |

## Example Output

```
TWOtails Connection Report
═══════════════════════════════════════════════════════════════

Project: my-react-app
Files scanned: 47
Connections found: 156
Issues detected: 4

┌────┬────────────┬──────────────────┬──────────────────┬────────┬─────────────────────┐
│ #  │ Type       │ Sender           │ Receiver         │ Status │ Suggested Fix       │
├────┼────────────┼──────────────────┼──────────────────┼────────┼─────────────────────┤
│ 1  │ onClick    │ Button (line 23) │ handleClick()    │ ✗ MISS │ Define function     │
│ 2  │ API Call   │ fetch('/users')  │ /api/users       │ ✗ 404  │ Check route config  │
│ 3  │ Import     │ utils.js         │ formatDate()     │ ✗ DEAD │ Remove import       │
│ 4  │ State      │ useState()       │ setCount()       │ ✓ OK   │ —                   │
└────┴────────────┴──────────────────┴──────────────────┴────────┴─────────────────────┘

Virtual Memory Test: 2/4 connections verified working
Auto-fix available for 3 issues
```

## Tech Stack

- **Parser**: Tree-sitter (multi-language AST)
- **Tracer**: Custom bidirectional signal matching
- **Virtual Memory**: Playwright sandboxed browser contexts
- **AI Integration**: OpenAI function calling for smart fixes
- **Storage**: In-memory (Redis) for ephemeral test environments
- **Display**: Terminal tables (cli-table3) + optional React dashboard

## Development

```bash
# Clone the repo
git clone https://github.com/pavana/TWOtails.git
cd TWOtails

# Install dependencies
npm install

# Run tests
npm test

# Build for development
npm run dev

# Run the scanner
node src/index.js scan ./examples/broken-app
```

## Project Structure

```
TWOtails/
├── src/
│   ├── analyzer/          # AST parsing and code graph
│   ├── tracer/            # Bidirectional signal tracing
│   ├── virtual-memory/    # Isolated testing sandbox
│   └── reporter/          # Table generation and formatting
├── skills/                # AI agent skill definitions
├── hooks/                 # Agent lifecycle hooks
├── tests/                 # Unit and integration tests
├── examples/              # Demo apps (broken and fixed)
├── benchmarks/            # Performance comparisons
└── docs/                  # Architecture documentation
```

## FAQ

**Does it work with any language?**
Currently JavaScript, TypeScript, Python, and React. More coming.

**How fast is it?**
~2 seconds for a 50-file project. Scales linearly.

**Does it modify my code?**
Only when you run `twotails fix`. Scan and trace are read-only.

**Can I use it with existing CI/CD?**
Yes. `twotails scan` exits with code 1 if issues found. Add to your pipeline.

**What about false positives?**
TWOtails uses bidirectional tracing - signals from both ends. False positive rate is <2%.

## License

[MIT](LICENSE)

## Star History

<a href="https://www.star-history.com/pavana/TWOtails#history">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=pavana/TWOtails&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=pavana/TWOtails&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=pavana/TWOtails&type=Date" />
 </picture>
</a>
