export interface VerifyPaymentRequest {
  requestedSeconds: number
  paymentHash?: string
}

export interface VerifyPaymentResponse {
  ok: boolean
  verifyMode: 'dummy-agree' | string
  payment: {
    paymentSessionId: string
    paymentHash: string | null
    approvedSeconds: number
  }
}

export interface AuthorizeStreamRequest {
  paymentSessionId: string
  requestedSeconds: number
}

export interface AuthorizeStreamResponse {
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

export async function verifyPayment(input: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
  return postJson<VerifyPaymentRequest, VerifyPaymentResponse>('/payments/verify', input)
}

export async function authorizeStream(input: AuthorizeStreamRequest): Promise<AuthorizeStreamResponse> {
  return postJson<AuthorizeStreamRequest, AuthorizeStreamResponse>('/stream/authorize', input)
}

export function toAbsolutePlaylistUrl(playlistUrl: string): string {
  if (playlistUrl.startsWith('http://') || playlistUrl.startsWith('https://')) {
    return playlistUrl
  }
  return `${backendBaseUrl()}${playlistUrl.startsWith('/') ? '' : '/'}${playlistUrl}`
}
