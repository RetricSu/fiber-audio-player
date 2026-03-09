import { describe, it, expect } from 'vitest'
import request from 'supertest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createTestServer, TEST_ADMIN_KEY, createTestPodcast, createTestEpisode, TEST_UPLOADS_DIR } from './utils.js'

describe('Episodes API', () => {
  describe('Public endpoints', () => {
    it('should list episodes for a podcast', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      await createTestEpisode(podcast.id, 'Episode 1')
      await createTestEpisode(podcast.id, 'Episode 2')
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get(`/api/podcasts/${podcast.id}/episodes`)
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.episodes).toBeInstanceOf(Array)
      expect(response.body.episodes.length).toBe(2)
      
      server.close()
    })
    
    it('should return 404 for non-existent podcast', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get('/api/podcasts/00000000-0000-0000-0000-000000000000/episodes')
      
      expect(response.status).toBe(404)
      expect(response.body.ok).toBe(false)
      
      server.close()
    })
    
    it('should only return published episodes', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      await createTestEpisode(podcast.id, 'Published Episode', { status: 'published' })
      await createTestEpisode(podcast.id, 'Draft Episode', { status: 'draft' })
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get(`/api/podcasts/${podcast.id}/episodes`)
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.episodes.length).toBe(1)
      expect(response.body.episodes[0].title).toBe('Published Episode')
      
      server.close()
    })
    
    it('should get episode by ID', async () => {
      const podcast = await createTestPodcast('Test Podcast')
      const episode = await createTestEpisode(podcast.id, 'Test Episode')
      
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get(`/api/episodes/${episode.id}`)
      
      expect(response.status).toBe(200)
      expect(response.body.ok).toBe(true)
      expect(response.body.episode.id).toBe(episode.id)
      expect(response.body.episode.title).toBe('Test Episode')
      
      server.close()
    })
    
    it('should return 404 for non-existent episode', async () => {
      const { app } = await import('../src/index.js')
      const server = createTestServer(app)
      const response = await request(server).get('/api/episodes/00000000-0000-0000-0000-000000000000')
      
      expect(response.status).toBe(404)
      expect(response.body.ok).toBe(false)
      
      server.close()
    })
  })
  
  describe('Admin endpoints', () => {
    describe('POST /admin/episodes', () => {
      it('should create an episode with valid data', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({
            podcast_id: podcast.id,
            title: 'New Episode',
            description: 'Episode description',
            price_per_second: '10000',
          })
        
        expect(response.status).toBe(201)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode).toBeDefined()
        expect(response.body.episode.title).toBe('New Episode')
        expect(response.body.episode.status).toBe('draft')
        
        server.close()
      })
      
      it('should reject episode creation without authentication', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes')
          .send({
            podcast_id: podcast.id,
            title: 'New Episode',
          })
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject episode with invalid podcast_id', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({
            podcast_id: 'invalid-uuid',
            title: 'New Episode',
          })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject episode for non-existent podcast', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({
            podcast_id: '00000000-0000-0000-0000-000000000000',
            title: 'New Episode',
          })
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject episode without title', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({
            podcast_id: podcast.id,
            description: 'Only description',
          })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('GET /admin/episodes', () => {
      it('should list episodes for a podcast with admin auth', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        await createTestEpisode(podcast.id, 'Episode 1', { status: 'draft' })
        await createTestEpisode(podcast.id, 'Episode 2', { status: 'published' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get(`/admin/episodes?podcast_id=${podcast.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episodes).toBeInstanceOf(Array)
        expect(response.body.episodes.length).toBe(2)
        
        server.close()
      })
      
      it('should reject listing without podcast_id', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get('/admin/episodes')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject listing without authentication', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server).get('/admin/episodes?podcast_id=123')
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('GET /admin/episodes/:id', () => {
      it('should get episode details', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Test Episode')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.id).toBe(episode.id)
        
        server.close()
      })
      
      it('should return 404 for non-existent episode', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .get('/admin/episodes/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('PUT /admin/episodes/:id', () => {
      it('should update episode title', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Old Title', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: 'New Title' })
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.title).toBe('New Title')
        
        server.close()
      })
      
      it('should allow title/description updates for published episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Published Episode', { status: 'published' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ title: 'New Title', description: 'New Description' })
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.title).toBe('New Title')
        expect(response.body.episode.description).toBe('New Description')
        
        server.close()
      })

      it('should reject price_per_second update for published episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Published Episode', { status: 'published', pricePerSecond: BigInt(100) })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .put(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ price_per_second: 200 })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        expect(response.body.error).toContain('price_per_second')
        
        server.close()
      })
    })
    
    describe('DELETE /admin/episodes/:id', () => {
      it('should delete an episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'To Be Deleted')
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .delete(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        
        const getResponse = await request(server)
          .get(`/admin/episodes/${episode.id}`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(getResponse.status).toBe(404)
        
        server.close()
      })
    })
    
    describe('POST /admin/episodes/:id/publish', () => {
      it('should publish a ready episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Ready Episode', {
          status: 'ready',
          storagePath: 'uploads/test/podcast/episode/source.mp3',
        })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/publish`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.status).toBe('published')
        
        server.close()
      })
      
      it('should reject publishing draft episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Draft Episode', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/publish`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('POST /admin/episodes/:id/status', () => {
      it('should update episode status', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Test Episode', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/status`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ status: 'ready' })
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.status).toBe('ready')
        
        server.close()
      })
      
      it('should reject published status', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Test Episode', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/status`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ status: 'published' })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should return 404 for non-existent episode', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes/00000000-0000-0000-0000-000000000000/status')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ status: 'ready' })
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should return 400 for invalid status', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Test Episode', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/status`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
          .send({ status: 'invalid_status' })
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject without auth', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const episode = await createTestEpisode(podcast.id, 'Test Episode', { status: 'draft' })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/status`)
          .send({ status: 'ready' })
        
        expect(response.status).toBe(401)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
    
    describe('POST /admin/episodes/:id/retry-transcode', () => {
      it('should retry transcoding for failed episode', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const storagePath = `${TEST_UPLOADS_DIR}/test-${Date.now()}/source.mp3`
        await fs.mkdir(path.dirname(storagePath), { recursive: true })
        await fs.writeFile(storagePath, 'test audio data')
        
        const episode = await createTestEpisode(podcast.id, 'Failed Episode', {
          status: 'failed',
          storagePath,
        })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/retry-transcode`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(200)
        expect(response.body.ok).toBe(true)
        expect(response.body.episode.status).toBe('processing')
        
        server.close()
      })
      
      it('should reject retry for non-existent episode', async () => {
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post('/admin/episodes/00000000-0000-0000-0000-000000000000/retry-transcode')
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(404)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
      
      it('should reject retry without auth', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const storagePath = `${TEST_UPLOADS_DIR}/test-${Date.now()}-noauth/source.mp3`
        await fs.mkdir(path.dirname(storagePath), { recursive: true })
        await fs.writeFile(storagePath, 'test audio data')
        
        const episode = await createTestEpisode(podcast.id, 'Failed Episode', {
          status: 'failed',
          storagePath,
        })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/retry-transcode`)
        
        expect(response.status).toBe(401)
        
        server.close()
      })
      
      it('should reject retry if already processing', async () => {
        const podcast = await createTestPodcast('Test Podcast')
        const storagePath = `${TEST_UPLOADS_DIR}/test-${Date.now()}-processing/source.mp3`
        await fs.mkdir(path.dirname(storagePath), { recursive: true })
        await fs.writeFile(storagePath, 'test audio data')
        
        const episode = await createTestEpisode(podcast.id, 'Processing Episode', {
          status: 'processing',
          storagePath,
        })
        
        const { app } = await import('../src/index.js')
        const server = createTestServer(app)
        const response = await request(server)
          .post(`/admin/episodes/${episode.id}/retry-transcode`)
          .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        
        expect(response.status).toBe(400)
        expect(response.body.ok).toBe(false)
        
        server.close()
      })
    })
  })
})
