# TWOtails Trace Skill

## Description
Trace all signals from a specific file or function using bidirectional signal matching. Sends signals from both sender and receiver endpoints to verify connections.

## Usage
```
twotails trace [file] [--function functionname]
```

## How Signal Tracing Works

### Step 1: Sender Signal
```
SEND Signal FROM: handleSubmit (src/App.js:45)
SIGNAL TYPE: function_call
PAYLOAD: { name: "handleSubmit", args: ["event"] }
```

### Step 2: Receiver Signal
```
SEND Signal TO: handleSubmit (src/utils/handlers.js:12)
SIGNAL TYPE: function_definition
PAYLOAD: { name: "handleSubmit", params: ["event"] }
```

### Step 3: Collision Check
```
SENDER SIGNAL: ────────▶
                    ◀──────── RECEIVER SIGNAL
                         │
                    COLLISION DETECTED
                         │
                    CONNECTION VERIFIED ✓
```

## Output
```
Tracing: handleSubmit

Sender:   src/App.js:45 (function call)
Receiver: src/utils/handlers.js:12 (function definition)

Signal Path:
  App.js:45 ──signal──▶ handlers.js:12
  handlers.js:12 ──signal──▶ App.js:45

Result: COLLISION DETECTED → Connected ✓
```
