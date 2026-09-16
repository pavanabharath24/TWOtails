# TWOtails Scan Skill

## Description
Scan an entire codebase to find all broken connections, missing functions, and misplaced code. Outputs a comprehensive connection report.

## Usage
```
twotails scan [directory]
```

## What It Finds
- Disconnected UI elements (buttons without handlers)
- Missing function definitions (called but not defined)
- Orphan imports (imported but never used)
- Dead code (unreachable after return/break)
- Broken API routes (frontend calls non-existent endpoint)
- Event mismatches (emitted but not listened)
- Type mismatches (wrong types between modules)
- Circular dependencies

## Output
Table format with:
- File path
- Line number
- Issue type
- Sender/Receiver details
- Status (✗ broken, ✓ working, ⚠ warning)
- Suggested fix

## Example
```
$ twotails scan ./src

Found 3 issues in 47 files:

┌──────┬────────────┬──────────────────┬──────────────────┬────────┬─────────────┐
│ #    │ Type       │ Sender           │ Receiver         │ Status │ Fix         │
├──────┼────────────┼──────────────────┼──────────────────┼────────┼─────────────┤
│ 1    │ onClick    │ Button (L23)     │ handleClick()    │ ✗ MISS │ Define func │
│ 2    │ API Call   │ fetch('/users')  │ /api/users       │ ✗ 404  │ Check route │
│ 3    │ Import     │ utils.js         │ formatDate()     │ ✗ DEAD │ Remove      │
└──────┴────────────┴──────────────────┴──────────────────┴────────┴─────────────┘
```
