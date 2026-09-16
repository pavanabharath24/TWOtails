# TWOtails Skill

TWOtails is an AI code quality analyzer with 6 specialized scanners and virtual memory testing.

## When to Use

Use TWOtails when:
- AI generates code and you need to verify it works
- You want to check for broken connections, missing functions, or unused imports
- You need to scan for security vulnerabilities or hardcoded secrets
- You want to verify database models and queries are correct
- You need to test UI components in a real browser

## How to Use

### Full Scan (All 6 Scanners)
```bash
twotails scan ./src
```

### Individual Scanners
```bash
twotails connectivity ./src    # Function calls, handlers, imports
twotails database ./src        # Models, queries, migrations
twotails api ./src             # Routes, middleware, validation
twotails security ./src        # Secrets, SQL injection, XSS
twotails ai-quality ./src      # Hallucinations, deprecated patterns
twotails env ./src             # Environment variables, .env files
```

### Virtual Memory Testing
```bash
twotails test ./
```

### Signal Tracing
```bash
twotails trace ./src/app.jsx
```

## What It Detects

### Connectivity Issues
- Undefined functions (called but never defined)
- Missing event handlers (onClick={handleClick} without implementation)
- Unused imports (imported but never used)
- Parameter mismatches (expects 2 args, gets 0)
- Unused variables (declared but never referenced)

### Database Issues
- Missing models (query references undefined model)
- Missing awaits (async query without await)
- Unused models (defined but never queried)
- Broken relations (references non-existent model)
- Migration order issues

### API Issues
- Missing route handlers
- Unvalidated inputs (req.params without validation)
- Missing authentication on protected routes
- Missing error handling
- Duplicate route definitions

### AI Quality Issues
- Fake npm packages (hallucinations)
- Deprecated framework patterns
- Empty catch blocks
- Debug console statements
- Performance issues

### Security Issues
- Hardcoded secrets (API keys, passwords, tokens)
- SQL injection risks
- XSS vulnerabilities
- Command injection risks
- Weak cryptography
- Insecure CORS configuration

### Environment Issues
- Missing environment variables
- Weak or default secrets
- Missing .env files
- Missing .env.example

## Integration

TWOtails works with:
- Claude Code (via plugin marketplace)
- OpenCode (via opencode.json)
- Cursor (via hooks)
- Codex (via plugin marketplace)
- CI/CD pipelines (exit code 1 on errors)
