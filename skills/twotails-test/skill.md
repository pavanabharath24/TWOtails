# TWOtails Test Skill

## Description
Test UI elements in isolated virtual memory sandboxes. Creates temporary browser contexts to verify buttons, forms, and navigation work correctly without deploying.

## Usage
```
twotails test [directory] [--element button|form|navigation]
```

## Virtual Memory Process

### 1. Create Sandbox
```
CREATING VIRTUAL MEMORY
├── Browser Context: isolated
├── DOM Snapshot: loaded
├── Network: mocked
└── State: fresh
```

### 2. Run Tests
```
TESTING: Submit Button (src/components/Form.js:34)
├── Click button
├── Wait for handler
├── Check navigation
├── Verify state change
└── Result: PASS ✓
```

### 3. Cleanup
```
VIRTUAL MEMORY CLEANUP
├── Browser Context: destroyed
├── DOM Snapshot: cleared
├── Network: disconnected
└── State: deleted
```

## Test Types
- **Button Click**: Verify onClick handler fires
- **Form Submit**: Verify onSubmit processes data
- **Navigation**: Verify routes change correctly
- **State Change**: Verify useState updates propagate
- **API Mock**: Verify fetch calls go to right endpoints

## Output
```
Virtual Memory Tests: 4/5 passed

┌─────────────────┬──────────┬──────────┬─────────┐
│ Element         │ File     │ Result   │ Time    │
├─────────────────┼──────────┼──────────┼─────────┤
│ Submit Button   │ Form.js  │ ✓ PASS   │ 120ms   │
│ Login Form      │ Auth.js  │ ✓ PASS   │ 230ms   │
│ Nav Links       │ App.js   │ ✗ FAIL   │ 80ms    │
│ Cart Button     │ Shop.js  │ ✓ PASS   │ 150ms   │
│ Search Input    │ Home.js  │ ✓ PASS   │ 90ms    │
└─────────────────┴──────────┴──────────┴─────────┘

Cleanup: Virtual memory deleted
```
