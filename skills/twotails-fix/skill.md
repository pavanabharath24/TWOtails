# TWOtails Fix Skill

## Description
Automatically fix detected issues using AI-powered suggestions. Applies fixes, retests in virtual memory, and verifies the fix works.

## Usage
```
twotails fix [directory] [--auto] [--dry-run]
```

## Auto-Fix Loop

```
FIX LOOP
│
├── 1. DETECT: Scan code, find issues
├── 2. FIX: Apply suggested changes
├── 3. RETEST: Create virtual memory, test again
├── 4. VERIFY: Check if fix worked
│   ├── PASS → Show "Working", delete virtual memory
│   └── FAIL → Return to step 2 with new fix
└── 5. CLEANUP: Remove all temporary files
```

## Fix Types

### Missing Function
```
FIX: Define handleSubmit
FILE: src/App.js:45
CHANGE:
  + const handleSubmit = (event) => {
  +   event.preventDefault();
  +   // Add your logic here
  + };
```

### Disconnected Button
```
FIX: Connect button to handler
FILE: src/components/Form.js:23
CHANGE:
  - <button>Submit</button>
  + <button onClick={handleSubmit}>Submit</button>
```

### Orphan Import
```
FIX: Remove unused import
FILE: src/utils/helpers.js:1
CHANGE:
  - import { formatDate } from './date';
```

### Broken API Route
```
FIX: Add missing route
FILE: src/routes/api.js:12
CHANGE:
  + app.get('/api/users', (req, res) => {
  +   res.json({ users: [] });
  + });
```

## Output
```
Auto-fixing 3 issues...

Applied fixes:
  ✓ src/App.js:45 - Defined handleSubmit function
  ✓ src/components/Form.js:23 - Connected button to handler
  ✓ src/utils/helpers.js:1 - Removed unused import

Retesting in virtual memory...
  ✓ All connections verified working

Cleanup: Virtual memory deleted

Done! 3 issues fixed, 0 remaining.
```

## Dry Run Mode
```
$ twotails fix ./src --dry-run

Would apply 3 fixes:
  ? src/App.js:45 - Define handleSubmit
  ? src/components/Form.js:23 - Connect button
  ? src/utils/helpers.js:1 - Remove import

No changes made. Run without --dry-run to apply.
```
