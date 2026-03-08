

## Task 9: Podcast Browsing Components - Learnings (2026-03-07)

### Component Architecture
- Separated concerns: EpisodeCard (presentation), EpisodeList (data fetching), PodcastList (data fetching)
- Shared Episode interface exported from EpisodeCard for reuse
- Props follow consistent pattern: onSelect callback + optional selectedId

### Data Fetching Pattern
- useEffect with empty deps for initial load
- Separate loading, error, and success states
- Environment variable with fallback: process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:8787'
- Response validation: check data.ok and Array.isArray before setting state

### State Management Pattern
```typescript
const [data, setData] = useState<Data[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

### UI/UX Patterns
- Motion animations: staggered entry, hover scale, selection indicator
- Loading state: animated spinner with text
- Error state: red alert box with icon
- Empty state: centered icon + message
- Selected state: accent color border + left indicator line

### Styling Consistency
- Used existing fiber color palette from tailwind.config.js
- Dark theme: bg-fiber-surface, text-white/fiber-muted
- Accent: fiber-accent (#00ffa3) for highlights
- Rounded corners: rounded-xl for cards, rounded-lg for icons
- Monospace font for metadata: font-mono

### Helper Functions
- formatDuration(): converts seconds to "Xh Ym" or "Xm"
- Handles null gracefully with "Unknown duration"

### Export Pattern
- Episode and Podcast interfaces exported for parent components
- Components exported as named exports
- Type definitions available for page.tsx integration


## Task 10: Episode Browser Integration (2026-03-07)

### Patterns Used

1. **Component Composition Pattern**
   - Sidebar layout with conditional rendering (PodcastList vs EpisodeList)
   - AnimatePresence for smooth transitions between list views

2. **Data Transformation Pattern**
   - Created `toAudioPlayerEpisode()` helper to bridge different Episode interfaces
   - Backend Episode uses: snake_case, shannon pricing, seconds duration
   - AudioPlayer Episode uses: camelCase, CKB pricing, formatted duration string

3. **State Management Pattern**
   - Parent component (page.tsx) owns selection state
   - Passes callbacks to child components for selection events
   - Reset downstream state when upstream selection changes

### Key Technical Decisions

1. **Episode ID in Payment Flow**
   - Added episodeId parameter to payment.start() -> createSession()
   - Maintains backward compatibility (episodeId is optional)
   - Enables backend to track which episode is being streamed

2. **Layout Structure**
   - Used flex layout with fixed sidebar width (1/3, min/max constraints)
   - Main content area scrolls independently
   - Responsive design maintained within layout constraints

### Error Handling

- Empty state shown when no episode selected
- Backend error displayed in header
- All async operations wrapped in try/catch

## Task 12: Database Migration System (2026-03-07)

### Pattern: Migration System with better-sqlite3
- Use `db.transaction()` for atomic migration execution
- Store migration state in dedicated `migrations` table
- Use natural sort (localeCompare with numeric option) for file ordering
- Migration files use `IF NOT EXISTS` for idempotency
- Run migrations asynchronously on startup (non-blocking)

### Key Implementation Details
- better-sqlite3's `db.transaction()` provides automatic rollback on error
- Migration tracking uses filename as unique identifier
- Async file reading with `fs/promises` for migration discovery
- Existing schema init kept for backward compatibility with existing databases

### Migration Table Schema
```sql
CREATE TABLE migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);


## Task 13: Zod Input Validation (2026-03-07)

### Zod v4 API Changes
- ZodError uses `.issues` instead of `.errors` (v3 API)
- Type parameter: `z.ZodError['issues']` for accessing issue array type

### Validation Pattern for Hono
```typescript
const validation = await validateBody(c, schema)
if (!validation.success) {
  return c.json({ ok: false, error: validation.error }, 400)
}
const { field1, field2 } = validation.data
```

### File Upload Validation
- Check file type against allowed MIME types
- Check file size before processing
- Return early with descriptive error messages

### Request Size Limits
- Use middleware to check Content-Length header
- Different limits for JSON (10MB) vs uploads (500MB)
- Return 413 Payload Too Large for oversized requests

### Error Response Standardization
```typescript
interface ErrorResponse {
  ok: false
  error: string
  details?: z.ZodError['issues']
}
```
```

## Task 14: API Documentation

### Patterns Used
- Hono framework with TypeScript for API routes
- Zod validation schemas for request validation
- Bearer token authentication for admin endpoints
- Standardized response format: { ok: boolean, ...data }
- UUID-based resource identifiers
- Price stored as string for big integer handling (Shannon units)

### File Upload Handling
- Multipart/form-data for audio uploads
- 500MB limit enforced separately from JSON requests
- Streaming from buffer for efficient processing
- File type validation against allowed audio MIME types

### Streaming Flow
1. Create session with episodeId
2. Create invoice for desired seconds
3. Pay invoice through Fiber Network
4. Claim invoice to receive stream token
5. Use token to access HLS segments

### Episode Status State Machine
- draft -> processing -> ready -> published
- Published episodes are immutable
- Transcoding triggered automatically on upload

### Validation Constraints Summary
- Title: 1-255 characters
- Description: max 1000 characters
- Episode seconds: 1-3600 (for invoices)
- UUID format required for IDs
- Numeric string format for prices
