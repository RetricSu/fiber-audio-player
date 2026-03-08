import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import request from 'supertest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createTestPodcast, createTestEpisode, TEST_UPLOADS_DIR } from './setup.js'

// Mock functions for Fiber client
const mockNewInvoice = vi.fn()
const mockWaitForInvoiceStatus = vi.fn()
const mockSettleInvoice = vi.fn()

// Mock the Fiber SDK before importing the app
vi.mock('@fiber-pay/sdk', async () => {
  const actual = await vi.importActual<typeof import('@fiber-pay/sdk')>('@fiber-pay/sdk')
  return {
    ...actual,
    FiberRpcClient: class MockFiberRpcClient {
      constructor(_options: { url: string; timeout: number }) {}
      newInvoice = mockNewInvoice
      waitForInvoiceStatus = mockWaitForInvoiceStatus
      settleInvoice = mockSettleInvoice
    },
  }
})

function createTestServer(app: any) {
  return createServer(async (req, res) => {
    const url = `http://localhost${req.url}`
    const method = req.method || 'GET'
    const headers = new Headers()
    
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value) headers.set(key, String(value))
    })
    
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    
    await new Promise<void>((resolve) => req.on('end', resolve))
    
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
    
    const response = await app.fetch(
      new Request(url, { method, headers, body }),
      {} as any
    )
    
    res.statusCode = response.status
    res.statusMessage = response.statusText
    
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })
    
    const responseBody = await response.arrayBuffer()
    res.end(Buffer.from(responseBody))
  })
}

describe('Payments API', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()
  })

  describe('POST /sessions/create', () => {
    it('should create a session for a published episode', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.session).toBeDefined()
      expect(response.body.session.sessionId).toBeDefined()
      expect(response.body.session.episodeId).toBe(episode.id)
      expect(response.body.session.pricePerSecondShannon).toBe('10000')
      expect(response.body.session.segmentDurationSec).toBeDefined()
      
      server.close()
    })
    
    it('should reject session creation without episodeId', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({})
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('episodeId')
      
      server.close()
    })
    
    it('should reject session creation with invalid episodeId', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({ episodeId: 'invalid-uuid' })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      
      server.close()
    })
    
    it('should return 404 for non-existent episode', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({ episodeId: '00000000-0000-0000-0000-000000000000' })
      
      expect(response.status).toBe(404)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Episode not found')
      
      server.close()
    })
    
    it('should reject session creation for draft episode', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Draft Episode', {
        status: 'draft',
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('not published')
      
      server.close()
    })
    
    it('should reject session creation for ready episode', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Ready Episode', {
        status: 'ready',
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('not published')
      
      server.close()
    })
  })
  
  describe('POST /invoices/create', () => {
    it('should create an invoice for a valid session', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // First create a session
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      expect(sessionResponse.status).toBe(200)
      const sessionId = sessionResponse.body.session.sessionId
      
      // Mock the Fiber client response
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 60 })
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.invoice).toBeDefined()
      expect(response.body.invoice.invoiceAddress).toBeDefined()
      expect(response.body.invoice.paymentHash).toBeDefined()
      expect(response.body.invoice.amountShannon).toBeDefined()
      expect(response.body.invoice.seconds).toBe(60)
      expect(mockNewInvoice).toHaveBeenCalledTimes(1)
      
      server.close()
    })
    
    it('should use default seconds when not provided', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId })
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.invoice.seconds).toBe(30) // Default value
      
      server.close()
    })
    
    it('should reject invoice creation without sessionId', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/invoices/create')
        .send({ seconds: 30 })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('sessionId')
      
      server.close()
    })
    
    it('should reject invoice creation for invalid session', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId: 'invalid-session-id', seconds: 30 })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Invalid sessionId')
      
      server.close()
    })
    
    it('should reject invoice creation for non-existent session', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId: '00000000-0000-0000-0000-000000000000', seconds: 30 })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Invalid sessionId')
      
      server.close()
    })
    
    it('should handle Fiber client errors gracefully', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockRejectedValueOnce(new Error('Fiber node unavailable'))
      
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      expect(response.status).toBe(500)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Fiber node unavailable')
      
      server.close()
    })
    
    it('should calculate correct amount based on price_per_second', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(5000), // 0.00005 CKB per second
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockImplementationOnce((params) => {
        // Verify the amount is calculated correctly: 5000 * 60 = 300000
        expect(params.amount).toBe('0x493e0') // 300000 in hex
        return {
          invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
        }
      })
      
      const response = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 60 })
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(mockNewInvoice).toHaveBeenCalledTimes(1)
      
      server.close()
    })
  })
  
  describe('POST /invoices/claim', () => {
    it('should claim an invoice and return stream token', async () => {
      // Reset mocks for this test
      mockNewInvoice.mockReset()
      mockWaitForInvoiceStatus.mockReset()
      mockSettleInvoice.mockReset()
      
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      // Create invoice
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      // Mock the Fiber client responses for claiming
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })  // First call - payment received
        .mockResolvedValueOnce({ status: 'Paid' })       // Second call - payment confirmed
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.stream).toBeDefined()
      expect(response.body.stream.token).toBeDefined()
      expect(response.body.stream.grantedSeconds).toBe(30)
      expect(response.body.stream.playlistUrl).toContain('/stream/hls/playlist.m3u8')
      expect(mockSettleInvoice).toHaveBeenCalledTimes(1)
      
      server.close()
    })
    
    it('should be idempotent - return same stream info on duplicate claim', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and invoice
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      // First claim
      const firstResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      expect(firstResponse.status).toBe(200)
      expect(firstResponse.body.ok).toBe(true)
      
      // Second claim should succeed with idempotent behavior
      const secondResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      expect(secondResponse.status).toBe(200)
      expect(secondResponse.body.ok).toBe(true)
      expect(secondResponse.body.stream.token).toBe(firstResponse.body.stream.token)
      
      server.close()
    })
    
    it('should reject claim without paymentHash', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/invoices/claim')
        .send({})
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('paymentHash')
      
      server.close()
    })
    
    it('should reject claim for unknown payment hash', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash: '0x1234567890abcdef' })
      
      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Unknown payment hash')
      
      server.close()
    })
    
    it('should reject claim for non-existent payment hash', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)

      const response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash: '0x1234567890abcdef' })

      expect(response.status).toBe(400)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Unknown payment hash')

      server.close()
    })
    
    it('should return 402 when payment is not received', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and invoice
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      // Mock payment not received
      mockWaitForInvoiceStatus.mockResolvedValueOnce({ status: 'Open' })
      
      const response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      expect(response.status).toBe(402)
      expect(response.body.ok).toBe(false)
      
      server.close()
    })
    
    it('should return 402 when payment is not confirmed after settlement', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and invoice
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      // Payment received but not confirmed
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Cancelled' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      expect(response.status).toBe(402)
      expect(response.body.ok).toBe(false)
      expect(response.body.error).toContain('Payment not confirmed')
      
      server.close()
    })
    
    it('should accumulate granted seconds across multiple claims', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      // First invoice - 30 seconds
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoice1Response = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash1 = invoice1Response.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claim1Response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash: paymentHash1 })
      
      expect(claim1Response.body.stream.grantedSeconds).toBe(30)
      
      // Second invoice - 60 more seconds
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn5',
      })
      
      const invoice2Response = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 60 })
      
      const paymentHash2 = invoice2Response.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claim2Response = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash: paymentHash2 })
      
      expect(claim2Response.body.stream.grantedSeconds).toBe(90) // 30 + 60
      
      server.close()
    })
  })
  
  describe('GET /stream/hls/:fileName', () => {
    it('should reject request without token', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .get('/stream/hls/playlist.m3u8')
      
      expect(response.status).toBe(401)
      expect(response.text).toContain('Missing token')
      
      server.close()
    })
    
    it('should reject request with invalid token', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server)
        .get('/stream/hls/playlist.m3u8?token=invalid-token')
      
      expect(response.status).toBe(401)
      expect(response.text).toContain('Invalid or expired token')
      
      server.close()
    })
    
    it('should reject request for unauthorized segment', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'source.mp3'),
      })
      
      // Create HLS directory and files for testing
      const hlsDir = path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'hls')
      await fs.mkdir(hlsDir, { recursive: true })
      await fs.writeFile(path.join(hlsDir, 'segment_0.ts'), 'fake-segment-data')
      await fs.writeFile(path.join(hlsDir, 'segment_10.ts'), 'fake-segment-data')
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and invoice
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/segment_10.ts?token=' + token)
      
      expect(response.status).toBe(403)
      expect(response.text).toContain('Segment not authorized')
      
      server.close()
    })
    
    it('should reject unsupported file types', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/file.mp4?token=' + token)
      
      expect(response.status).toBe(400)
      expect(response.text).toContain('Unsupported media file')
      
      server.close()
    })
    
    it('should return 404 when episode storage is not found', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: '',
      })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/playlist.m3u8?token=' + token)
      
      expect(response.status).toBe(404)
      expect(response.text).toContain('Episode or storage not found')
      
      server.close()
    })
    
    it('should serve playlist file with token injection', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'source.mp3'),
      })
      
      // Create HLS directory with playlist
      const hlsDir = path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'hls')
      await fs.mkdir(hlsDir, { recursive: true })
      const playlistContent = `#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10.0,\nsegment0.ts\n#EXTINF:10.0,\nsegment1.ts\n#EXT-X-ENDLIST`
      await fs.writeFile(path.join(hlsDir, 'playlist.m3u8'), playlistContent)
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/playlist.m3u8?token=' + token)
      
      expect(response.status).toBe(200)
      expect(response.text).toContain('segment0.ts?token=' + token)
      expect(response.text).toContain('segment1.ts?token=' + token)
      
      server.close()
    })
    
    it('should serve segment files', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'source.mp3'),
      })
      
      // Create HLS directory with segment
      const hlsDir = path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'hls')
      await fs.mkdir(hlsDir, { recursive: true })
      const segmentData = Buffer.from([0x00, 0x00, 0x00, 0x01]) // Fake TS data
      await fs.writeFile(path.join(hlsDir, 'segment0.ts'), segmentData)
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/segment0.ts?token=' + token)
      
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('video/mp2t')
      expect(response.body).toEqual(segmentData)
      
      server.close()
    })
    
    it('should serve encryption key files', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'source.mp3'),
      })
      
      // Create HLS directory with key file
      const hlsDir = path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'hls')
      await fs.mkdir(hlsDir, { recursive: true })
      const keyData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10])
      await fs.writeFile(path.join(hlsDir, 'encryption.key'), keyData)
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      
      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })
      
      const sessionId = sessionResponse.body.session.sessionId
      
      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })
      
      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })
      
      const paymentHash = invoiceResponse.body.invoice.paymentHash
      
      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })
      
      mockSettleInvoice.mockResolvedValueOnce({})
      
      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })
      
      const token = claimResponse.body.stream.token
      
      const response = await request(server)
        .get('/stream/hls/encryption.key?token=' + token)
      
      expect(response.status).toBe(200)
      expect(response.body).toEqual(keyData)
      
      server.close()
    })
    
    it('should prevent path traversal attacks', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode', {
        status: 'published',
        pricePerSecond: BigInt(10000),
        storagePath: path.join(TEST_UPLOADS_DIR, 'test', 'episode', 'source.mp3'),
      })

      const { app } = await import('../src/index.js')
      const server = createTestServer(app)

      // Create session and claim to get token
      const sessionResponse = await request(server)
        .post('/sessions/create')
        .send({ episodeId: episode.id })

      const sessionId = sessionResponse.body.session.sessionId

      mockNewInvoice.mockResolvedValueOnce({
        invoice_address: 'ckb1invoice1qwnwhgj6k4qn0xwfwjrf0ycgsttnz84r4nc5mcwvqjcq0r3g4zhkzdhkvh22zd6xphnj3fqzs5qv2y0uxqnry7vr97zrjw6wlyqkjtk6t8ttkg2nsn7pyn4',
      })

      const invoiceResponse = await request(server)
        .post('/invoices/create')
        .send({ sessionId, seconds: 30 })

      const paymentHash = invoiceResponse.body.invoice.paymentHash

      mockWaitForInvoiceStatus
        .mockResolvedValueOnce({ status: 'Received' })
        .mockResolvedValueOnce({ status: 'Paid' })

      mockSettleInvoice.mockResolvedValueOnce({})

      const claimResponse = await request(server)
        .post('/invoices/claim')
        .send({ paymentHash })

      const token = claimResponse.body.stream.token

      // Attempt path traversal - should not succeed (400 or 404 both indicate blocked)
      const response = await request(server)
        .get('/stream/hls/../../../etc/passwd?token=' + token)

      expect(response.status).not.toBe(200)

      server.close()
    })
  })
})
