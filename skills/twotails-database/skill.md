# TWOtails Database Skill

TWOtails database analyzer detects issues with ORM models, queries, migrations, and relations.

## When to Use

Use this skill when:
- Working with Sequelize, Prisma, Mongoose, or Knex
- You need to verify database queries reference existing models
- You want to check for missing awaits on async operations
- You need to find unused models
- You want to validate relations between models

## How to Use

```bash
twotails database ./src
```

## What It Detects

### Missing Models
```
Query references model "user" but no model definition found
→ Define model "user" or check for typos
```

### Missing Awaits
```
Database query "findMany" may be missing await
→ Add "await" before the database query
```

### Unused Models
```
Model "TempData" is defined but never used in queries
→ Use model "TempData" in queries or remove it
```

### Broken Relations
```
Relation references model "Order" but no model definition found
→ Define model "Order" or fix the relation
```

### Migration Issues
```
Migration adds column to table "users" but createTable migration not found
→ Ensure createTable migration runs before addColumn
```

## Supported ORMs

- **Sequelize**: Model definitions, queries, relations
- **Prisma**: Model definitions, queries, relations
- **Mongoose**: Schema definitions, queries, population
- **Knex**: Query builder calls, migrations
