# TWOtails API Skill

TWOtails API analyzer detects issues with routes, middleware, handlers, and validation.

## When to Use

Use this skill when:
- Working with Express, Fastify, Koa, Next.js, or NestJS
- You need to verify routes have handlers
- You want to check for input validation
- You need to detect missing authentication
- You want to find duplicate routes

## How to Use

```bash
twotails api ./src
```

## What It Detects

### Missing Route Handlers
```
Route GET /users references handler "getUser" but it's not defined or imported
→ Define or import handler "getUser"
```

### Unvalidated Input
```
Route query parameter "id" is not validated
→ Add validation for parameter "id"
```

### Missing Authentication
```
Route POST /admin has no authentication
→ Add authentication middleware to protect this route
```

### Missing Error Handling
```
Route GET /data has no error handling
→ Add try/catch or error handler middleware
```

### Duplicate Routes
```
Duplicate route GET /users (first defined at routes.js:10)
→ Remove duplicate route or use different path
```

## Supported Frameworks

- **Express**: app.get(), router.post(), middleware
- **Fastify**: fastify.get(), fastify.post()
- **Koa**: router.get(), router.post()
- **Next.js**: export async function GET/POST
- **NestJS**: @Get(), @Post(), @Controller()
