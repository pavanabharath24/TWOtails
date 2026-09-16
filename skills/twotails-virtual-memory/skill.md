# TWOtails Virtual Memory Skill

TWOtails virtual memory testing runs UI components in real Playwright browser sandboxes.

## When to Use

Use this skill when:
- You need to test UI components in a real browser
- You want to verify buttons, forms, and navigation work
- You need to check for console errors
- You want to test API calls from the frontend
- You need to verify component rendering

## How to Use

```bash
twotails test ./
```

## What It Tests

### Buttons
- Button exists in DOM
- Button is visible
- Button is clickable
- No errors after click

### Forms
- Form exists
- Fields can be filled
- Form submits correctly
- Validation works

### Navigation
- Links exist
- Clicking triggers navigation
- URL changes correctly

### API Calls
- API calls are made on interaction
- Response status codes are correct
- No network errors

### Components
- Component renders
- Expected children exist
- No console errors
- No page errors

## How It Works

1. **Create Sandbox** - Isolated browser context
2. **Load HTML** - Render component in browser
3. **Interact** - Click buttons, fill forms, navigate
4. **Verify** - Check elements, text, visibility, values
5. **Capture** - Console errors, page errors, API calls
6. **Report** - Pass/fail for each test
7. **Cleanup** - Destroy sandbox, free memory

## Example Output

```
Virtual Memory Test Results
══════════════════════════════════════════════════════════════
Total test suites: 3
Passed: 2
Failed: 1
Total individual tests: 12
Individual tests passed: 10

1. Button Tests: ✓ PASS
   ✓ Button "Save" exists
   ✓ Button "Save" is visible
   ✓ Button "Save" click works

2. Form Tests: ✓ PASS
   ✓ Form exists
   ✓ Fill field "username"
   ✓ Fill field "email"
   ✓ Form submits

3. Navigation Tests: ✗ FAIL
   ✓ Link "Home" exists
   ✗ Navigation to /home
```
