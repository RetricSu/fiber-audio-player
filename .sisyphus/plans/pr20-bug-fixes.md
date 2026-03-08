# PR #20 Bug Fix Plan

## Overview

This plan addresses all legitimate bugs identified by both Gemini Code Assist and Prometheus peer review for PR #20 (Multi-Podcast Backend).

**Total Issues**: 16 bugs/todos
**Estimated Effort**: Medium (3-4 hours of focused work)
**Parallel Tasks**: Yes - grouped by wave

---

## Bug Inventory

### Critical (Must Fix Before Merge)

| ID | Source | File | Issue | Impact |
|----|--------|------|-------|--------|
| C1 | Gemini | `storage.ts:185` | `upload()` generates new episodeId instead of accepting it | Files stored with wrong IDs - broken retrieval |
| C2 | Gemini | `index.ts:709-716` | `constructHlsUrl()` returns wrong URL format | API returns 404 URLs for streaming |
| C3 | Me | `index.ts` | `startServer()` called at module load causes EADDRINUSE in tests | Test failures, uncaught exceptions |
| C4 | Me | `transcode.ts:5,260` | Uses deprecated `db` import - bypasses initialization | Race conditions, potential crashes |

### High (Fix Before Production)

| ID | Source | File | Issue | Impact |
|----|--------|------|-------|--------|
| H1 | Gemini | `API.md:213` | Documents wrong HLS URL format | Users get 404 following docs |
| H2 | Gemini | `db.ts:32-105` | Schema duplicated in db.ts and migrations | Maintenance risk, DRY violation |
| H3 | Gemini | `storage.ts:20` | MIME types restrictiver than validation.ts | Valid uploads rejected |
| H4 | Gemini | `storage.ts:14` | UPLOADS_DIR hardcoded, ignores env var | Can't customize upload dir |
| H5 | Me | `index.ts:1184` | File upload buffers entire file in memory | OOM crash on large uploads |
| H6 | Me | `index.ts:58` | Open CORS - no origin restriction | Security risk |
| H7 | Me | - | No rate limiting on admin/payment endpoints | DoS vulnerability |
| H8 | Me | - | Missing payment flow tests | Core functionality untested |

### Medium (Post-Merge Polish)

| ID | Source | File | Issue | Impact |
|----|--------|------|-------|--------|
| M1 | Me | `index.ts` | Monolithic file (1,546 lines) | Maintainability |
| M2 | Me | Tests | `createTestServer()` duplicated in 3 files | Code duplication |

---

## Execution Strategy

### Wave 1: Critical Bug Fixes (Foundation)
**Dependencies**: None - can start immediately
**Parallel Tasks**: 4 tasks

- [ ] **C4**: Fix transcode.ts deprecated db import
- [ ] **C3**: Fix EADDRINUSE test errors (conditional server start)
- [ ] **C1**: Fix storage.ts upload() to accept episodeId parameter
- [ ] **C2**: Fix constructHlsUrl() to return correct URL

### Wave 2: High Priority Fixes (API Consistency)
**Dependencies**: Wave 1 (some file changes may overlap)
**Parallel Tasks**: 4 tasks

- [ ] **H3**: Align storage.ts MIME types with validation.ts
- [ ] **H4**: Make UPLOADS_DIR respect env var
- [ ] **H1**: Fix API.md HLS URL documentation
- [ ] **H2**: Remove duplicate schema from db.ts

### Wave 3: Security & Performance (Production Readiness)
**Dependencies**: Wave 1-2 complete
**Parallel Tasks**: 3 tasks

- [ ] **H5**: Fix file upload memory issue (streaming)
- [ ] **H6**: Add CORS origin restrictions
- [ ] **H7**: Add rate limiting middleware

### Wave 4: Test Coverage (Quality Assurance)
**Dependencies**: Waves 1-3 (need stable API)
**Parallel Tasks**: 2 tasks

- [ ] **H8**: Add payment flow integration tests
- [ ] **M2**: Extract shared test utilities

### Wave 5: Refactoring (Code Quality)
**Dependencies**: All above complete
**Parallel Tasks**: 1 task

- [ ] **M1**: Refactor monolithic index.ts (extract routes)

### Wave FINAL: Verification (QA)
**Dependencies**: All waves complete
**Parallel Tasks**: 4 tasks

- [ ] **F1**: Run all 38+ tests - verify pass
- [ ] **F2**: Manual test file upload flow
- [ ] **F3**: Manual test payment flow
- [ ] **F4**: Code review - verify all fixes applied

---

## TODOs

### Wave 1: Critical Bug Fixes

- [x] **C4.1**: Fix transcode.ts deprecated db import

  **What to do**:
  - Change `import { db } from './db.js'` to `import { getDb } from './db.js'`
  - Replace `db.prepare(...)` with `getDb().prepare(...)` on line 260
  - Ensure tests still pass

  **Must NOT do**:
  - Don't change any business logic
  - Don't modify the SQL queries

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `git-master` (for clean commits)
  - **Reason**: Simple refactoring with clear scope

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `backend/src/transcode.ts:5` - Import statement to change
  - `backend/src/transcode.ts:260-263` - Usage to update
  - `backend/src/db.ts:145-152` - getDb() function reference

  **Acceptance Criteria**:
  - [ ] `import { getDb }` present in transcode.ts
  - [ ] Line 260 uses `getDb().prepare()`
  - [ ] `bun test` passes
  - [ ] No TypeScript errors

  **QA Scenarios**:
  ```
  Scenario: Verify transcode service uses getDb()
    Tool: Bash (grep)
    Steps:
      1. grep "import.*getDb" backend/src/transcode.ts
      2. grep "getDb().prepare" backend/src/transcode.ts
    Expected: Both commands return matches
    Evidence: Terminal output showing matches
  ```

  **Commit**: YES
  - Message: `fix(transcode): use getDb() instead of deprecated db export`
  - Files: `backend/src/transcode.ts`
  - Pre-commit: `bun test`

- [x] **C3.1**: Fix EADDRINUSE test errors

  **What to do**:
  - Add guard to prevent `startServer()` from running during tests
  - Extract server startup or add NODE_ENV check
  - Best approach: Move server start to separate entry point

  **Must NOT do**:
  - Don't change the app export
  - Don't break production startup

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None
  - **Reason**: Simple conditional logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `backend/src/index.ts:1527-1546` - Server startup code
  - `backend/tests/setup.ts:24` - Test initialization

  **Acceptance Criteria**:
  - [ ] Tests run without EADDRINUSE errors
  - [ ] Production server still starts normally
  - [ ] `bun test` passes

  **QA Scenarios**:
  ```
  Scenario: Verify tests run without port conflicts
    Tool: Bash
    Steps:
      1. cd backend && npx vitest run 2>&1
      2. Check output for "EADDRINUSE" or "port already in use"
    Expected: No port conflict errors
    Evidence: Clean test output
  ```

  **Commit**: YES
  - Message: `fix(backend): prevent server start during tests`
  - Files: `backend/src/index.ts`, `backend/src/server.ts` (new)
  - Pre-commit: `bun test`

- [x] **C1.1**: Fix storage.ts upload() episodeId bug

  **What to do**:
  - Change `upload()` signature to accept `episodeId` parameter
  - Remove `const episodeId = randomUUID()` line
  - Update all callers (index.ts upload endpoint)

  **Must NOT do**:
  - Don't change the returned episodeId in result
  - Don't break existing test setup

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None
  - **Reason**: Cross-file changes, need to update caller

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: C2 (HLS URL fix uses storage paths)
  - **Blocked By**: None

  **References**:
  - `backend/src/storage.ts:166-195` - upload() function
  - `backend/src/index.ts:1189-1195` - Caller in upload endpoint
  - `backend/src/storage.ts:50-56` - UploadResult interface

  **Acceptance Criteria**:
  - [ ] `upload()` accepts `episodeId: string` parameter
  - [ ] No `randomUUID()` call in upload()
  - [ ] Index.ts passes episodeId to upload()
  - [ ] Tests pass

  **QA Scenarios**:
  ```
  Scenario: Verify upload uses correct episode ID
    Tool: Bash (node)
    Steps:
      1. Create test script that calls StorageService.upload with specific episodeId
      2. Check created directory path
    Expected: Directory named with provided episodeId, not random
  ```

  **Commit**: YES
  - Message: `fix(storage): accept episodeId parameter instead of generating new one`
  - Files: `backend/src/storage.ts`, `backend/src/index.ts`
  - Pre-commit: `bun test`

- [x] **C2.1**: Fix constructHlsUrl() wrong URL format

  **What to do**:
  - Change function to return URL matching actual route: `/stream/hls/playlist.m3u8`
  - Remove podcastId/episodeId from path construction
  - Ensure token-based auth still works

  **Must NOT do**:
  - Don't change the streaming route itself
  - Don't break token validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None
  - **Reason**: Simple URL string change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: H1 (API docs fix)
  - **Blocked By**: None

  **References**:
  - `backend/src/index.ts:708-716` - constructHlsUrl function
  - `backend/src/index.ts:646` - Actual streaming route

  **Acceptance Criteria**:
  - [ ] Function returns `/stream/hls/playlist.m3u8`
  - [ ] Public API returns correct hls_url
  - [ ] Streaming still works with token

  **QA Scenarios**:
  ```
  Scenario: Verify HLS URL is correct
    Tool: Bash (curl)
    Steps:
      1. Create podcast and episode via API
      2. GET /api/podcasts/{id}/episodes
      3. Check hls_url field
    Expected: URL is "/stream/hls/playlist.m3u8" (token added by frontend)
  ```

  **Commit**: YES
  - Message: `fix(api): correct HLS URL format in constructHlsUrl`
  - Files: `backend/src/index.ts`
  - Pre-commit: `bun test`

---

### Wave 2: API Consistency Fixes

- [ ] **H3.1**: Align storage.ts MIME types with validation.ts

  **What to do**:
  - Add `audio/wav`, `audio/ogg`, `audio/aac` to storage.ts ALLOWED_MIME_TYPES
  - Add corresponding extensions to MIME_TYPE_EXTENSIONS

  **Must NOT do**:
  - Don't remove existing MIME types
  - Don't change validation.ts

  **Acceptance Criteria**:
  - [ ] All 5 MIME types from validation.ts are in storage.ts
  - [ ] Each has corresponding file extension
  - [ ] Tests pass

  **Commit**: YES
  - Message: `fix(storage): add missing MIME types (wav, ogg, aac)`
  - Files: `backend/src/storage.ts`

- [ ] **H4.1**: Make UPLOADS_DIR respect env var

  **What to do**:
  - Change hardcoded UPLOADS_DIR to use process.env.UPLOADS_DIR || default
  - Ensure tests still work with TEST_UPLOADS_DIR

  **Acceptance Criteria**:
  - [ ] UPLOADS_DIR uses env var when set
  - [ ] Falls back to default when not set
  - [ ] Tests pass

  **Commit**: YES
  - Message: `fix(storage): respect UPLOADS_DIR environment variable`
  - Files: `backend/src/storage.ts`

- [ ] **H1.1**: Fix API.md HLS URL documentation

  **What to do**:
  - Update example hls_url in API.md to match actual format
  - Check all HLS URL examples in documentation

  **Acceptance Criteria**:
  - [ ] API.md shows correct URL format
  - [ ] All examples are consistent

  **Commit**: YES
  - Message: `docs(api): correct HLS URL format in documentation`
  - Files: `backend/API.md`

- [ ] **H2.1**: Remove duplicate schema from db.ts

  **What to do**:
  - Remove CREATE TABLE statements from db.ts initializeSchema()
  - Keep only the migration table creation
  - Rely on migrations/001_initial_schema.sql for schema

  **Must NOT do**:
  - Don't remove migrations table creation
  - Don't break existing database initialization

  **Acceptance Criteria**:
  - [ ] db.ts has no duplicate schema definitions
  - [ ] Migrations still run on startup
  - [ ] Tests pass

  **Commit**: YES
  - Message: `refactor(db): remove duplicate schema definitions`
  - Files: `backend/src/db.ts`

---

### Wave 3: Security & Performance

- [ ] **H5.1**: Fix file upload memory issue

  **What to do**:
  - Change `Buffer.from(await validatedFile.arrayBuffer())` to streaming
  - Use `file.stream()` instead of `arrayBuffer()`
  - Pipe directly to storage service

  **Acceptance Criteria**:
  - [ ] Large files don't buffer in memory
  - [ ] Upload still works correctly
  - [ ] Tests pass

  **Commit**: YES
  - Message: `perf(upload): stream files instead of buffering in memory`
  - Files: `backend/src/index.ts`

- [ ] **H6.1**: Add CORS origin restrictions

  **What to do**:
  - Replace `app.use('*', cors())` with configured CORS
  - Allow specific origins from env var
  - Default to restrictive in production

  **Acceptance Criteria**:
  - [ ] CORS middleware has origin configuration
  - [ ] Production defaults to restrictive
  - [ ] Frontend can still access API

  **Commit**: YES
  - Message: `security(cors): add origin restrictions`
  - Files: `backend/src/index.ts`

- [ ] **H7.1**: Add rate limiting middleware

  **What to do**:
  - Install rate limiting package (e.g., `hono-rate-limiter`)
  - Add rate limits to admin endpoints
  - Add rate limits to payment endpoints
  - Configure via env vars

  **Acceptance Criteria**:
  - [ ] Rate limiting middleware installed
  - [ ] Admin endpoints rate limited
  - [ ] Payment endpoints rate limited
  - [ ] Tests pass

  **Commit**: YES
  - Message: `security(api): add rate limiting to sensitive endpoints`
  - Files: `backend/src/index.ts`, `backend/package.json`

---

### Wave 4: Test Coverage

- [ ] **H8.1**: Add payment flow integration tests

  **What to do**:
  - Create `tests/payments.test.ts`
  - Test `/sessions/create` endpoint
  - Test `/invoices/create` endpoint (mock Fiber client)
  - Test `/invoices/claim` endpoint (mock Fiber client)
  - Test `/stream/hls/:fileName` endpoint

  **Acceptance Criteria**:
  - [ ] Payment flow tests file created
  - [ ] All 4 endpoints have tests
  - [ ] Tests mock external Fiber client
  - [ ] All tests pass

  **Commit**: YES
  - Message: `test(payments): add integration tests for payment flow`
  - Files: `backend/tests/payments.test.ts`

- [ ] **M2.1**: Extract shared test utilities

  **What to do**:
  - Create `tests/utils.ts`
  - Move `createTestServer()` to utils
  - Move test helper functions to utils
  - Update all test files to import from utils

  **Acceptance Criteria**:
  - [ ] tests/utils.ts created
  - [ ] No duplicate createTestServer functions
  - [ ] All tests import from utils
  - [ ] All tests pass

  **Commit**: YES
  - Message: `refactor(tests): extract shared test utilities`
  - Files: `backend/tests/utils.ts`, `backend/tests/*.test.ts`

---

### Wave 5: Refactoring

- [ ] **M1.1**: Refactor monolithic index.ts

  **What to do**:
  - Create `routes/` directory
  - Extract podcast routes to `routes/podcasts.ts`
  - Extract episode routes to `routes/episodes.ts`
  - Extract payment routes to `routes/payments.ts`
  - Extract streaming routes to `routes/streaming.ts`
  - Keep middleware and setup in index.ts

  **Acceptance Criteria**:
  - [ ] Routes directory created
  - [ ] Each route category in separate file
  - [ ] index.ts under 500 lines
  - [ ] All tests pass

  **Commit**: YES
  - Message: `refactor(routes): extract routes from monolithic index.ts`
  - Files: `backend/src/routes/*.ts`, `backend/src/index.ts`

---

### Wave FINAL: Verification

- [ ] **F1**: Run all tests

  **What to do**:
  - Run `cd backend && npx vitest run`
  - Verify all 38+ tests pass
  - Check for any console warnings/errors

  **Acceptance Criteria**:
  - [ ] All tests pass
  - [ ] No EADDRINUSE errors
  - [ ] Clean console output

- [ ] **F2**: Manual file upload test

  **What to do**:
  - Start backend
  - Create podcast via API
  - Create episode
  - Upload audio file
  - Verify file stored correctly
  - Verify can retrieve file

  **Acceptance Criteria**:
  - [ ] Upload succeeds
  - [ ] File in correct directory
  - [ ] Episode storage_path updated

- [ ] **F3**: Manual payment flow test

  **What to do**:
  - Start backend with mock Fiber client
  - Create session
  - Create invoice
  - Verify invoice created
  - Test streaming endpoint with token

  **Acceptance Criteria**:
  - [ ] Session created
  - [ ] Invoice created
  - [ ] Stream endpoint accessible with token

- [ ] **F4**: Code review verification

  **What to do**:
  - Review all changes
  - Verify each bug fix applied
  - Check code quality
  - Verify no regressions

  **Acceptance Criteria**:
  - [ ] All 16 bugs addressed
  - [ ] No new issues introduced
  - [ ] Code style consistent

---

## Verification Strategy

### Test Commands
```bash
# Run all tests
cd backend && npx vitest run

# Type checking
cd backend && npx tsc --noEmit

# Manual API test
curl http://localhost:8787/healthz
```

### Success Criteria
- [ ] All 38+ existing tests pass
- [ ] New payment flow tests pass
- [ ] No TypeScript errors
- [ ] No EADDRINUSE test errors
- [ ] File upload works end-to-end
- [ ] API documentation matches implementation
- [ ] CORS restrictions work
- [ ] Rate limiting active

---

## Commit Strategy

Each wave should be committed separately:
1. `fix(wave1): critical bug fixes`
2. `fix(wave2): api consistency fixes`
3. `security(wave3): add rate limiting and cors`
4. `test(wave4): add payment flow tests and utilities`
5. `refactor(wave5): extract route modules`

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive test suite + manual testing |
| Database schema changes | Migration system handles changes |
| File upload changes | Test with various file sizes |
| CORS breaking frontend | Configure allowed origins properly |

---

## Success Criteria

**Definition of Done**:
- [ ] All 16 bugs fixed
- [ ] All tests passing (38+ existing + new)
- [ ] No new TypeScript errors
- [ ] Manual testing confirms fixes work
- [ ] Code review completed
- [ ] PR ready for merge
