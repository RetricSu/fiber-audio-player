import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const app = new Hono()

app.use('*', cors())

type PaymentSession = {
  id: string
  approvedSeconds: number
  createdAt: number
}

type StreamGrant = {
  token: string
  expiresAt: number
  maxSegmentIndex: number
  paymentSessionId: string
}

const paymentSessions = new Map<string, PaymentSession>()
const streamGrants = new Map<string, StreamGrant>()

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

app.post('/payments/verify', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    requestedSeconds?: number
    paymentHash?: string
  }

  const requestedSeconds = Math.max(1, Number(body.requestedSeconds ?? 30))

  const session: PaymentSession = {
    id: randomUUID(),
    approvedSeconds: requestedSeconds,
    createdAt: Date.now(),
  }

  paymentSessions.set(session.id, session)

  return c.json({
    ok: true,
    verifyMode: 'dummy-agree',
    payment: {
      paymentSessionId: session.id,
      paymentHash: body.paymentHash ?? null,
      approvedSeconds: session.approvedSeconds,
    },
    next: {
      authorizeEndpoint: '/stream/authorize',
    },
  })
})

app.post('/stream/authorize', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    paymentSessionId?: string
    requestedSeconds?: number
  }

  const paymentSessionId = body.paymentSessionId ?? ''
  const session = paymentSessions.get(paymentSessionId)

  if (!session) {
    return c.json({ ok: false, error: 'Invalid paymentSessionId' }, 400)
  }

  const requestedSeconds = Math.max(1, Number(body.requestedSeconds ?? session.approvedSeconds))
  const grantedSeconds = Math.min(requestedSeconds, session.approvedSeconds)
  const maxSegmentIndex = toSegmentIndex(grantedSeconds)

  const token = randomUUID()
  const expiresAt = Date.now() + authTtlSec * 1000

  streamGrants.set(token, {
    token,
    expiresAt,
    maxSegmentIndex,
    paymentSessionId,
  })

  return c.json({
    ok: true,
    stream: {
      token,
      expiresAt,
      grantedSeconds,
      segmentDurationSec,
      maxSegmentIndex,
      playlistUrl: `/stream/hls/playlist.m3u8?token=${token}`,
    },
  })
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
