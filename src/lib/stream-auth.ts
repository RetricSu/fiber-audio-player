// ---------------------------------------------------------------------------
// Backend API client — sessions, invoices, stream authorization
// ---------------------------------------------------------------------------

export interface BackendNodeInfo {
  nodeName: string | null
  nodeId: string
  addresses: string[]
  openChannelAutoAcceptMin: string | null
}

export interface CreateSessionResponse {
  ok: boolean
  fromCache?: boolean
  session: {
    sessionId: string
    pricePerSecondShannon: string // hex
    segmentDurationSec: number
  }
}

export class BackendRequestTimeoutError extends Error {
  code = 'REQUEST_TIMEOUT'

  constructor(message = '请求超时，请稍后重试或查询状态') {
    super(message)
    this.name = 'BackendRequestTimeoutError'
  }
}

export interface CreateInvoiceRequest {
  sessionId: string
  seconds: number
}

export interface CreateInvoiceResponse {
  ok: boolean
  invoice: {
    invoiceAddress: string
    paymentHash: string
    amountShannon: string // hex
    seconds: number
  }
}

export interface ClaimInvoiceRequest {
  paymentHash: string
}

export interface ClaimInvoiceResponse {
  ok: boolean
  stream: {
    token: string
    expiresAt: number
    grantedSeconds: number
    segmentDurationSec: number
    maxSegmentIndex: number
    playlistUrl: string
  }
}

const DEFAULT_BACKEND_BASE_URL = 'http://localhost:8787'

function backendBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/$/, '')
}

async function getJson<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${backendBaseUrl()}${path}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`)
  }
  return payload as TResponse
}

async function postJson<TRequest, TResponse>(path: string, body: TRequest, timeoutMs?: number): Promise<TResponse> {
  const controller = new AbortController()
  const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(`${backendBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      const message = payload?.error || `Request failed: ${response.status}`
      throw new Error(message)
    }

    return payload as TResponse
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new BackendRequestTimeoutError()
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

const SESSION_CLIENT_KEY_PREFIX = 'fap:session-client-key:'

function randomClientKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function getOrCreateSessionClientKey(episodeId?: string): string {
  const scope = episodeId || 'default'
  const storageKey = `${SESSION_CLIENT_KEY_PREFIX}${scope}`

  if (typeof window === 'undefined' || !window.sessionStorage) {
    return randomClientKey()
  }

  try {
    const existing = window.sessionStorage.getItem(storageKey)
    if (existing) {
      return existing
    }
    const created = randomClientKey()
    window.sessionStorage.setItem(storageKey, created)
    return created
  } catch {
    return randomClientKey()
  }
}

export async function getBackendNodeInfo(): Promise<BackendNodeInfo> {
  const res = await getJson<{ ok: boolean; node: BackendNodeInfo }>('/node-info')
  return res.node
}

export async function createSession(episodeId?: string): Promise<CreateSessionResponse> {
  const clientKey = getOrCreateSessionClientKey(episodeId)
  return postJson<{ episodeId?: string; clientKey: string }, CreateSessionResponse>(
    '/sessions/create',
    episodeId ? { episodeId, clientKey } : { clientKey },
    10000,
  )
}

export async function createInvoice(input: CreateInvoiceRequest): Promise<CreateInvoiceResponse> {
  return postJson<CreateInvoiceRequest, CreateInvoiceResponse>('/invoices/create', input)
}

export async function claimInvoice(input: ClaimInvoiceRequest): Promise<ClaimInvoiceResponse> {
  return postJson<ClaimInvoiceRequest, ClaimInvoiceResponse>('/invoices/claim', input)
}

export function toAbsolutePlaylistUrl(playlistUrl: string): string {
  if (playlistUrl.startsWith('http://') || playlistUrl.startsWith('https://')) {
    return playlistUrl
  }
  return `${backendBaseUrl()}${playlistUrl.startsWith('/') ? '' : '/'}${playlistUrl}`
}
