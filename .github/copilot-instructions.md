# GitHub Copilot Instructions for TWOtails

## Code Analysis Rules

When working with TWOtails codebase:

### Parsing Rules
- Use Acorn for real AST parsing (JavaScript/JSX/TypeScript)
- Extract: function calls, definitions, imports, events, API calls, DB queries
- Match by name for connection detection

### Six Scanner Rules
1. **Connectivity** - Trace function calls, handlers, imports
2. **Database** - Verify models, queries, migrations, relations
3. **API Routes** - Check routes, middleware, validation, auth
4. **AI Quality** - Detect hallucinations, deprecated patterns
5. **Security** - Find secrets, SQL injection, XSS, command injection
6. **Environment** - Validate env vars, .env files, config

### Signal Tracing Rules
- Always trace from both sender AND receiver
- If signals collide = Connected
- If signals don't collide = Broken
- Log the exact file:line for both ends

### Virtual Memory Rules
- Always create isolated sandbox for testing (Playwright)
- Always cleanup after test completes
- Never leave sandboxes running
- Test interactions before marking as working
- Capture console errors and page errors

### Output Rules
- Always use table format for results
- Use ✓ for working, ✗ for broken, ⚠ for warnings
- Include file:line for traceability
- Show summary at the end

### Security Rules
- Never hardcode secrets
- Never use string concatenation in SQL
- Never use innerHTML with user input
- Never use MD5/SHA1 for passwords
- Never use Math.random() for security
