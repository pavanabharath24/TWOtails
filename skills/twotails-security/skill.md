# TWOtails Security Skill

TWOtails security scanner detects vulnerabilities, secrets, and security issues in code.

## When to Use

Use this skill when:
- You need to find hardcoded secrets or credentials
- You want to check for SQL injection vulnerabilities
- You need to detect XSS risks
- You want to find command injection vulnerabilities
- You need to check for weak cryptography

## How to Use

```bash
twotails security ./src
```

## What It Detects

### Hardcoded Secrets
```
API_KEY detected in code
→ Move secret to environment variable
```

### SQL Injection
```
SQL query with string concatenation (SQL injection risk)
→ Use parameterized queries or prepared statements
```

### XSS Vulnerabilities
```
innerHTML usage (potential XSS)
→ Sanitize output and use textContent instead of innerHTML
```

### Command Injection
```
Command execution with user input
→ Use execFile with fixed arguments or validate input strictly
```

### Weak Cryptography
```
Weak hashing algorithm (use SHA-256+)
→ Use SHA-256 or stronger hashing algorithms
```

### Insecure CORS
```
Permissive CORS configuration
→ Restrict CORS to specific trusted origins
```

## Secret Patterns Detected

- API keys (generic, AWS, Google, GitHub, Slack, Stripe)
- Private keys (RSA, EC, DSA)
- Connection strings with credentials
- Hardcoded passwords
- JWT tokens
