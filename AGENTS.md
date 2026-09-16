# TWOtails - Agent Instructions

You are helping with TWOtails, an AI code quality analyzer with 6 specialized scanners and virtual memory testing.

## Core Principles

1. **Two-Signal Method**: Every connection verified from both sender and receiver ends
2. **Six Scanners**: Connectivity, Database, API, AI Quality, Security, Environment
3. **Virtual Memory**: Test UI elements in real Playwright browser sandboxes
4. **Zero False Positives**: Bidirectional tracing ensures accuracy
5. **Read-Only**: Never modify code, only report issues with suggestions

## When Analyzing Code

### Connectivity Analysis
- Parse the entire codebase into a dependency graph
- For each function call, trace from caller to callee
- For each event, trace from emitter to listener
- For each import, verify it's actually used
- For each UI element, verify it has a working handler
- Detect parameter count mismatches
- Detect unused variables and imports

### Database Analysis
- Detect model definitions (Sequelize, Prisma, Mongoose, Knex)
- Verify queries reference existing models
- Check for missing await on async database operations
- Find unused models
- Validate relations reference existing models
- Check migration order (createTable before addColumn)

### API Route Analysis
- Detect route definitions (Express, Fastify, Koa, Next.js, NestJS)
- Verify routes have handler functions
- Check for input validation on parameters
- Detect missing authentication on protected routes
- Find duplicate route definitions
- Check for error handling

### AI Quality Analysis
- Detect hallucinated npm packages
- Find deprecated framework patterns
- Catch empty catch blocks
- Detect debug console statements
- Find performance issues (sequential awaits, JSON deep clone)

### Security Analysis
- Detect hardcoded secrets (API keys, passwords, tokens)
- Find SQL injection risks (string concatenation in queries)
- Detect XSS risks (innerHTML with user input)
- Find command injection (exec with user input)
- Detect weak cryptography (MD5, SHA1, Math.random())
- Check for insecure CORS configuration

### Environment Analysis
- Detect process.env usage without definitions
- Find weak or default secret values
- Check for missing .env files
- Verify .env.example exists

## Virtual Memory Testing

1. Create isolated browser context (Playwright)
2. Load the component/page in sandbox
3. Interact with UI elements (click buttons, submit forms)
4. Verify expected behavior (navigation, state changes, API calls)
5. Capture console errors and page errors
6. Track API calls and responses
7. Report pass/fail for each test
8. Cleanup sandbox after testing

## Signal Tracing Protocol

1. Send signal from sender endpoint (function call, event emit, API fetch)
2. Send signal from receiver endpoint (function definition, event listener, route handler)
3. If signals collide → Connected
4. If signals don't collide → Broken connection
5. Log the broken connection with file, line number, and suggested fix

## Output Format

Always present results in a clear format:
- Use ✗ for errors, ⚠ for warnings, ℹ for info
- Show file path and line number
- Provide clear message and suggestion
- Group by scanner category
- Show summary at the end

## CLI Commands

```bash
twotails scan [dir]           # Full analysis (all 6 scanners)
twotails connectivity [dir]   # Only connectivity
twotails database [dir]       # Only database
twotails api [dir]            # Only API routes
twotails security [dir]       # Only security
twotails ai-quality [dir]     # Only AI quality
twotails env [dir]            # Only environment
twotails test [dir]           # Virtual memory testing
twotails trace [file]         # Bidirectional signal tracing
twotails report [dir]         # Generate full report
```

## Testing

```bash
npm test                    # 25/25 analyzer tests
npm run test:virtual        # 16/17 Playwright tests
```

## Project Structure

```
src/
├── analyzer/
│   ├── line-analyzer.js       # Connectivity scanner
│   ├── database-analyzer.js   # Database scanner
│   ├── api-analyzer.js        # API route scanner
│   ├── ai-quality-scanner.js  # AI quality scanner
│   ├── security-scanner.js    # Security scanner
│   ├── env-analyzer.js        # Environment scanner
│   └── master-analyzer.js     # Combines all 6 scanners
├── tracer/
│   └── signal-matcher.js      # Bidirectional signal tracing
├── virtual-memory/
│   ├── memory-manager.js      # Playwright browser management
│   ├── sandbox-runner.js      # Test suite runner
│   ├── runner.js              # Auto-generates test HTML
│   └── memory-cleanup.js      # Cleanup utilities
├── reporter/
│   └── table-generator.js     # Table output formatting
└── index.js                   # CLI entry point
```
