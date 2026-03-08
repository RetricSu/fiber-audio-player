import { beforeAll, afterAll, beforeEach } from 'vitest'
import { closeDb, getDb, initDb } from '../src/db.js'
import { StorageService } from '../src/storage.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Set test environment BEFORE any app imports happen
export const TEST_ADMIN_KEY = 'test-admin-key-' + randomUUID()
export const TEST_UPLOADS_DIR = path.join(__dirname, '..', 'test-uploads')

// Store original env values
const originalAdminKey = process.env.ADMIN_API_KEY
const originalUploadsDir = process.env.UPLOADS_DIR

// Set immediately at module load time (before app imports)
process.env.ADMIN_API_KEY = TEST_ADMIN_KEY
process.env.UPLOADS_DIR = TEST_UPLOADS_DIR

beforeAll(async () => {
  await initDb()
  await fs.mkdir(TEST_UPLOADS_DIR, { recursive: true })
})

beforeEach(async () => {
  // Clean up database tables before each test
  getDb().prepare('DELETE FROM payments').run()
  getDb().prepare('DELETE FROM stream_sessions').run()
  getDb().prepare('DELETE FROM episodes').run()
  getDb().prepare('DELETE FROM podcasts').run()
  
  // Clean up test uploads
  try {
    const files = await fs.readdir(TEST_UPLOADS_DIR)
    for (const file of files) {
      await fs.rm(path.join(TEST_UPLOADS_DIR, file), { recursive: true, force: true })
    }
  } catch {
    // Directory might not exist yet
  }
})

afterAll(async () => {
  // Restore original environment
  process.env.ADMIN_API_KEY = originalAdminKey
  process.env.UPLOADS_DIR = originalUploadsDir
  
  // Clean up test uploads directory
  try {
    await fs.rm(TEST_UPLOADS_DIR, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
  
  // Close database connection
  closeDb()
})

// Helper function to create a test podcast
export async function createTestPodcast(title: string, description?: string) {
  const id = randomUUID()
  const now = Date.now()
  
  getDb().prepare(`
    INSERT INTO podcasts (id, title, description, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, title, description ?? null, now)
  
  return { id, title, description, created_at: now }
}

// Helper function to create a test episode
export async function createTestEpisode(
  podcastId: string,
  title: string,
  options: {
    description?: string
    pricePerSecond?: bigint
    status?: string
    storagePath?: string
  } = {}
) {
  const id = randomUUID()
  const now = Date.now()
  const pricePerSecond = options.pricePerSecond ?? BigInt(10000)
  const status = options.status ?? 'published'
  const storagePath = options.storagePath ?? `uploads/${podcastId}/${id}/source.mp3`
  
  getDb().prepare(`
    INSERT INTO episodes (id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    podcastId,
    title,
    options.description ?? null,
    null,
    storagePath,
    pricePerSecond.toString(),
    status,
    now
  )
  
  return {
    id,
    podcast_id: podcastId,
    title,
    description: options.description ?? null,
    duration: null,
    storage_path: storagePath,
    price_per_second: pricePerSecond,
    status,
    created_at: now,
  }
}
