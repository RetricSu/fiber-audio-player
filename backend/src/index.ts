import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { blake2b } from '@noble/hashes/blake2.js'
import {
  FiberRpcClient,
  randomBytes32,
  toHex,
  type Currency,
} from '@fiber-pay/sdk'
import { getDb, initDb } from './db.js'
import { StorageService } from './storage.js'
import { transcodeService } from './transcode.js'
import {
  validateBody,
  validateAudioFile,
  createPodcastSchema,
  updatePodcastSchema,
  createEpisodeSchema,
  updateEpisodeSchema,
  createSessionSchema,
  createInvoiceSchema,
  claimInvoiceSchema,
} from './validation.js'

const app = new Hono()

// Request size limits
const MAX_JSON_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_UPLOAD_SIZE = 500 * 1024 * 1024 // 500MB

// Middleware to enforce body size limits
app.use('*', async (c, next) => {
  const contentLength = c.req.header('content-length')
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    const contentType = c.req.header('content-type') || ''
    
    // Check upload endpoints separately
    if (c.req.path.includes('/upload')) {
      if (size > MAX_UPLOAD_SIZE) {
        return c.json({ ok: false, error: `Request body too large. Max: 500MB` }, 413)
      }
    } else if (size > MAX_JSON_SIZE) {
      return c.json({ ok: false, error: `Request body too large. Max: 10MB` }, 413)
    }
  }
  await next()
})

app.use('*', cors())

// ---------------------------------------------------------------------------
// Fiber RPC client — connected to the developer / content-owner Fiber node
// ---------------------------------------------------------------------------
const FIBER_RPC_URL = process.env.FIBER_RPC_URL || 'http://127.0.0.1:8227'
const PRICE_PER_SECOND_SHANNON = BigInt(process.env.PRICE_PER_SECOND_SHANNON ?? '10000') // 0.0001 CKB
const INVOICE_CURRENCY = (process.env.INVOICE_CURRENCY ?? 'Fibd') as Currency
const INVOICE_EXPIRY_SEC = Number(process.env.INVOICE_EXPIRY_SEC ?? 600)
type InvoiceHashAlgorithm = 'ckb_hash' | 'sha256'

function resolveInvoiceHashAlgorithm(value: string | undefined): InvoiceHashAlgorithm {
  // NOTE(retricsu/fiber-pay#66): SDK type currently exposes `CkbHash | Sha256`,
  // while FNN RPC expects `ckb_hash | sha256`. We normalize here to the RPC
  // wire values so both env styles keep working.
  const normalized = (value ?? 'CkbHash').trim().toLowerCase()
  if (normalized === 'sha256') {
    return 'sha256'
  }
  return 'ckb_hash'
}

const INVOICE_HASH_ALGORITHM = resolveInvoiceHashAlgorithm(process.env.INVOICE_HASH_ALGORITHM)

const fiberClient = new FiberRpcClient({ url: FIBER_RPC_URL, timeout: 15_000 })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type HoldInvoice = {
  paymentHash: string
  preimage: string
  invoiceAddress: string
  amountShannon: bigint
  grantedSeconds: number
  sessionId: string
  createdAt: number
  settled: boolean
}

type ClaimSuccessPayload = {
  ok: true
  stream: {
    token: string
    expiresAt: number
    grantedSeconds: number
    segmentDurationSec: number
    maxSegmentIndex: number
    playlistUrl: string
  }
}

type StreamSession = {
  id: string
  episodeId: string
  streamToken: string
  totalPaidSeconds: number
  maxSegmentIndex: number
  expiresAt: number
  createdAt: number
}

type StreamGrant = {
  token: string
  expiresAt: number
  maxSegmentIndex: number
  sessionId: string
}

// Concurrency guard for claim operations (in-memory only, not for persistence)
const claimInFlight = new Map<string, Promise<ClaimSuccessPayload>>()

// Database helper functions for stream_sessions
function insertStreamSession(session: StreamSession): void {
  getDb().prepare(`
    INSERT INTO stream_sessions (id, episode_id, stream_token, total_paid_seconds, max_segment_index, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    session.episodeId,
    session.streamToken,
    session.totalPaidSeconds,
    session.maxSegmentIndex,
    session.expiresAt,
    session.createdAt
  )
}

function getStreamSessionById(sessionId: string): StreamSession | undefined {
  const row = getDb().prepare('SELECT * FROM stream_sessions WHERE id = ?').get(sessionId) as {
    id: string
    episode_id: string
    stream_token: string
    total_paid_seconds: number
    max_segment_index: number
    expires_at: number
    created_at: number
  } | undefined
  
  if (!row) return undefined
  
  return {
    id: row.id,
    episodeId: row.episode_id,
    streamToken: row.stream_token,
    totalPaidSeconds: row.total_paid_seconds,
    maxSegmentIndex: row.max_segment_index,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

function getStreamSessionByToken(streamToken: string): StreamSession | undefined {
  const row = getDb().prepare('SELECT * FROM stream_sessions WHERE stream_token = ?').get(streamToken) as {
    id: string
    episode_id: string
    stream_token: string
    total_paid_seconds: number
    max_segment_index: number
    expires_at: number
    created_at: number
  } | undefined
  
  if (!row) return undefined
  
  return {
    id: row.id,
    episodeId: row.episode_id,
    streamToken: row.stream_token,
    totalPaidSeconds: row.total_paid_seconds,
    maxSegmentIndex: row.max_segment_index,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

function updateStreamSession(session: StreamSession): void {
  getDb().prepare(`
    UPDATE stream_sessions 
    SET total_paid_seconds = ?, max_segment_index = ?, expires_at = ?
    WHERE id = ?
  `).run(
    session.totalPaidSeconds,
    session.maxSegmentIndex,
    session.expiresAt,
    session.id
  )
}

// Database helper functions for payments
function insertPayment(payment: HoldInvoice): void {
  getDb().prepare(`
    INSERT INTO payments (id, session_id, payment_hash, preimage, amount_shannon, granted_seconds, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    payment.sessionId,
    payment.paymentHash,
    payment.preimage,
    payment.amountShannon.toString(),
    payment.grantedSeconds,
    payment.settled ? 'settled' : 'pending',
    payment.createdAt
  )
}

function getPaymentByHash(paymentHash: string): HoldInvoice | undefined {
  const row = getDb().prepare('SELECT * FROM payments WHERE payment_hash = ?').get(paymentHash) as {
    id: string
    session_id: string
    payment_hash: string
    preimage: string
    amount_shannon: string
    granted_seconds: number
    status: string
    created_at: number
    settled_at: number | null
  } | undefined
  
  if (!row) return undefined
  
  return {
    paymentHash: row.payment_hash,
    preimage: row.preimage,
    invoiceAddress: '', // Not stored in DB, will be returned from API
    amountShannon: BigInt(row.amount_shannon),
    grantedSeconds: row.granted_seconds,
    sessionId: row.session_id,
    createdAt: row.created_at,
    settled: row.status === 'settled',
  }
}

function updatePaymentAsSettled(paymentHash: string): void {
  getDb().prepare(`
    UPDATE payments 
    SET status = ?, settled_at = ?, preimage = preimage
    WHERE payment_hash = ?
  `).run('settled', Date.now(), paymentHash)
}

// CKB blake2b-256 with personalization "ckb-default-hash"
const CKB_HASH_PERSONALIZATION = Uint8Array.from(
  Buffer.from('ckb-default-hash'),
)
function ckbHash(data: Uint8Array): Uint8Array {
  return blake2b(data, { dkLen: 32, personalization: CKB_HASH_PERSONALIZATION })
}

function derivePaymentHash(preimageBytes: Uint8Array, algorithm: InvoiceHashAlgorithm): string {
  if (algorithm === 'sha256') {
    const digest = createHash('sha256').update(Buffer.from(preimageBytes)).digest('hex')
    return `0x${digest}`
  }

  const hashBytes = ckbHash(preimageBytes)
  return `0x${Buffer.from(hashBytes).toString('hex')}`
}

const segmentDurationSec = Number(process.env.HLS_SEGMENT_DURATION_SEC ?? 6)
const DEFAULT_PRICE_PER_SECOND = BigInt(process.env.DEFAULT_PRICE_PER_SECOND ?? '10000')
const authTtlSec = Number(process.env.STREAM_AUTH_TTL_SEC ?? 300)

// Resolve media path relative to backend root so runtime CWD (systemd, pnpm, etc.)
// does not affect where HLS assets are loaded from.
const currentFilePath = fileURLToPath(import.meta.url)
const backendRootDir = path.resolve(path.dirname(currentFilePath), '..')
const hlsDirFromEnv = process.env.HLS_DIR?.trim()
const hlsDir = hlsDirFromEnv
  ? (path.isAbsolute(hlsDirFromEnv)
      ? path.normalize(hlsDirFromEnv)
      : path.resolve(backendRootDir, hlsDirFromEnv))
  : path.resolve(backendRootDir, '../media/hls')

function toSegmentIndex(seconds: number): number {
  return Math.max(0, Math.ceil(seconds / segmentDurationSec) - 1)
}

function parseSegmentIndex(fileName: string): number | null {
  const match = fileName.match(/segment_(\d+)\.ts$/)
  if (!match) {
    return null
  }
  return Number(match[1])
}

function contentType(fileName: string): string {
  if (fileName.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl'
  if (fileName.endsWith('.ts')) return 'video/mp2t'
  if (fileName.endsWith('.key')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function appendTokenToUri(uri: string, token: string): string {
  const separator = uri.includes('?') ? '&' : '?'
  return `${uri}${separator}token=${encodeURIComponent(token)}`
}

function rewritePlaylistWithToken(content: string, token: string): string {
  const lines = content.split(/\r?\n/)
  return lines
    .map((line) => {
      if (line.startsWith('#EXT-X-KEY:')) {
        return line.replace(/URI="([^"]+)"/, (_match, uri) => `URI="${appendTokenToUri(uri, token)}"`)
      }

      if (line.length === 0 || line.startsWith('#')) {
        return line
      }

      return appendTokenToUri(line, token)
    })
    .join('\n')
}

app.get('/healthz', (c) => c.json({ ok: true, service: 'fiber-audio-backend' }))

// ---------------------------------------------------------------------------
// GET /node-info — expose the backend Fiber node's pubkey so the frontend knows
// who to route payments to.
// ---------------------------------------------------------------------------
app.get('/node-info', async (c) => {
  try {
    const info = await fiberClient.nodeInfo()
    return c.json({
      ok: true,
      node: {
        nodeName: info.node_name,
        nodeId: info.node_id,
        addresses: info.addresses,
        openChannelAutoAcceptMin: info.open_channel_auto_accept_min_ckb_funding_amount,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Fiber node'
    return c.json({ ok: false, error: message }, 502)
  }
})

// ---------------------------------------------------------------------------
// POST /sessions/create — start a new streaming session.
// Body: { episodeId: string }
// Returns a sessionId and the initial (empty) stream token.
// ---------------------------------------------------------------------------
app.post('/sessions/create', async (c) => {
  const validation = await validateBody(c, createSessionSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { episodeId } = validation.data

  try {
    const episode = getDb().prepare(`
      SELECT id, price_per_second, status
      FROM episodes
      WHERE id = ?
    `).get(episodeId) as {
      id: string
      price_per_second: number
      status: string
    } | undefined

    if (!episode) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    if (episode.status !== 'published') {
      return c.json({ ok: false, error: `Episode is not published (status: ${episode.status})` }, 400)
    }

    const sessionId = randomUUID()
    const streamToken = randomUUID()
    const expiresAt = Date.now() + authTtlSec * 1000

    const session: StreamSession = {
      id: sessionId,
      episodeId,
      streamToken,
      totalPaidSeconds: 0,
      maxSegmentIndex: -1, // no segments unlocked yet
      expiresAt,
      createdAt: Date.now(),
    }
    insertStreamSession(session)

    return c.json({
      ok: true,
      session: {
        sessionId,
        episodeId,
        pricePerSecondShannon: episode.price_per_second.toString(),
        segmentDurationSec,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create session'
    return c.json({ ok: false, error: message }, 500)
  }
})

// ---------------------------------------------------------------------------
// POST /invoices/create — create a hold invoice for N seconds of streaming.
// Body: { sessionId: string, seconds: number }
// Returns: { invoiceAddress, paymentHash, amountShannon, seconds }
// ---------------------------------------------------------------------------
app.post('/invoices/create', async (c) => {
  const validation = await validateBody(c, createInvoiceSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { sessionId, seconds: requestedSeconds } = validation.data
  const session = getStreamSessionById(sessionId)
  if (!session) {
    return c.json({ ok: false, error: 'Invalid sessionId' }, 400)
  }

  // Get episode to use its price_per_second
  const episode = getDb().prepare(`
    SELECT price_per_second
    FROM episodes
    WHERE id = ?
  `).get(session.episodeId) as { price_per_second: number } | undefined

  if (!episode) {
    return c.json({ ok: false, error: 'Episode not found for this session' }, 404)
  }

  const seconds = requestedSeconds ?? 30
  const pricePerSecond = BigInt(episode.price_per_second)
  const amountShannon = pricePerSecond * BigInt(seconds)

  // Generate preimage and derive payment_hash using configured algorithm
  const preimage = randomBytes32() as string
  const preimageBytes = Uint8Array.from(
    Buffer.from(preimage.replace(/^0x/, ''), 'hex'),
  )
  const paymentHash = derivePaymentHash(preimageBytes, INVOICE_HASH_ALGORITHM)

  console.log(`[invoice/create] sessionId=${sessionId} seconds=${seconds} hashAlgorithm=${INVOICE_HASH_ALGORITHM} paymentHash=${paymentHash}`)

  try {
    const invoiceParams: Parameters<typeof fiberClient.newInvoice>[0] = {
      amount: toHex(amountShannon) as `0x${string}`,
      currency: INVOICE_CURRENCY,
      payment_hash: paymentHash as `0x${string}`,
      description: `Audio stream: ${seconds}s`,
      expiry: toHex(BigInt(INVOICE_EXPIRY_SEC)) as `0x${string}`,
    }

    // Compatibility: older nodes may reject unknown params.
    // For default CkbHash, omitting hash_algorithm keeps backward compatibility.
    if (INVOICE_HASH_ALGORITHM !== 'ckb_hash') {
      // NOTE(retricsu/fiber-pay#66): keep this bridge cast until SDK hash
      // algorithm values are aligned with FNN RPC wire enum names.
      ;(invoiceParams as unknown as { hash_algorithm?: string }).hash_algorithm = INVOICE_HASH_ALGORITHM
    }

    const result = await fiberClient.newInvoice(invoiceParams)

    const holdInvoice: HoldInvoice = {
      paymentHash,
      preimage,
      invoiceAddress: result.invoice_address,
      amountShannon,
      grantedSeconds: seconds,
      sessionId,
      createdAt: Date.now(),
      settled: false,
    }
    insertPayment(holdInvoice)

    return c.json({
      ok: true,
      invoice: {
        invoiceAddress: result.invoice_address,
        paymentHash,
        amountShannon: toHex(amountShannon),
        seconds,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice'
    if (
      INVOICE_HASH_ALGORITHM === 'sha256' &&
      /Invalid params/i.test(message)
    ) {
      return c.json(
        {
          ok: false,
          error:
            'FNN does not support new_invoice.hash_algorithm=Sha256 on this version. ' +
            'Upgrade Fiber node to v0.7.1+ or set INVOICE_HASH_ALGORITHM=CkbHash.',
        },
        500,
      )
    }
    return c.json({ ok: false, error: message }, 500)
  }
})

// ---------------------------------------------------------------------------
// POST /invoices/claim — verify payment received, settle invoice, unlock segments.
// Body: { paymentHash: string }
// The endpoint polls the Fiber node for up to 60 seconds waiting for "Received".
// Returns the stream token and updated grant info.
// ---------------------------------------------------------------------------
app.post('/invoices/claim', async (c) => {
  const validation = await validateBody(c, claimInvoiceSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { paymentHash } = validation.data
  const hold = getPaymentByHash(paymentHash)
  if (!hold) {
    return c.json({ ok: false, error: 'Unknown payment hash' }, 400)
  }

  const session = getStreamSessionById(hold.sessionId)
  if (!session) {
    return c.json({ ok: false, error: 'Session expired' }, 400)
  }

  const buildStreamPayload = (): ClaimSuccessPayload => ({
    ok: true,
    stream: {
      token: session.streamToken,
      expiresAt: session.expiresAt,
      grantedSeconds: session.totalPaidSeconds,
      segmentDurationSec,
      maxSegmentIndex: session.maxSegmentIndex,
      playlistUrl: `/stream/hls/playlist.m3u8?token=${session.streamToken}`,
    },
  })

  // Idempotency: if already settled, return current grant state instead of erroring.
  if (hold.settled) {
    return c.json(buildStreamPayload())
  }

  // Concurrency guard: dedupe concurrent claims for the same payment hash.
  const existingClaim = claimInFlight.get(paymentHash)
  if (existingClaim) {
    const payload = await existingClaim
    return c.json(payload)
  }

  const claimPromise = (async (): Promise<ClaimSuccessPayload> => {
    // Hold invoice: wait for payment to arrive ("Received"), then settle with preimage
    console.log(`[invoice/claim] waiting for Received... paymentHash=${paymentHash}`)
    const t0 = Date.now()
    const invoiceResult = await fiberClient.waitForInvoiceStatus(
      paymentHash as `0x${string}`,
      'Received',
      { timeout: 60_000, interval: 200 },
    )
    console.log(`[invoice/claim] got status=${invoiceResult.status} after ${Date.now() - t0}ms paymentHash=${paymentHash}`)

    if (invoiceResult.status !== 'Received') {
      throw new Error(
        `Unexpected invoice status: ${invoiceResult.status}`,
      )
    }

    // Another request may have completed while this one was waiting.
    if (hold.settled) {
      return buildStreamPayload()
    }

    // Settle the hold invoice — release the preimage so the payer's node completes
    console.log(`[invoice/claim] calling settleInvoice... paymentHash=${paymentHash}`)
    const t1 = Date.now()
    await fiberClient.settleInvoice({
      payment_hash: paymentHash as `0x${string}`,
      payment_preimage: hold.preimage as `0x${string}`,
    })
    console.log(`[invoice/claim] settleInvoice returned after ${Date.now() - t1}ms paymentHash=${paymentHash}`)

    // Verify the invoice actually reached "Paid" (TLC settled successfully).
    // settleInvoice only hands the preimage to the node; TLC settlement is async.
    // If the TLC already timed out, the invoice won't transition to Paid.
    console.log(`[invoice/claim] waiting for Paid... paymentHash=${paymentHash}`)
    const t2 = Date.now()
    const paidResult = await fiberClient.waitForInvoiceStatus(
      paymentHash as `0x${string}`,
      'Paid',
      { timeout: 10_000, interval: 200 },
    )
    console.log(`[invoice/claim] got status=${paidResult.status} after ${Date.now() - t2}ms paymentHash=${paymentHash}`)

    if (paidResult.status !== 'Paid') {
      console.log(`[invoice/claim] FAILED: status=${paidResult.status}, NOT unlocking content. paymentHash=${paymentHash}`)
      throw new Error(`Payment not confirmed: invoice status is ${paidResult.status}`)
    }

    updatePaymentAsSettled(paymentHash)
    console.log(`[invoice/claim] SUCCESS: unlocking ${hold.grantedSeconds}s, totalPaid=${session.totalPaidSeconds + hold.grantedSeconds}s paymentHash=${paymentHash}`)

    session.totalPaidSeconds += hold.grantedSeconds
    session.maxSegmentIndex = toSegmentIndex(session.totalPaidSeconds)
    session.expiresAt = Date.now() + authTtlSec * 1000
    updateStreamSession(session)

    return buildStreamPayload()
  })()

  claimInFlight.set(paymentHash, claimPromise)

  try {
    const payload = await claimPromise
    return c.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment verification failed'
    console.log(`[invoice/claim] ERROR: ${message} paymentHash=${paymentHash}`)
    if (message.startsWith('Unexpected invoice status:') || message.startsWith('Payment not confirmed:')) {
      return c.json({
        ok: false,
        error: message,
      }, 402)
    }
    return c.json({ ok: false, error: message }, 402)
  } finally {
    claimInFlight.delete(paymentHash)
  }
})

app.get('/stream/hls/:fileName', async (c) => {
  const token = c.req.query('token')
  const fileName = c.req.param('fileName')

  if (!token) {
    return c.text('Missing token', 401)
  }

  const session = getStreamSessionByToken(token)
  if (!session || Date.now() > session.expiresAt) {
    return c.text('Invalid or expired token', 401)
  }

  const segmentIndex = parseSegmentIndex(fileName)
  if (segmentIndex !== null && segmentIndex > session.maxSegmentIndex) {
    return c.text('Segment not authorized', 403)
  }

  if (!fileName.endsWith('.m3u8') && !fileName.endsWith('.ts') && !fileName.endsWith('.key')) {
    return c.text('Unsupported media file', 400)
  }

  // Get episode to construct HLS path from storage_path
  const episode = getDb().prepare(`
    SELECT storage_path
    FROM episodes
    WHERE id = ?
  `).get(session.episodeId) as { storage_path: string } | undefined

  if (!episode || !episode.storage_path) {
    return c.text('Episode or storage not found', 404)
  }

  // HLS files are in the 'hls' subdirectory of the episode's storage directory
  const hlsDir = path.join(path.dirname(episode.storage_path), 'hls')
  const targetPath = path.resolve(hlsDir, fileName)
  if (!targetPath.startsWith(hlsDir)) {
    return c.text('Invalid path', 400)
  }

  try {
    if (fileName.endsWith('.m3u8')) {
      const playlist = await fs.readFile(targetPath, 'utf8')
      const rewritten = rewritePlaylistWithToken(playlist, token)
      c.header('Content-Type', contentType(fileName))
      c.header('Cache-Control', 'no-store')
      return c.text(rewritten)
    }

    const fileBuffer = await fs.readFile(targetPath)
    c.header('Content-Type', contentType(fileName))
    c.header('Cache-Control', 'no-store')
    return c.body(fileBuffer)
  } catch {
    return c.text('HLS file not found', 404)
  }
})

// ---------------------------------------------------------------------------
// Public API - Browse podcasts and episodes (no authentication required)
// ---------------------------------------------------------------------------

// Helper function to construct HLS URL from storage_path
function constructHlsUrl(storagePath: string): string | null {
  // Returns the fixed HLS playlist URL; storagePath is kept for compatibility
  return `/stream/hls/playlist.m3u8`
}

// GET /api/podcasts - List all published podcasts
app.get('/api/podcasts', async (c) => {
  try {
    const podcasts = getDb().prepare(`
      SELECT id, title, description, created_at
      FROM podcasts
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string
      title: string
      description: string | null
      created_at: number
    }>

    c.header('Cache-Control', 'public, max-age=300') // 5 minutes
    return c.json({
      ok: true,
      podcasts,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list podcasts'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /api/podcasts/:id/episodes - List published episodes for a podcast
app.get('/api/podcasts/:id/episodes', async (c) => {
  const podcastId = c.req.param('id')

  try {
    // Check if podcast exists
    const podcast = getDb().prepare('SELECT id FROM podcasts WHERE id = ?').get(podcastId) as { id: string } | undefined
    if (!podcast) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    const episodes = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, price_per_second, status, created_at, storage_path
      FROM episodes
      WHERE podcast_id = ? AND status = 'published'
      ORDER BY created_at DESC
    `).all(podcastId) as Array<{
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      price_per_second: number
      status: string
      created_at: number
      storage_path: string
    }>

    const episodesWithHlsUrl = episodes.map(episode => {
      const hlsUrl = constructHlsUrl(episode.storage_path)
      return {
        id: episode.id,
        podcast_id: episode.podcast_id,
        title: episode.title,
        description: episode.description,
        duration: episode.duration,
        price_per_second: episode.price_per_second.toString(),
        status: episode.status,
        hls_url: hlsUrl,
        created_at: episode.created_at,
      }
    })

    c.header('Cache-Control', 'public, max-age=300') // 5 minutes
    return c.json({
      ok: true,
      episodes: episodesWithHlsUrl,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list episodes'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /api/episodes/:id - Get episode details
app.get('/api/episodes/:id', async (c) => {
  const episodeId = c.req.param('id')

  try {
    const episode = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, price_per_second, status, created_at, storage_path
      FROM episodes
      WHERE id = ? AND status = 'published'
    `).get(episodeId) as {
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      price_per_second: number
      status: string
      created_at: number
      storage_path: string
    } | undefined

    if (!episode) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    const hlsUrl = constructHlsUrl(episode.storage_path)

    c.header('Cache-Control', 'public, max-age=60') // 1 minute
    return c.json({
      ok: true,
      episode: {
        id: episode.id,
        podcast_id: episode.podcast_id,
        title: episode.title,
        description: episode.description,
        duration: episode.duration,
        price_per_second: episode.price_per_second.toString(),
        status: episode.status,
        hls_url: hlsUrl,
        created_at: episode.created_at,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

// ---------------------------------------------------------------------------
// Admin API - Podcast CRUD Operations
// ---------------------------------------------------------------------------
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || ''

import type { Context } from 'hono'

function requireAdminAuth(c: Context) {
  const authHeader = c.req.header('Authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  const providedKey = match ? match[1] : ''

  if (!ADMIN_API_KEY) {
    return { ok: false, error: 'Server not configured for admin access' } as const
  }

  if (providedKey !== ADMIN_API_KEY) {
    return { ok: false, error: 'Invalid or missing API key' } as const
  }

  return { ok: true } as const
}

// POST /admin/podcasts - Create podcast
app.post('/admin/podcasts', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const validation = await validateBody(c, createPodcastSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { title, description } = validation.data
  const id = randomUUID()
  const now = Date.now()

  try {
    getDb().prepare(`
      INSERT INTO podcasts (id, title, description, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, description ?? null, now)

    return c.json({
      ok: true,
      podcast: {
        id,
        title,
        description: description ?? null,
        created_at: now,
      },
    }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create podcast'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /admin/podcasts - List all podcasts
app.get('/admin/podcasts', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  try {
    const podcasts = getDb().prepare(`
      SELECT id, title, description, created_at
      FROM podcasts
      ORDER BY created_at DESC
    `).all() as Array<{
      id: string
      title: string
      description: string | null
      created_at: number
    }>

    return c.json({
      ok: true,
      podcasts,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list podcasts'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /admin/podcasts/:id - Get podcast details
app.get('/admin/podcasts/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    const podcast = getDb().prepare(`
      SELECT id, title, description, created_at
      FROM podcasts
      WHERE id = ?
    `).get(id) as {
      id: string
      title: string
      description: string | null
      created_at: number
    } | undefined

    if (!podcast) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    return c.json({
      ok: true,
      podcast,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get podcast'
    return c.json({ ok: false, error: message }, 500)
  }
})

// PUT /admin/podcasts/:id - Update podcast
app.put('/admin/podcasts/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  const validation = await validateBody(c, updatePodcastSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { title, description } = validation.data

  // Check if at least one field is provided
  if (title === undefined && description === undefined) {
    return c.json({ ok: false, error: 'No fields to update' }, 400)
  }

  try {
    // Check if podcast exists
    const existing = getDb().prepare('SELECT id FROM podcasts WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    // Build update query
    const updates: string[] = []
    const params: (string | null)[] = []

    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }

    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description ?? null)
    }

    params.push(id)

    getDb().prepare(`
      UPDATE podcasts
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    // Get updated podcast
    const podcast = getDb().prepare(`
      SELECT id, title, description, created_at
      FROM podcasts
      WHERE id = ?
    `).get(id) as {
      id: string
      title: string
      description: string | null
      created_at: number
    }

    return c.json({
      ok: true,
      podcast,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update podcast'
    return c.json({ ok: false, error: message }, 500)
  }
})

// DELETE /admin/podcasts/:id - Delete podcast (cascades to episodes)
app.delete('/admin/podcasts/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    // Check if podcast exists
    const existing = getDb().prepare('SELECT id FROM podcasts WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    // Delete will cascade to episodes due to ON DELETE CASCADE
    getDb().prepare('DELETE FROM podcasts WHERE id = ?').run(id)

    return c.json({
      ok: true,
      message: 'Podcast and associated episodes deleted successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete podcast'
    return c.json({ ok: false, error: message }, 500)
  }
})

// ---------------------------------------------------------------------------
// Admin API - Episode CRUD Operations
// ---------------------------------------------------------------------------

// POST /admin/episodes - Create episode metadata
app.post('/admin/episodes', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const validation = await validateBody(c, createEpisodeSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { podcast_id, title, description, price_per_second } = validation.data

  try {
    // Check if podcast exists
    const podcast = getDb().prepare('SELECT id FROM podcasts WHERE id = ?').get(podcast_id) as { id: string } | undefined
    if (!podcast) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    const id = randomUUID()
    const now = Date.now()
    const pricePerSecond = price_per_second ? BigInt(price_per_second) : DEFAULT_PRICE_PER_SECOND
    const storagePath = '' // Will be set after upload

    getDb().prepare(`
      INSERT INTO episodes (id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      podcast_id,
      title,
      description ?? null,
      null, // duration
      storagePath,
      pricePerSecond,
      'draft',
      now
    )

    return c.json({
      ok: true,
      episode: {
        id,
        podcast_id,
        title,
        description: description ?? null,
        duration: null,
        storage_path: storagePath,
        price_per_second: pricePerSecond.toString(),
        status: 'draft',
        created_at: now,
      },
    }, 201)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

// POST /admin/episodes/:id/upload - Upload audio file
app.post('/admin/episodes/:id/upload', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    // Check if episode exists
    const episode = getDb().prepare(`
      SELECT e.*, p.id as podcast_id 
      FROM episodes e 
      JOIN podcasts p ON e.podcast_id = p.id 
      WHERE e.id = ?
    `).get(id) as {
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      storage_path: string
      price_per_second: number
      status: string
      created_at: number
    } | undefined

    if (!episode) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    // Only allow upload if episode is in draft or processing status
    if (episode.status === 'published') {
      return c.json({ ok: false, error: 'Cannot upload to a published episode' }, 400)
    }

    const formData = await c.req.formData()
    const file = formData.get('file') as File | null

    // Validate file
    const fileValidation = validateAudioFile(file)
    if (!fileValidation.success) {
      return c.json({ ok: false, error: fileValidation.error }, 400)
    }

    const validatedFile = fileValidation.file!

    // Convert File to stream (streaming to avoid memory issues with large files)
    const { Readable } = await import('node:stream')
    const webStream = validatedFile.stream()
    const fileStream = Readable.fromWeb(webStream as any)

    // Upload file to storage
    const result = await StorageService.upload(
      episode.podcast_id,
      id,
      fileStream,
      validatedFile.type,
      validatedFile.size,
      validatedFile.name
    )

    // Update episode with storage path and status
    const storagePath = result.filePath
    getDb().prepare(`
      UPDATE episodes 
      SET storage_path = ?, status = ? 
      WHERE id = ?
    `).run(storagePath, 'processing', id)

    // Queue transcoding job
    await transcodeService.queueTranscodeJob(
      episode.podcast_id,
      id,
      storagePath
    )

    return c.json({
      ok: true,
      episode: {
        id,
        podcast_id: episode.podcast_id,
        title: episode.title,
        description: episode.description,
        duration: episode.duration,
        storage_path: storagePath,
        price_per_second: episode.price_per_second.toString(),
        status: 'processing',
        created_at: episode.created_at,
      },
      message: 'File uploaded and transcoding queued',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload file'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /admin/episodes - List episodes for a podcast
app.get('/admin/episodes', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const podcastId = c.req.query('podcast_id')

  if (!podcastId) {
    return c.json({ ok: false, error: 'podcast_id query parameter is required' }, 400)
  }

  try {
    // Check if podcast exists
    const podcast = getDb().prepare('SELECT id FROM podcasts WHERE id = ?').get(podcastId) as { id: string } | undefined
    if (!podcast) {
      return c.json({ ok: false, error: 'Podcast not found' }, 404)
    }

    const episodes = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at
      FROM episodes
      WHERE podcast_id = ?
      ORDER BY created_at DESC
    `).all(podcastId) as Array<{
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      storage_path: string
      price_per_second: number
      status: string
      created_at: number
    }>

    return c.json({
      ok: true,
      episodes: episodes.map(e => ({
        ...e,
        price_per_second: e.price_per_second.toString(),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list episodes'
    return c.json({ ok: false, error: message }, 500)
  }
})

// GET /admin/episodes/:id - Get episode details
app.get('/admin/episodes/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    const episode = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at
      FROM episodes
      WHERE id = ?
    `).get(id) as {
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      storage_path: string
      price_per_second: number
      status: string
      created_at: number
    } | undefined

    if (!episode) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    return c.json({
      ok: true,
      episode: {
        ...episode,
        price_per_second: episode.price_per_second.toString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

// PUT /admin/episodes/:id - Update episode metadata
app.put('/admin/episodes/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  const validation = await validateBody(c, updateEpisodeSchema)
  if (!validation.success) {
    return c.json({ ok: false, error: validation.error }, 400)
  }

  const { title, description, price_per_second } = validation.data

  // Check if at least one field is provided
  if (title === undefined && description === undefined && price_per_second === undefined) {
    return c.json({ ok: false, error: 'No fields to update' }, 400)
  }

  try {
    // Check if episode exists
    const existing = getDb().prepare(`
      SELECT id, status FROM episodes WHERE id = ?
    `).get(id) as { id: string; status: string } | undefined

    if (!existing) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    // Do not allow editing published episodes
    if (existing.status === 'published') {
      return c.json({ ok: false, error: 'Cannot edit a published episode' }, 400)
    }

    // Build update query
    const updates: string[] = []
    const params: (string | number | null)[] = []

    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }

    if (description !== undefined) {
      updates.push('description = ?')
      params.push(description ?? null)
    }

    if (price_per_second !== undefined) {
      updates.push('price_per_second = ?')
      params.push(BigInt(price_per_second).toString())
    }

    params.push(id)

    getDb().prepare(`
      UPDATE episodes
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params)

    // Get updated episode
    const episode = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at
      FROM episodes
      WHERE id = ?
    `).get(id) as {
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      storage_path: string
      price_per_second: number
      status: string
      created_at: number
    }

    return c.json({
      ok: true,
      episode: {
        ...episode,
        price_per_second: episode.price_per_second.toString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

// DELETE /admin/episodes/:id - Delete episode and files
app.delete('/admin/episodes/:id', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    // Check if episode exists
    const existing = getDb().prepare(`
      SELECT id, podcast_id, storage_path FROM episodes WHERE id = ?
    `).get(id) as { id: string; podcast_id: string; storage_path: string } | undefined

    if (!existing) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    // Delete files from storage if storage_path is set
    if (existing.storage_path) {
      try {
        await StorageService.deleteEpisode(existing.podcast_id, id)
      } catch (storageErr) {
        // Log but continue - file may not exist
        console.error('Failed to delete episode files:', storageErr)
      }
    }

    // Delete episode from database
    getDb().prepare('DELETE FROM episodes WHERE id = ?').run(id)

    return c.json({
      ok: true,
      message: 'Episode and associated files deleted successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

// POST /admin/episodes/:id/publish - Publish episode
app.post('/admin/episodes/:id/publish', async (c) => {
  const auth = requireAdminAuth(c)
  if (!auth.ok) {
    return c.json({ ok: false, error: auth.error }, 401)
  }

  const id = c.req.param('id')

  try {
    // Check if episode exists
    const existing = getDb().prepare(`
      SELECT id, status, storage_path FROM episodes WHERE id = ?
    `).get(id) as { id: string; status: string; storage_path: string } | undefined

    if (!existing) {
      return c.json({ ok: false, error: 'Episode not found' }, 404)
    }

    // Only allow publishing if episode is in 'ready' status
    if (existing.status !== 'ready') {
      return c.json({ ok: false, error: `Cannot publish episode with status: ${existing.status}. Episode must be in 'ready' status.` }, 400)
    }

    if (!existing.storage_path) {
      return c.json({ ok: false, error: 'Episode has no uploaded file' }, 400)
    }

    // Update status to published
    getDb().prepare(`
      UPDATE episodes
      SET status = 'published'
      WHERE id = ?
    `).run(id)

    // Get updated episode
    const episode = getDb().prepare(`
      SELECT id, podcast_id, title, description, duration, storage_path, price_per_second, status, created_at
      FROM episodes
      WHERE id = ?
    `).get(id) as {
      id: string
      podcast_id: string
      title: string
      description: string | null
      duration: number | null
      storage_path: string
      price_per_second: number
      status: string
      created_at: number
    }

    return c.json({
      ok: true,
      episode: {
        ...episode,
        price_per_second: episode.price_per_second.toString(),
      },
      message: 'Episode published successfully',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish episode'
    return c.json({ ok: false, error: message }, 500)
  }
})

const port = Number(process.env.PORT ?? 8787)

export async function startServer() {
  await initDb()
  transcodeService.initializeTranscodeQueue()

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`backend listening on http://localhost:${info.port}`)
    }
  )
}

export { app }
