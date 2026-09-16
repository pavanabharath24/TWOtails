# TWOtails Trace Skill

## Description
Trace all signals from a specific file using bidirectional signal matching. Sends signals from both sender and receiver endpoints to verify connections.

## Usage
```
twotails trace [file]
```

## How Signal Tracing Works

### Step 1: Sender Signal
Send signal from sender endpoint (function call, event emit)

### Step 2: Receiver Signal
Send signal from receiver endpoint (function definition, event listener)

### Step 3: Collision Check
If signals meet = Connected ✓
If signals don't meet = Broken ✗

## Output
Table showing:
- Signal type
- Direction (INCOMING/OUTGOING/INTERNAL)
- Sender location
- Receiver location
- Connection status
