/**
 * API Client for Fiber Audio Player Admin API
 */
import axios from 'axios';
import FormData from 'form-data';
import { ApiError, } from './types.js';
export class AdminApiClient {
    client;
    constructor(options) {
        this.client = axios.create({
            baseURL: options.baseURL,
            timeout: options.timeout || 30000,
            headers: {
                'Authorization': `Bearer ${options.apiToken}`,
                'Content-Type': 'application/json',
            },
        });
        // Response interceptor for error handling
        this.client.interceptors.response.use((response) => response, (error) => {
            if (error.response) {
                const { status, data } = error.response;
                const message = data?.error || `HTTP Error ${status}`;
                throw new ApiError(message, status, data?.details);
            }
            if (error.request) {
                throw new ApiError('Network error: Unable to reach server');
            }
            throw new ApiError(error.message);
        });
    }
    // ============================================================================
    // Auth
    // ============================================================================
    /**
     * Verify authentication by calling health endpoint
     */
    async verifyAuth() {
        try {
            const response = await this.client.get('/admin/podcasts');
            return response.status === 200;
        }
        catch (error) {
            return false;
        }
    }
    // ============================================================================
    // Podcast CRUD
    // ============================================================================
    /**
     * Create a new podcast
     */
    async createPodcast(request) {
        const response = await this.client.post('/admin/podcasts', request);
        return response.data.podcast;
    }
    /**
     * List all podcasts (including unpublished)
     */
    async listPodcasts() {
        const response = await this.client.get('/admin/podcasts');
        return response.data.podcasts;
    }
    /**
     * Get podcast details
     */
    async getPodcast(id) {
        const response = await this.client.get(`/admin/podcasts/${id}`);
        return response.data.podcast;
    }
    /**
     * Update podcast metadata
     */
    async updatePodcast(id, request) {
        const response = await this.client.put(`/admin/podcasts/${id}`, request);
        return response.data.podcast;
    }
    /**
     * Delete a podcast and all its episodes
     */
    async deletePodcast(id) {
        const response = await this.client.delete(`/admin/podcasts/${id}`);
        return response.data.message;
    }
    // ============================================================================
    // Episode CRUD
    // ============================================================================
    /**
     * Create a new episode (metadata only)
     */
    async createEpisode(request) {
        const response = await this.client.post('/admin/episodes', request);
        return response.data.episode;
    }
    /**
     * List all episodes for a podcast
     */
    async listEpisodes(podcastId) {
        const response = await this.client.get('/admin/episodes', {
            params: { podcast_id: podcastId },
        });
        return response.data.episodes;
    }
    /**
     * Get episode details
     */
    async getEpisode(id) {
        const response = await this.client.get(`/admin/episodes/${id}`);
        return response.data.episode;
    }
    /**
     * Update episode metadata
     */
    async updateEpisode(id, request) {
        const response = await this.client.put(`/admin/episodes/${id}`, request);
        return response.data.episode;
    }
    /**
     * Delete an episode
     */
    async deleteEpisode(id) {
        const response = await this.client.delete(`/admin/episodes/${id}`);
        return response.data.message;
    }
    // ============================================================================
    // Episode Upload & Publish
    // ============================================================================
    /**
     * Upload audio file for an episode
     */
    async uploadEpisodeAudio(episodeId, fileBuffer, fileName, mimeType) {
        const formData = new FormData();
        formData.append('file', fileBuffer, {
            filename: fileName,
            contentType: mimeType,
        });
        const response = await this.client.post(`/admin/episodes/${episodeId}/upload`, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            maxContentLength: 500 * 1024 * 1024, // 500 MB
            maxBodyLength: 500 * 1024 * 1024,
        });
        return response.data;
    }
    /**
     * Publish an episode
     */
    async publishEpisode(id) {
        const response = await this.client.post(`/admin/episodes/${id}/publish`);
        return response.data;
    }
    // ============================================================================
    // Polling
    // ============================================================================
    /**
     * Poll episode transcoding status until ready or timeout
     */
    async pollTranscodingStatus(episodeId, options = {}) {
        const { intervalMs = 5000, timeoutMs = 300000 } = options; // 5s interval, 5min timeout
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const episode = await this.getEpisode(episodeId);
            if (episode.status === 'ready') {
                return episode;
            }
            if (episode.status === 'published') {
                throw new ApiError('Episode is already published');
            }
            if (episode.status === 'draft') {
                throw new ApiError('Episode has no uploaded file (status: draft)');
            }
            // Still processing, wait and retry
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
        throw new ApiError('Transcoding timeout: Episode did not become ready in time');
    }
}
//# sourceMappingURL=api-client.js.map