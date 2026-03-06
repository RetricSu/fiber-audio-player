import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { blake2b } from '@noble/hashes/blake2.js'
import {
  FiberRpcClient,
  randomBytes32,
  toHex,
  type Currency,
} from '@fiber-pay/sdk'

const app = new Hono()

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

const holdInvoices = new Map<string, HoldInvoice>()
const claimInFlight = new Map<string, Promise<ClaimSuccessPayload>>()
const sessions = new Map<string, StreamSession>()
const streamGrants = new Map<string, StreamGrant>()

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
const authTtlSec = Number(process.env.STREAM_AUTH_TTL_SEC ?? 300)
const hlsDir = path.resolve(process.cwd(), process.env.HLS_DIR ?? '../media/hls')

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
// Returns a sessionId and the initial (empty) stream token.
// ---------------------------------------------------------------------------
app.post('/sessions/create', async (c) => {
  const sessionId = randomUUID()
  const streamToken = randomUUID()
  const expiresAt = Date.now() + authTtlSec * 1000

  const session: StreamSession = {
    id: sessionId,
    streamToken,
    totalPaidSeconds: 0,
    maxSegmentIndex: -1, // no segments unlocked yet
    expiresAt,
    createdAt: Date.now(),
  }
  sessions.set(sessionId, session)

  // Also create the grant entry so the token can be validated (but 0 segments)
  streamGrants.set(streamToken, {
    token: streamToken,
    expiresAt,
    maxSegmentIndex: -1,
    sessionId,
  })

  return c.json({
    ok: true,
    session: {
      sessionId,
      pricePerSecondShannon: toHex(PRICE_PER_SECOND_SHANNON),
      segmentDurationSec,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /invoices/create — create a hold invoice for N seconds of streaming.
// Body: { sessionId: string, seconds: number }
// Returns: { invoiceAddress, paymentHash, amountShannon, seconds }
// ---------------------------------------------------------------------------
app.post('/invoices/create', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    sessionId?: string
    seconds?: number
  }

  const sessionId = body.sessionId ?? ''
  const session = sessions.get(sessionId)
  if (!session) {
    return c.json({ ok: false, error: 'Invalid sessionId' }, 400)
  }

  const seconds = Math.max(1, Math.floor(Number(body.seconds ?? 30)))
  const amountShannon = PRICE_PER_SECOND_SHANNON * BigInt(seconds)

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

    holdInvoices.set(paymentHash, {
      paymentHash,
      preimage,
      invoiceAddress: result.invoice_address,
      amountShannon,
      grantedSeconds: seconds,
      sessionId,
      createdAt: Date.now(),
      settled: false,
    })

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
  const body = (await c.req.json().catch(() => ({}))) as {
    paymentHash?: string
  }

  const paymentHash = body.paymentHash ?? ''
  const hold = holdInvoices.get(paymentHash)
  if (!hold) {
    return c.json({ ok: false, error: 'Unknown payment hash' }, 400)
  }

  const session = sessions.get(hold.sessionId)
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

    hold.settled = true
    console.log(`[invoice/claim] SUCCESS: unlocking ${hold.grantedSeconds}s, totalPaid=${session.totalPaidSeconds + hold.grantedSeconds}s paymentHash=${paymentHash}`)

    // Extend the session grant
    session.totalPaidSeconds += hold.grantedSeconds
    session.maxSegmentIndex = toSegmentIndex(session.totalPaidSeconds)
    session.expiresAt = Date.now() + authTtlSec * 1000

    // Update the stream grant for this token
    const grant = streamGrants.get(session.streamToken)
    if (grant) {
      grant.maxSegmentIndex = session.maxSegmentIndex
      grant.expiresAt = session.expiresAt
    }

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

  const grant = streamGrants.get(token)
  if (!grant || Date.now() > grant.expiresAt) {
    return c.text('Invalid or expired token', 401)
  }

  const segmentIndex = parseSegmentIndex(fileName)
  if (segmentIndex !== null && segmentIndex > grant.maxSegmentIndex) {
    return c.text('Segment not authorized', 403)
  }

  if (!fileName.endsWith('.m3u8') && !fileName.endsWith('.ts') && !fileName.endsWith('.key')) {
    return c.text('Unsupported media file', 400)
  }

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

const port = Number(process.env.PORT ?? 8787)

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`backend listening on http://localhost:${info.port}`)
  }
)
