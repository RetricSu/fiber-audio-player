/**
 * API Client for Fiber Audio Player Admin API
 */
import { Podcast, Episode, CreatePodcastRequest, UpdatePodcastRequest, CreateEpisodeRequest, UpdateEpisodeRequest, UploadResponse, PublishResponse } from './types.js';
export interface AdminApiClientOptions {
    baseURL: string;
    apiToken: string;
    timeout?: number;
}
export declare class AdminApiClient {
    private client;
    constructor(options: AdminApiClientOptions);
    /**
     * Verify authentication by calling health endpoint
     */
    verifyAuth(): Promise<boolean>;
    /**
     * Create a new podcast
     */
    createPodcast(request: CreatePodcastRequest): Promise<Podcast>;
    /**
     * List all podcasts (including unpublished)
     */
    listPodcasts(): Promise<Podcast[]>;
    /**
     * Get podcast details
     */
    getPodcast(id: string): Promise<Podcast>;
    /**
     * Update podcast metadata
     */
    updatePodcast(id: string, request: UpdatePodcastRequest): Promise<Podcast>;
    /**
     * Delete a podcast and all its episodes
     */
    deletePodcast(id: string): Promise<string>;
    /**
     * Create a new episode (metadata only)
     */
    createEpisode(request: CreateEpisodeRequest): Promise<Episode>;
    /**
     * List all episodes for a podcast
     */
    listEpisodes(podcastId: string): Promise<Episode[]>;
    /**
     * Get episode details
     */
    getEpisode(id: string): Promise<Episode>;
    /**
     * Update episode metadata
     */
    updateEpisode(id: string, request: UpdateEpisodeRequest): Promise<Episode>;
    /**
     * Delete an episode
     */
    deleteEpisode(id: string): Promise<string>;
    /**
     * Upload audio file for an episode
     */
    uploadEpisodeAudio(episodeId: string, fileBuffer: Buffer, fileName: string, mimeType: string): Promise<UploadResponse>;
    /**
     * Publish an episode
     */
    publishEpisode(id: string): Promise<PublishResponse>;
    /**
     * Poll episode transcoding status until ready or timeout
     */
    pollTranscodingStatus(episodeId: string, options?: {
        intervalMs?: number;
        timeoutMs?: number;
    }): Promise<Episode>;
}
//# sourceMappingURL=api-client.d.ts.map