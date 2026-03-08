import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createTestServer, TEST_ADMIN_KEY, createTestPodcast } from './utils.js'

describe('Podcasts API', () => {
  describe('Public endpoints', () => {
    it('should list all published podcasts', async () => {
      await createTestPodcast('Test Podcast 1', 'Description 1')
      await createTestPodcast('Test Podcast 2', 'Description 2')
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get('/api/podcasts')
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.podcasts).toBeInstanceOf(Array)
      expect(response.body.podcasts.length).toBeGreaterThanOrEqual(2)
      
      server.close()
    })
    
    it('should return empty array when no podcasts exist', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get('/api/podcasts')
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.podcasts).toBeInstanceOf(Array)
      
      server.close()
    })
  })
  
  describe('Admin endpoints', () => {
    describe('POST /admin/podcasts', () => {
      it('should create a podcast with valid data', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/podcasts')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: 'New Podcast', description: 'A test podcast' })
        
        expect(response.status).toBe(201)
        expect(response.body.ok).toBe(true)
        expect(response.body.podcast).toBeDefined()
        expect(response.body.podcast.title).toBe('New Podcast')
        
        server.close()
      })
      
      it('should reject creation without authentication', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/podcasts')
          .send({ title: 'New Podcast' })
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject creation with invalid API key', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/podcasts')
          .set('Authorization', 'Bearer invalid-key')
          .send({ title: 'New Podcast' })
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject podcast without title', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/podcasts')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ description: 'Only description' })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject podcast with empty title', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/podcasts')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: '' })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('GET /admin/podcasts', () => {
      it('should list all podcasts with admin auth', async () => {
        await createTestPodcast('Admin Test Podcast')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get('/admin/podcasts')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.podcasts).toBeInstanceOf(Array)
        
        server.close()
      })
      
      it('should reject listing without authentication', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server).get('/admin/podcasts')
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('GET /admin/podcasts/:id', () => {
      it('should get a specific podcast by ID', async () => {
        const podcast = await createTestPodcast('Specific Podcast', 'Details here')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.podcast.id).toBe(podcast.id)
        expect(response.body.podcast.title).toBe('Specific Podcast')
        
        server.close()
      })
      
      it('should return 404 for non-existent podcast', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get('/admin/podcasts/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('PUT /admin/podcasts/:id', () => {
      it('should update podcast title', async () => {
        const podcast = await createTestPodcast('Old Title')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: 'New Title' })
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.podcast.title).toBe('New Title')
        
        server.close()
      })
      
      it('should update podcast description', async () => {
        const podcast = await createTestPodcast('Title', 'Old Description')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ description: 'New Description' })
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.podcast.description).toBe('New Description')
        
        server.close()
      })
      
      it('should reject update with no fields', async () => {
        const podcast = await createTestPodcast('Title')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({})
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should return 404 for updating non-existent podcast', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put('/admin/podcasts/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: 'New Title' })
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('DELETE /admin/podcasts/:id', () => {
      it('should delete a podcast', async () => {
        const podcast = await createTestPodcast('To Be Deleted')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .delete(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        
        const getResponse = await request(server)
          .get(`/admin/podcasts/${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(getResponse.status).toBe(404)
        
        server.close()
      })
      
      it('should return 404 for deleting non-existent podcast', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .delete('/admin/podcasts/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
  })
})
