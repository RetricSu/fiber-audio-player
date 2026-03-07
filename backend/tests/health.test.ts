import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import request from 'supertest'

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

describe('Health API', () => {
  it('should return health status', async () => {
    const { app } = await import('../src/index.js')
    const server = createTestServer(app)
    const response = await request(server).get('/healthz')
    
    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(response.body.service).toBe('fiber-audio-backend')
    
    server.close()
  })
})
