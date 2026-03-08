## Task 1: Database Initialization - Learnings

### better-sqlite3 Installation
- Native module requires manual build when using pnpm due to build script restrictions
- Build command: `cd node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3 && npm run install`
- Alternative: configure `onlyBuiltDependencies` in `.npmrc` or `package.json`

### TypeScript Import Pattern
```typescript
import DatabaseConstructor from "better-sqlite3";
import type { Database } from "better-sqlite3";
```
- Import both the constructor and the type separately
- Use `DatabaseConstructor` for `new DatabaseConstructor()` calls
- Use `Database` type for type annotations

### Schema Design Decisions
- UUID primary keys (TEXT) - use crypto.randomUUID() when inserting
- INTEGER timestamps - milliseconds since epoch (Date.now())
- Default timestamps via SQLite: `CAST(strftime('%s', 'now') AS INTEGER) * 1000`
- Foreign keys with CASCADE delete for data integrity
- CHECK constraints for enum-like status fields
- Indexes on frequently queried columns (stream_token, payment_hash, session_id)

### SQLite Configuration
- WAL mode for better concurrency
- Foreign keys enabled for referential integrity

### Testing
```bash
cd backend
npx tsx -e "import db from './src/db'; console.log(db.prepare('SELECT 1').get())"
# Expected: { '1': 1 }
```
