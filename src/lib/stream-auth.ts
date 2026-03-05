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
  session: {
    sessionId: string
    pricePerSecondShannon: string // hex
    segmentDurationSec: number
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

async function postJson<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = payload?.error || `Request failed: ${response.status}`
    throw new Error(message)
  }

  return payload as TResponse
}

export async function getBackendNodeInfo(): Promise<BackendNodeInfo> {
  const res = await getJson<{ ok: boolean; node: BackendNodeInfo }>('/node-info')
  return res.node
}

export async function createSession(): Promise<CreateSessionResponse> {
  return postJson<Record<string, never>, CreateSessionResponse>('/sessions/create', {})
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
