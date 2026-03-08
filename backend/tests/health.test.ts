import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createTestServer } from './utils.js'

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
