# TWOtails - Core Skill

## Description
AI code connectivity analyzer. Traces signals between sender and receiver endpoints to find broken connections, missing functions, and misplaced code.

## When to Use
- After AI generates code and you need to verify all connections work
- Before deploying to catch disconnected buttons, missing handlers, orphan imports
- When debugging why something "should work but doesn't"

## How It Works

### Two-Signal Method
1. Identify the sender (function call, event emit, API fetch, button click)
2. Identify the receiver (function definition, event listener, route handler)
3. Send signal from sender → trace to receiver
4. Send signal from receiver → trace to sender
5. If signals meet = Connected ✓
6. If signals don't meet = Broken ✗

### Output Format
Always present as a table:
| Type | Sender | Receiver | Status | Suggestion |
|------|--------|----------|--------|------------|
| onClick | Button | handleClick | ✗ MISS | Define function |
| API | fetch('/users') | /api/users | ✓ OK | — |
