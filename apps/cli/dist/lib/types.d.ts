/**
 * Type definitions for the fap CLI
 */
export type EpisodeStatus = 'draft' | 'processing' | 'ready' | 'published';
export interface Podcast {
    id: string;
    title: string;
    description: string;
    created_at: number;
}
export interface Episode {
    id: string;
    podcast_id: string;
    title: string;
    description: string;
    duration: number | null;
    storage_path: string;
    price_per_second: string;
    status: EpisodeStatus;
    created_at: number;
}
export interface CreatePodcastRequest {
    title: string;
    description?: string;
}
export interface UpdatePodcastRequest {
    title?: string;
    description?: string;
}
export interface CreateEpisodeRequest {
    podcast_id: string;
    title: string;
    description?: string;
    price_per_second?: string;
}
export interface UpdateEpisodeRequest {
    title?: string;
    description?: string;
    price_per_second?: string;
}
export interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
    details?: ValidationErrorDetail[];
}
export interface ValidationErrorDetail {
    path: string[];
    message: string;
}
export interface PodcastResponse {
    ok: true;
    podcast: Podcast;
}
export interface PodcastsResponse {
    ok: true;
    podcasts: Podcast[];
}
export interface EpisodeResponse {
    ok: true;
    episode: Episode;
}
export interface EpisodesResponse {
    ok: true;
    episodes: Episode[];
}
export interface UploadResponse {
    ok: true;
    episode: Episode;
    message: string;
}
export interface PublishResponse {
    ok: true;
    episode: Episode;
    message: string;
}
export interface DeleteResponse {
    ok: true;
    message: string;
}
export interface Config {
    apiUrl: string;
    apiToken: string;
}
export declare class ApiError extends Error {
    statusCode?: number | undefined;
    details?: ValidationErrorDetail[] | undefined;
    constructor(message: string, statusCode?: number | undefined, details?: ValidationErrorDetail[] | undefined);
}
export declare class ConfigError extends Error {
    constructor(message: string);
}
export declare class ValidationError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=types.d.ts.map