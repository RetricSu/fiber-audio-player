/**
 * Utility functions for fap CLI
 */
/**
 * Format an error for display
 */
export declare function formatError(error: unknown): string;
/**
 * Mask an API token for display (show only first 4 and last 4 chars)
 */
export declare function maskToken(token: string): string;
export interface FileValidationResult {
    valid: boolean;
    error?: string;
    mimeType?: string;
    size?: number;
}
/**
 * Validate an audio file for upload
 */
export declare function validateFile(filePath: string): Promise<FileValidationResult>;
/**
 * Parse a duration string into seconds
 * Supports formats like:
 * - "1:30" → 90 seconds
 * - "1:30:45" → 5445 seconds
 * - "90" → 90 seconds
 * - "90s" → 90 seconds
 * - "2m" → 120 seconds
 * - "1h" → 3600 seconds
 * - "1h30m" → 5400 seconds
 */
export declare function parseDuration(input: string): number;
/**
 * Format seconds into a human-readable duration string
 */
export declare function formatDuration(seconds: number): string;
/**
 * Format bytes into human-readable size
 */
export declare function formatFileSize(bytes: number): string;
/**
 * Truncate a string with ellipsis
 */
export declare function truncate(str: string, maxLength: number): string;
/**
 * Pad a string to a minimum length
 */
export declare function pad(str: string | number, length: number, align?: 'left' | 'right'): string;
/**
 * Validate a UUID format
 */
export declare function isValidUUID(str: string): boolean;
/**
 * Format a timestamp (milliseconds) to readable date
 */
export declare function formatTimestamp(ms: number): string;
//# sourceMappingURL=utils.d.ts.map