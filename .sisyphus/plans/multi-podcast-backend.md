# Work Plan: Self-Hosted Multi-Podcast Backend with Fiber Payments

## TL;DR

Build a self-hosted backend that lets a single creator host multiple podcasts/episodes with pay-per-second Fiber Network payments from anonymous listeners.

**Core Deliverables:**
- SQLite database for episode metadata
- Local filesystem storage for audio files
- Extended payment flow supporting multiple episodes
- Admin API for episode management
- Frontend updates for episode selection

**Effort:** Medium (4-6 weeks)  
**Parallel Execution:** Yes (3 waves)  
**Critical Path:** Database Schema → Storage Layer → Payment Integration → Frontend

---

## Context

### Current State
- Hono backend with in-memory storage (resets on restart)
- Single hardcoded episode in frontend
- HLS streaming with 6-second segments and token authorization
- Working Fiber payment flow: session → invoice → claim → stream
- Episode metadata hardcoded in React component

### Target State
- SQLite database persists episodes and payment sessions
- Multiple podcasts, each with multiple episodes
- Audio files stored on local filesystem (or self-hosted MinIO)
- Payment flow works with any episode
- Simple admin API to upload/manage episodes
- Frontend can browse and select episodes

### Why This Scope
- Self-hosted: Run on single VPS or home server
- Single creator: No multi-tenancy complexity
- Anonymous: No user auth system needed
- Backend priority: Core infrastructure first, UI polish later

---

## Work Objectives

### Core Objective
Extend the current Fiber Audio Player backend to support multiple podcasts and episodes with persistent storage, enabling a single creator to manage their content library while listeners pay per-second via Fiber Network.

### Concrete Deliverables
1. SQLite database with schema for podcasts, episodes, and payment sessions
2. File upload and storage system for audio files
3. Admin API endpoints (CRUD for podcasts/episodes)
4. Modified payment flow supporting episode-specific payments
5. Frontend episode browser and player integration

### Definition of Done
- [ ] Creator can upload audio files via API
- [ ] Multiple episodes appear in frontend
- [ ] Listeners can select any episode and pay-per-second
- [ ] Payment sessions persist in database
- [ ] Backend survives restart without data loss

### Must Have
- SQLite database persistence
- Multi-episode support
- Working payment flow for any episode
- Admin API for content management
- Local filesystem storage

### Must NOT Have
- User authentication for listeners
- RSS feeds (out of scope)
- Analytics dashboard (out of scope)
- Multi-creator support
- Complex CDN setup

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** No existing tests
- **Automated tests:** Yes (Tests after) - Add tests after implementation
- **Framework:** bun test (already have bun in project)
- **Agent-Executed QA:** Yes - Every task includes verification scenarios

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario}.{ext}`.

**Verification Methods:**
- API: Use `curl` to test endpoints, validate JSON responses
- Database: Query SQLite to verify data persistence
- Files: Verify files exist on filesystem with correct permissions
- Integration: End-to-end payment flow test

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: SQLite database schema and connection
├── Task 2: File storage layer (upload, retrieval, deletion)
└── Task 3: FFmpeg transcoding service

Wave 2 (Core Features - After Wave 1):
├── Task 4: Admin API - Podcast CRUD
├── Task 5: Admin API - Episode CRUD with file upload
├── Task 6: Modify payment flow for multi-episode
└── Task 7: Payment session persistence in database

Wave 3 (Frontend Integration - After Wave 2):
├── Task 8: Episode list API endpoint
├── Task 9: Frontend episode browser component
├── Task 10: Update player to work with dynamic episodes
└── Task 11: Admin UI (optional - minimal)

Wave 4 (Testing & Polish - After Wave 3):
├── Task 12: Database migration system
├── Task 13: Error handling and validation
├── Task 14: API documentation
└── Task 15: End-to-end integration tests
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (DB Schema) | - | 2, 4, 5, 7 |
| 2 (Storage) | 1 | 3, 5 |
| 3 (FFmpeg) | 2 | 5 |
| 4 (Podcast API) | 1 | - |
| 5 (Episode API) | 1, 2, 3 | 6 |
| 6 (Payment Flow) | 5 | 7 |
| 7 (Session Persistence) | 1, 6 | - |
| 8 (Episode List) | 1 | 9 |
| 9 (Frontend Browser) | 8 | 10 |
| 10 (Player Update) | 9 | - |
| 11 (Admin UI) | 4, 5 | - |
| 12 (Migrations) | 1 | - |
| 13 (Error Handling) | All above | - |
| 14 (Docs) | All above | - |
| 15 (E2E Tests) | All above | - |

### Critical Path
Task 1 → Task 2 → Task 3 → Task 5 → Task 6 → Task 7 → Task 10 → Task 15

### Agent Dispatch Summary

- **Wave 1:** 3 tasks → `quick` (foundation)
- **Wave 2:** 4 tasks → `unspecified-high` (core logic)
- **Wave 3:** 4 tasks → `visual-engineering` (frontend)
- **Wave 4:** 4 tasks → `deep` (testing, docs)

---

## TODOs

### Wave 1: Foundation

- [ ] 1. SQLite Database Schema and Connection

  **What to do:**
  - Install better-sqlite3 dependency
  - Create database initialization script
  - Design and implement schema:
    - podcasts table (id, title, description, created_at)
    - episodes table (id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at)
    - stream_sessions table (id, episode_id, stream_token, total_paid_seconds, max_segment_index, expires_at, created_at)
    - payments table (id, session_id, payment_hash, preimage, amount_shannon, granted_seconds, status, created_at, settled_at)
  - Create database connection singleton
  - Add connection health check

  **Must NOT do:**
  - Don't use an ORM (keep it simple with raw SQL)
  - Don't add user authentication tables

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 2, 3)
  - **Blocks:** Tasks 4, 5, 7

  **References:**
  - `backend/src/index.ts` - See current in-memory Maps structure
  - `backend/package.json` - Current dependencies
  - SQLite schema examples for reference

  **Acceptance Criteria:**
  - [ ] Database file created at `backend/data/podcast.db`
  - [ ] All tables exist with correct schema
  - [ ] Connection test passes

  **QA Scenarios:**

  ```
  Scenario: Database initialization
    Tool: Bash (node)
    Steps:
      1. Run `cd backend && node -e "const db = require('./src/db').default; console.log(db.prepare('SELECT 1').get())"`
    Expected Result: Output shows `{ '1': 1 }`
    Evidence: .sisyphus/evidence/task-1-db-init.txt

  Scenario: Tables exist
    Tool: Bash (sqlite3)
    Steps:
      1. Run `sqlite3 backend/data/podcast.db ".tables"`
    Expected Result: Output includes podcasts, episodes, stream_sessions, payments
    Evidence: .sisyphus/evidence/task-1-tables.txt
  ```

  **Commit:** YES
  - Message: `feat(db): add SQLite schema for podcasts, episodes, and payments`
  - Files: `backend/src/db.ts`, `backend/data/`

- [ ] 2. File Storage Layer

  **What to do:**
  - Create storage service for audio files
  - Implement upload endpoint (multipart/form-data)
  - Implement file retrieval
  - Implement file deletion
  - Organize files by podcast/episode structure:
    ```
    backend/uploads/
    ├── {podcast_id}/
    │   ├── {episode_id}/
    │   │   ├── source.mp3
    │   │   ├── hls/
    │   │   │   ├── playlist.m3u8
    │   │   │   ├── enc.key
    │   │   │   └── segment_*.ts
    ```
  - Add file size limits (500MB max)
  - Add MIME type validation (audio/mpeg, audio/mp3)
  - Generate unique IDs for episodes

  **Must NOT do:**
  - Don't store files in database BLOBs
  - Don't use external storage (S3) yet

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 1, 3)
  - **Depends On:** Task 1 (for episode ID generation)
  - **Blocks:** Task 5

  **References:**
  - `backend/src/index.ts:115-122` - Current hlsDir resolution logic
  - Hono file upload documentation

  **Acceptance Criteria:**
  - [ ] Can upload MP3 files via POST /admin/episodes/{id}/upload
  - [ ] Files stored in organized directory structure
  - [ ] Can retrieve files via GET /uploads/{path}

  **QA Scenarios:**

  ```
  Scenario: Upload audio file
    Tool: Bash (curl)
    Steps:
      1. Create test episode in DB first (manual SQL)
      2. Run `curl -X POST -F "file=@test.mp3" http://localhost:8787/admin/episodes/{id}/upload`
    Expected Result: HTTP 200 with JSON { ok: true, path: "..." }
    Evidence: .sisyphus/evidence/task-2-upload.json

  Scenario: File retrieval
    Tool: Bash (curl)
    Steps:
      1. Upload test file
      2. Run `curl -I http://localhost:8787/uploads/{podcast_id}/{episode_id}/source.mp3`
    Expected Result: HTTP 200 with Content-Type: audio/mpeg
    Evidence: .sisyphus/evidence/task-2-retrieve.txt
  ```

  **Commit:** YES
  - Message: `feat(storage): add local file upload and retrieval`
  - Files: `backend/src/storage.ts`, `backend/uploads/`

- [ ] 3. FFmpeg Transcoding Service

  **What to do:**
  - Create transcoding queue using BullMQ or simple queue
  - Implement FFmpeg processing:
    - Normalize loudness to -16 LUFS
    - Generate HLS with 6-second segments (keep current)
    - AES-128 encryption (keep current)
    - Extract duration metadata
  - Store HLS files in episode directory
  - Update episode status: pending → processing → ready
  - Add progress tracking (optional)
  - Handle FFmpeg errors gracefully

  **Must NOT do:**
  - Don't change segment duration from 6 seconds (keep current compatibility)
  - Don't add multiple quality levels yet (out of scope)

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 1, 2)
  - **Depends On:** Task 2 (file storage ready)
  - **Blocks:** Task 5

  **References:**
  - `scripts/prepare-hls.sh` - Current manual transcoding script
  - Current HLS structure in `media/hls/`
  - FFmpeg HLS documentation

  **Acceptance Criteria:**
  - [ ] Uploaded MP3 gets transcoded automatically
  - [ ] HLS files generated with correct structure
  - [ ] Episode duration extracted and stored

  **QA Scenarios:**

  ```
  Scenario: Transcode uploaded file
    Tool: Bash
    Steps:
      1. Upload test MP3
      2. Wait for processing (poll status endpoint or check filesystem)
      3. List HLS directory: `ls backend/uploads/{podcast_id}/{episode_id}/hls/`
    Expected Result: Contains playlist.m3u8, enc.key, segment_*.ts
    Evidence: .sisyphus/evidence/task-3-transcode.txt

  Scenario: Duration extraction
    Tool: Bash (sqlite3)
    Steps:
      1. Query DB: `sqlite3 backend/data/podcast.db "SELECT duration FROM episodes WHERE id='{episode_id}'"`
    Expected Result: Returns duration in seconds (e.g., 252)
    Evidence: .sisyphus/evidence/task-3-duration.txt
  ```

  **Commit:** YES
  - Message: `feat(transcode): add FFmpeg HLS generation service`
  - Files: `backend/src/transcode.ts`, `backend/src/queue.ts`

---

### Wave 2: Core Features

- [ ] 4. Admin API - Podcast CRUD

  **What to do:**
  - Implement POST /admin/podcasts - Create podcast
  - Implement GET /admin/podcasts - List all podcasts
  - Implement GET /admin/podcasts/:id - Get podcast details
  - Implement PUT /admin/podcasts/:id - Update podcast
  - Implement DELETE /admin/podcasts/:id - Delete podcast (cascade delete episodes)
  - Add validation (title required, max length)
  - Add simple API key auth (single key in env var)

  **Must NOT do:**
  - Don't add complex auth (OAuth, etc.)
  - Don't add image upload for artwork yet

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 5, 6, 7)
  - **Depends On:** Task 1
  - **Blocks:** None (parallel with others)

  **References:**
  - `backend/src/index.ts:165-187` - Example endpoint structure
  - Current in-memory data structures for reference

  **Acceptance Criteria:**
  - [ ] Can CRUD podcasts via API
  - [ ] API key authentication works
  - [ ] Validation returns proper error messages

  **QA Scenarios:**

  ```
  Scenario: Create podcast
    Tool: Bash (curl)
    Steps:
      1. Run `curl -X POST http://localhost:8787/admin/podcasts \
         -H "Authorization: Bearer {API_KEY}" \
         -H "Content-Type: application/json" \
         -d '{"title":"My Podcast","description":"A test podcast"}'`
    Expected Result: HTTP 200 with { ok: true, podcast: { id, title, ... } }
    Evidence: .sisyphus/evidence/task-4-create.json

  Scenario: List podcasts
    Tool: Bash (curl)
    Steps:
      1. Run `curl http://localhost:8787/admin/podcasts -H "Authorization: Bearer {API_KEY}"`
    Expected Result: HTTP 200 with array of podcasts
    Evidence: .sisyphus/evidence/task-4-list.json
  ```

  **Commit:** YES (group with Task 5)

- [ ] 5. Admin API - Episode CRUD with File Upload

  **What to do:**
  - Implement POST /admin/episodes - Create episode (metadata only, status=draft)
  - Implement POST /admin/episodes/:id/upload - Upload audio file (triggers transcoding)
  - Implement GET /admin/episodes - List episodes for a podcast
  - Implement GET /admin/episodes/:id - Get episode details
  - Implement PUT /admin/episodes/:id - Update metadata
  - Implement DELETE /admin/episodes/:id - Delete episode and files
  - Implement POST /admin/episodes/:id/publish - Set status=published
  - Set default price_per_second from env var
  - Allow custom price_per_second per episode

  **Must NOT do:**
  - Don't allow editing published episodes (archive instead)
  - Don't support multiple file formats yet

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4, 6, 7)
  - **Depends On:** Tasks 1, 2, 3, 4
  - **Blocks:** Task 6

  **References:**
  - Task 2 (storage service)
  - Task 3 (transcoding service)
  - Task 4 (podcast endpoints)

  **Acceptance Criteria:**
  - [ ] Can create episode metadata
  - [ ] Can upload audio file which triggers transcoding
  - [ ] Can publish episode
  - [ ] Episode status workflow works (draft → processing → ready → published)

  **QA Scenarios:**

  ```
  Scenario: Full episode workflow
    Tool: Bash (curl) + sqlite3
    Steps:
      1. Create podcast → get podcast_id
      2. Create episode → get episode_id (status=draft)
      3. Upload audio file → triggers transcoding
      4. Poll until status=ready
      5. Publish episode
      6. Query DB: `SELECT status FROM episodes WHERE id='{episode_id}'`
    Expected Result: Status is 'published'
    Evidence: .sisyphus/evidence/task-5-workflow.txt
  ```

  **Commit:** YES (group with Task 4)

- [ ] 6. Modify Payment Flow for Multi-Episode

  **What to do:**
  - Update POST /sessions/create to accept episode_id parameter
  - Store episode_id in stream_sessions table
  - Update POST /invoices/create to use episode's price_per_second (not global)
  - Update payment flow to reference correct episode's HLS files
  - Modify GET /stream/hls/:fileName to:
    - Look up episode from session
    - Serve correct HLS files from episode's directory
  - Update all payment endpoints to work with episode-specific data

  **Must NOT do:**
  - Don't change the core payment logic (hold invoices, settling)
  - Don't support multiple episodes per session

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4, 7)
  - **Depends On:** Task 5 (episodes exist)
  - **Blocks:** Task 7

  **References:**
  - `backend/src/index.ts:189-224` - Current /sessions/create
  - `backend/src/index.ts:226-312` - Current /invoices/create
  - `backend/src/index.ts:314-444` - Current /invoices/claim
  - `backend/src/index.ts:446-489` - Current /stream/hls/:fileName

  **Acceptance Criteria:**
  - [ ] Sessions are tied to specific episodes
  - [ ] Invoices use episode-specific pricing
  - [ ] Stream endpoint serves correct HLS files

  **QA Scenarios:**

  ```
  Scenario: Episode-specific session
    Tool: Bash (curl)
    Steps:
      1. Create and publish episode A (price: 10000 shannon/sec)
      2. Create and publish episode B (price: 20000 shannon/sec)
      3. Create session for episode A: `curl -X POST .../sessions/create -d '{"episode_id":"A"}'`
      4. Create invoice: check that amount = 10000 * requested_seconds
    Expected Result: Invoice amount matches episode A's pricing
    Evidence: .sisyphus/evidence/task-6-pricing.json

  Scenario: Stream correct episode
    Tool: Bash (curl)
    Steps:
      1. Complete payment flow for episode B
      2. Get stream URL from claim response
      3. Request playlist.m3u8 with token
    Expected Result: Playlist references episode B's segment files
    Evidence: .sisyphus/evidence/task-6-stream.txt
  ```

  **Commit:** YES
  - Message: `feat(payment): support episode-specific pricing and streaming`

- [ ] 7. Payment Session Persistence in Database

  **What to do:**
  - Replace in-memory Maps with database queries:
    - holdInvoices → payments table
    - sessions → stream_sessions table
    - streamGrants → stream_sessions table
  - Update payment flow to read/write from database
  - Add database cleanup for expired sessions (optional cron)
  - Ensure data survives backend restart
  - Keep in-memory cache for performance (optional)

  **Must NOT do:**
  - Don't remove the concurrency guards (claimInFlight)
  - Don't change payment logic, just storage layer

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4)
  - **Depends On:** Tasks 1, 6
  - **Blocks:** None

  **References:**
  - Task 1 (database schema)
  - Task 6 (modified payment flow)
  - Current in-memory Map usage in index.ts

  **Acceptance Criteria:**
  - [ ] Payment sessions persist in database
  - [ ] Restarting backend doesn't lose active sessions
  - [ ] Database queries perform well

  **QA Scenarios:**

  ```
  Scenario: Persistence across restart
    Tool: Bash (curl) + restart
    Steps:
      1. Create session and invoice
      2. Note session_id and payment_hash
      3. Restart backend
      4. Query session: `curl http://localhost:8787/admin/sessions/{session_id}`
      5. Check database directly
    Expected Result: Session data still exists and is retrievable
    Evidence: .sisyphus/evidence/task-7-persistence.txt
  ```

  **Commit:** YES
  - Message: `refactor(payment): persist sessions and payments in SQLite`

---

### Wave 3: Frontend Integration

- [ ] 8. Episode List API Endpoint

  **What to do:**
  - Implement GET /api/podcasts - List all published podcasts
  - Implement GET /api/podcasts/:id/episodes - List published episodes for a podcast
  - Implement GET /api/episodes/:id - Get episode details (for player)
  - Include metadata: title, description, duration, price_per_second
  - Include HLS playlist URL (without token - frontend will get that)
  - No authentication required (public endpoints)
  - Add caching headers (5 min cache)

  **Must NOT do:**
  - Don't expose internal paths
  - Don't include draft/unpublished episodes

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 9, 10)
  - **Depends On:** Tasks 4, 5
  - **Blocks:** Task 9

  **References:**
  - Current GET /node-info endpoint
  - Task 5 (episode data structure)

  **Acceptance Criteria:**
  - [ ] Public API returns podcast/episode lists
  - [ ] No auth required for public endpoints
  - [ ] Only published content returned

  **QA Scenarios:**

  ```
  Scenario: List published podcasts
    Tool: Bash (curl)
    Steps:
      1. Create podcast with published episode
      2. Create podcast with draft episode only
      3. Run `curl http://localhost:8787/api/podcasts`
    Expected Result: Only first podcast appears in list
    Evidence: .sisyphus/evidence/task-8-list.json

  Scenario: Get episode details
    Tool: Bash (curl)
    Steps:
      1. Run `curl http://localhost:8787/api/episodes/{episode_id}`
    Expected Result: Returns episode metadata with duration, price, etc.
    Evidence: .sisyphus/evidence/task-8-details.json
  ```

  **Commit:** YES (group with Task 9)

- [ ] 9. Frontend Episode Browser Component

  **What to do:**
  - Create PodcastList component
  - Create EpisodeList component
  - Add episode selection UI
  - Fetch podcasts from GET /api/podcasts
  - Fetch episodes from GET /api/podcasts/:id/episodes
  - Display episode cards with title, duration, price
  - Add loading and error states
  - Style with Tailwind (match existing design)

  **Must NOT do:**
  - Don't add complex filtering yet
  - Don't add artwork/images yet (text only for MVP)

  **Recommended Agent Profile:**
  - **Category:** `visual-engineering`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 8)
  - **Depends On:** Task 8
  - **Blocks:** Task 10

  **References:**
  - Current AudioPlayer component
  - Existing Tailwind styling patterns
  - Current frontend hooks (use-fiber-node, etc.)

  **Acceptance Criteria:**
  - [ ] Frontend displays list of podcasts
  - [ ] Clicking podcast shows episodes
  - [ ] Clicking episode selects it for playback

  **QA Scenarios:**

  ```
  Scenario: Browse and select episode
    Tool: Playwright
    Preconditions: Backend running with at least 1 podcast and 2 episodes
    Steps:
      1. Navigate to app
      2. Wait for podcast list to load
      3. Click on first podcast
      4. Wait for episode list
      5. Click on second episode
    Expected Result: Player shows selected episode title and is ready to play
    Evidence: .sisyphus/evidence/task-9-browser.png
  ```

  **Commit:** YES (group with Task 8)

- [ ] 10. Update Player to Work with Dynamic Episodes

  **What to do:**
  - Modify AudioPlayer to accept episode data from props (not hardcoded)
  - Update page.tsx to manage selected episode state
  - Pass episode_id to payment.start() call
  - Update use-streaming-payment hook to:
    - Accept episode_id parameter
    - Include episode_id in session creation API call
    - Handle episode-specific pricing
  - Update playback source when episode changes
  - Handle episode switching (stop current, start new)

  **Must NOT do:**
  - Don't change the core payment logic
  - Don't break single-episode playback

  **Recommended Agent Profile:**
  - **Category:** `visual-engineering`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 9)
  - **Depends On:** Tasks 6, 8, 9
  - **Blocks:** None

  **References:**
  - `src/components/AudioPlayer.tsx` - Current hardcoded episode
  - `src/hooks/use-streaming-payment.ts` - Payment hook
  - `src/app/page.tsx` - Main page
  - Task 6 (episode-aware payment flow)

  **Acceptance Criteria:**
  - [ ] Player works with any selected episode
  - [ ] Payment flow uses correct episode_id
  - [ ] Switching episodes works correctly

  **QA Scenarios:**

  ```
  Scenario: Play different episodes
    Tool: Playwright
    Preconditions: Backend with 2+ published episodes
    Steps:
      1. Select episode A, click play
      2. Listen for 5 seconds (payment sent)
      3. Pause, select episode B
      4. Click play on episode B
      5. Verify new session created for episode B
    Expected Result: Episode B plays, new payment session started
    Evidence: .sisyphus/evidence/task-10-switch.mp4
  ```

  **Commit:** YES
  - Message: `feat(frontend): dynamic episode selection and playback`

- [ ] 11. Admin UI (Minimal)

  **What to do:**
  - Create simple admin page at /admin
  - Add form to create new podcast
  - Add form to upload episode (drag-and-drop file)
  - Show list of episodes with status
  - Add "Publish" button for ready episodes
  - Add basic API key input (localStorage)
  - Keep it minimal - functional but not polished

  **Must NOT do:**
  - Don't build full CMS (just basic CRUD)
  - Don't add rich text editor

  **Recommended Agent Profile:**
  - **Category:** `visual-engineering`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 10)
  - **Depends On:** Tasks 4, 5
  - **Blocks:** None (optional task)

  **References:**
  - Admin API endpoints from Tasks 4-5
  - Existing form patterns in codebase

  **Acceptance Criteria:**
  - [ ] Admin can create podcast via UI
  - [ ] Admin can upload episode via UI
  - [ ] Admin can publish episodes

  **QA Scenarios:**

  ```
  Scenario: Full admin workflow
    Tool: Playwright
    Steps:
      1. Go to /admin
      2. Enter API key
      3. Create podcast
      4. Upload episode file
      5. Wait for processing
      6. Publish episode
      7. Verify appears in public API
    Expected Result: Episode is live and playable
    Evidence: .sisyphus/evidence/task-11-admin.mp4
  ```

  **Commit:** YES (optional - can skip if API-only is sufficient)

---

### Wave 4: Testing & Polish

- [ ] 12. Database Migration System

  **What to do:**
  - Add migration framework (or simple script-based migrations)
  - Create migration files for schema changes
  - Add migration command: `pnpm db:migrate`
  - Handle schema versioning
  - Add rollback capability (optional)
  - Document migration process

  **Must NOT do:**
  - Don't use complex ORM migration tools
  - Don't break existing data on migrate

  **Recommended Agent Profile:**
  - **Category:** `quick`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 13, 14, 15)
  - **Depends On:** Task 1

  **Acceptance Criteria:**
  - [ ] Migrations run on startup
  - [ ] Schema changes don't lose data
  - [ ] Migration status can be checked

  **QA Scenarios:**

  ```
  Scenario: Run migrations
    Tool: Bash
    Steps:
      1. Delete database file
      2. Start backend
      3. Check tables exist: `sqlite3 backend/data/podcast.db ".tables"`
    Expected Result: All tables created via migrations
    Evidence: .sisyphus/evidence/task-12-migrate.txt
  ```

  **Commit:** YES

- [ ] 13. Error Handling and Validation

  **What to do:**
  - Add input validation to all endpoints (Zod)
  - Add consistent error responses
  - Add proper HTTP status codes
  - Add error logging
  - Handle edge cases:
    - Episode not found
    - File upload too large
    - FFmpeg failure
    - Database connection lost
  - Return helpful error messages

  **Must NOT do:**
  - Don't expose internal errors to client
  - Don't crash backend on errors

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 12, 14, 15)
  - **Depends On:** All previous tasks

  **Acceptance Criteria:**
  - [ ] All inputs validated
  - [ ] Errors handled gracefully
  - [ ] Consistent error format

  **QA Scenarios:**

  ```
  Scenario: Invalid input
    Tool: Bash (curl)
    Steps:
      1. POST /admin/podcasts with empty title
      2. POST /admin/episodes with invalid episode_id
    Expected Result: HTTP 400 with descriptive error message
    Evidence: .sisyphus/evidence/task-13-errors.json
  ```

  **Commit:** YES

- [ ] 14. API Documentation

  **What to do:**
  - Create API.md documenting all endpoints
  - Include request/response examples
  - Document authentication
  - Document error codes
  - Include curl examples
  - Document file upload process

  **Must NOT do:**
  - Don't use OpenAPI/Swagger (keep it simple)
  - Don't over-document

  **Recommended Agent Profile:**
  - **Category:** `writing`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 12, 13, 15)
  - **Depends On:** All API endpoints complete

  **Acceptance Criteria:**
  - [ ] All endpoints documented
  - [ ] Examples are copy-pasteable
  - [ ] Auth process explained

  **QA Scenarios:**

  ```
  Scenario: Follow documentation
    Tool: Manual (Claude)
    Steps:
      1. Read API.md
      2. Follow examples to create podcast and episode
    Expected Result: Successfully complete workflow using only docs
    Evidence: .sisyphus/evidence/task-14-docs-verified.txt
  ```

  **Commit:** YES
  - Files: `backend/API.md`

- [ ] 15. End-to-End Integration Tests

  **What to do:**
  - Create test script that exercises full workflow:
    1. Create podcast
    2. Create episode
    3. Upload audio
    4. Wait for processing
    5. Publish episode
    6. Fetch episode list (public API)
    7. Create payment session
    8. Create and settle invoice
    9. Verify streaming works
  - Use bun test framework
  - Clean up test data after
  - Test error cases too

  **Must NOT do:**
  - Don't test UI (focus on API)
  - Don't require real Fiber node (mock if needed)

  **Recommended Agent Profile:**
  - **Category:** `deep`
  - **Skills:** None needed

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 12, 13, 14)
  - **Depends On:** All previous tasks

  **Acceptance Criteria:**
  - [ ] Test script runs successfully
  - [ ] All major workflows covered
  - [ ] Tests are deterministic

  **QA Scenarios:**

  ```
  Scenario: Full integration test
    Tool: Bash (bun test)
    Steps:
      1. Run `cd backend && bun test integration`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-15-test-results.txt
  ```

  **Commit:** YES
  - Files: `backend/src/__tests__/integration.test.ts`

---

## Final Verification Wave

After all tasks complete, run 4 verification agents in parallel:

- [ ] F1. **Plan Compliance Audit** - Verify all tasks completed, check deliverables
- [ ] F2. **Code Quality Review** - Check TypeScript, linting, error handling
- [ ] F3. **Real Manual QA** - Test full workflow end-to-end
- [ ] F4. **Documentation Review** - Verify API docs are complete and accurate

---

## Commit Strategy

**Group commits by wave:**

**Wave 1:** `feat(backend): add database, storage, and transcoding foundation`
- Tasks 1, 2, 3 combined

**Wave 2:** `feat(backend): admin API and multi-episode payment support`
- Tasks 4, 5, 6, 7 combined (or separate if large)

**Wave 3:** `feat(frontend): episode browser and dynamic playback`
- Tasks 8, 9, 10, 11 combined

**Wave 4:** `chore(backend): migrations, tests, and documentation`
- Tasks 12, 13, 14, 15 combined

---

## Success Criteria

### Verification Commands
```bash
# Database
sqlite3 backend/data/podcast.db ".tables"
# Expected: podcasts episodes stream_sessions payments

# API
curl http://localhost:8787/api/podcasts
# Expected: JSON array of podcasts

# Upload
curl -X POST -F "file=@test.mp3" http://localhost:8787/admin/episodes/{id}/upload
# Expected: { ok: true, path: "..." }

# Tests
cd backend && bun test
# Expected: All tests pass
```

### Final Checklist
- [ ] Can upload and manage multiple episodes
- [ ] Payment flow works for any episode
- [ ] Data persists after restart
- [ ] Frontend can browse and play episodes
- [ ] Admin can manage content via API
- [ ] Documentation is complete
- [ ] Integration tests pass

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────┐
│                     SELF-HOSTED BACKEND                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Hono API    │  │   SQLite     │  │   Local FS   │       │
│  │  Server      │  │   Database   │  │   Storage    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                   │                   │            │
│         └───────────────────┴───────────────────┘            │
│                         │                                    │
│  ┌──────────────────────┴──────────────────────┐            │
│  │           FFmpeg Transcoding Queue          │            │
│  └─────────────────────────────────────────────┘            │
│                                                              │
│  Endpoints:                                                  │
│  - POST /admin/podcasts (create)                             │
│  - POST /admin/episodes (create)                             │
│  - POST /admin/episodes/:id/upload                           │
│  - GET  /api/podcasts (public list)                          │
│  - GET  /api/episodes/:id (public details)                   │
│  - POST /sessions/create (with episode_id)                   │
│  - POST /invoices/create (episode-specific pricing)          │
│  - GET  /stream/hls/:file (episode-aware)                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Key Decisions:**
1. **SQLite** - Zero config, single file, perfect for self-hosted
2. **Local filesystem** - No external dependencies, simple backups
3. **Single creator** - No auth complexity, API key only for admin
4. **Anonymous listeners** - No user management needed
5. **Extend current flow** - Keep working payment logic, add episode awareness

---

**Estimated Total Effort:** 4-6 weeks (depending on familiarity with stack)

Ready to start work? Run `/start-work` and I'll execute this plan.
