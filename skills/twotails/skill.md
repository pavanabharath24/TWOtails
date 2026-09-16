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

### Virtual Memory Testing
1. Create isolated browser sandbox
2. Load the component/page
3. Interact with UI elements
4. Verify expected behavior
5. If working → cleanup and mark verified
6. If broken → fix, retest, repeat

## Output Format
Always present as a table:
| Type | Sender | Receiver | Status | Action |
|------|--------|----------|--------|--------|
| onClick | Button | handleClick | ✗ MISS | Define function |
| API | fetch('/users') | /api/users | ✓ OK | — |
