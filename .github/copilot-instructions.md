# GitHub Copilot Instructions for TWOtails

## Code Analysis Rules

When working with TWOtails codebase:

### Parsing Rules
- Use regex-based parsing as primary method (Tree-sitter as enhancement)
- Always extract: function calls, definitions, imports, events, API calls
- Match by name for connection detection

### Signal Tracing Rules
- Always trace from both sender AND receiver
- If signals collide = Connected
- If signals don't collide = Broken
- Log the exact file:line for both ends

### Virtual Memory Rules
- Always create isolated sandbox for testing
- Always cleanup after test completes
- Never leave sandboxes running
- Test interactions before marking as working

### Output Rules
- Always use table format for results
- Use ✓ for working, ✗ for broken
- Include file:line for traceability
- Show summary at the end

### Fix Rules
- Apply minimal fixes only
- Always retest after fix
- Clean up virtual memory after verification
- Never assume fix worked without testing
