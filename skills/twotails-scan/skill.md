# TWOtails Scan Skill

## Description
Scan an entire codebase to find all broken connections, missing functions, and misplaced code. Outputs a comprehensive connection report.

## Usage
```
twotails scan [directory]
```

## What It Finds
- Missing function definitions (called but not defined)
- Disconnected event handlers (onClick without matching function)
- Orphan imports (imported but never used)
- Cross-file connection gaps

## Output
Table format with:
- File path
- Line number
- Issue type
- Sender/Receiver details
- Status (✗ broken, ✓ connected)
- Suggested fix description
