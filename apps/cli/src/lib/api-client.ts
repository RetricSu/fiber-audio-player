/**
 * API Client for Fiber Audio Player Admin API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import {
  Podcast,
  Episode,
  CreatePodcastRequest,
  UpdatePodcastRequest,
  CreateEpisodeRequest,
  UpdateEpisodeRequest,
  ApiResponse,
  PodcastResponse,
  PodcastsResponse,
  EpisodeResponse,
  EpisodesResponse,
  UploadResponse,
  PublishResponse,
  DeleteResponse,
  ApiError,
} from './types.js';

export interface AdminApiClientOptions {
  baseURL: string;
  apiToken: string;
  timeout?: number;
}

export class AdminApiClient {
  private client: AxiosInstance;

  constructor(options: AdminApiClientOptions) {
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${options.apiToken}`,
        'Content-Type': 'application/json',
      },
      proxy: false, // Disable proxy to prevent HTTP_PROXY/HTTPS_PROXY from affecting local connections
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
        if (error.response) {
          const { status, data } = error.response;
          const message = data?.error || `HTTP Error ${status}`;
          throw new ApiError(message, status, data?.details);
        }
        if (error.request) {
          throw new ApiError('Network error: Unable to reach server');
        }
        throw new ApiError(error.message);
      }
    );
  }

  // ============================================================================
  // Auth
  // ============================================================================

  /**
   * Verify authentication by calling health endpoint
   */
  async verifyAuth(): Promise<boolean> {
    try {
      const response = await this.client.get('/admin/podcasts');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  // ============================================================================
  // Podcast CRUD
  // ============================================================================

  /**
   * Create a new podcast
   */
  async createPodcast(request: CreatePodcastRequest): Promise<Podcast> {
    const response = await this.client.post<PodcastResponse>('/admin/podcasts', request);
    return response.data.podcast;
  }

  /**
   * List all podcasts (including unpublished)
   */
  async listPodcasts(): Promise<Podcast[]> {
    const response = await this.client.get<PodcastsResponse>('/admin/podcasts');
    return response.data.podcasts;
  }

  /**
   * Get podcast details
   */
  async getPodcast(id: string): Promise<Podcast> {
    const response = await this.client.get<PodcastResponse>(`/admin/podcasts/${id}`);
    return response.data.podcast;
  }

  /**
   * Update podcast metadata
   */
  async updatePodcast(id: string, request: UpdatePodcastRequest): Promise<Podcast> {
    const response = await this.client.put<PodcastResponse>(`/admin/podcasts/${id}`, request);
    return response.data.podcast;
  }

  /**
   * Delete a podcast and all its episodes
   */
  async deletePodcast(id: string): Promise<string> {
    const response = await this.client.delete<DeleteResponse>(`/admin/podcasts/${id}`);
    return response.data.message;
  }

  // ============================================================================
  // Episode CRUD
  // ============================================================================

  /**
   * Create a new episode (metadata only)
   */
  async createEpisode(request: CreateEpisodeRequest): Promise<Episode> {
    const response = await this.client.post<EpisodeResponse>('/admin/episodes', request);
    return response.data.episode;
  }

  /**
   * List all episodes for a podcast
   */
  async listEpisodes(podcastId: string): Promise<Episode[]> {
    const response = await this.client.get<EpisodesResponse>('/admin/episodes', {
      params: { podcast_id: podcastId },
    });
    return response.data.episodes;
  }

  /**
   * Get episode details
   */
  async getEpisode(id: string): Promise<Episode> {
    const response = await this.client.get<EpisodeResponse>(`/admin/episodes/${id}`);
    return response.data.episode;
  }

  /**
   * Update episode metadata
   */
  async updateEpisode(id: string, request: UpdateEpisodeRequest): Promise<Episode> {
    const response = await this.client.put<EpisodeResponse>(`/admin/episodes/${id}`, request);
    return response.data.episode;
  }

  /**
   * Delete an episode
   */
  async deleteEpisode(id: string): Promise<string> {
    const response = await this.client.delete<DeleteResponse>(`/admin/episodes/${id}`);
    return response.data.message;
  }

  // ============================================================================
  // Episode Upload & Publish
  // ============================================================================

  /**
   * Upload audio file for an episode
   */
  async uploadEpisodeAudio(
    episodeId: string,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });

    const response = await this.client.post<UploadResponse>(
      `/admin/episodes/${episodeId}/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        maxContentLength: 500 * 1024 * 1024, // 500 MB
        maxBodyLength: 500 * 1024 * 1024,
      }
    );
    return response.data;
  }

  /**
   * Publish an episode
   */
  async publishEpisode(id: string): Promise<PublishResponse> {
    const response = await this.client.post<PublishResponse>(`/admin/episodes/${id}/publish`);
    return response.data;
  }

  // ============================================================================
  // Polling
  // ============================================================================

  /**
   * Poll episode transcoding status until ready or timeout
   */
  async pollTranscodingStatus(
    episodeId: string,
    options: {
      intervalMs?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<Episode> {
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
