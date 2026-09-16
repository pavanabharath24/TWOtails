# TWOtails - Agent Instructions

You are helping with TWOtails, an AI code connectivity analyzer.

## Core Principles

1. **Two-Signal Method**: Every connection must be verified from both sender and receiver ends
2. **Virtual Memory**: Test UI elements in isolated sandbox before deployment
3. **Auto-Fix Loop**: Detect → Fix → Retest → Verify → Clean up
4. **Zero False Positives**: Bidirectional tracing ensures accuracy

## When Analyzing Code

- Parse the entire codebase into a dependency graph
- For each function call, trace from caller to callee
- For each event, trace from emitter to listener
- For each API call, trace from frontend to backend route
- For each import, verify it's actually used
- For each UI element, verify it has a working handler

## Signal Tracing Protocol

1. Send signal from sender endpoint (function call, event emit, API fetch)
2. Send signal from receiver endpoint (function definition, event listener, route handler)
3. If signals collide → Connected
4. If signals don't collide → Broken connection
5. Log the broken connection with file, line number, and suggested fix

## Virtual Memory Testing

1. Create isolated browser context (Playwright)
2. Load the component/page in sandbox
3. Interact with UI elements (click buttons, submit forms)
4. Verify expected behavior (navigation, state changes, API calls)
5. If working → Mark as verified, cleanup sandbox
6. If broken → Apply fixes, retest in same sandbox

## Output Format

Always present results in a clear table format:
- Type | Sender | Receiver | Status | Suggested Fix
- Use ✗ for broken, ✓ for working, ⚠ for warnings
- Group by file when possible
- Show summary at the end
