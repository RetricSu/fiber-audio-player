/**
 * Utility functions for fap CLI
 */
import { promises as fs } from 'fs';
import path from 'path';
import { ApiError, ValidationError } from './types.js';
// ============================================================================
// Error Formatting
// ============================================================================
/**
 * Format an error for display
 */
export function formatError(error) {
    if (error instanceof ApiError) {
        let message = `API Error`;
        if (error.statusCode) {
            message += ` (${error.statusCode})`;
        }
        message += `: ${error.message}`;
        if (error.details && error.details.length > 0) {
            const detailMessages = error.details.map((d) => `  - ${d.path.join('.')}: ${d.message}`);
            message += '\n' + detailMessages.join('\n');
        }
        return message;
    }
    if (error instanceof ValidationError) {
        return `Validation Error: ${error.message}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
// ============================================================================
// Token Masking
// ============================================================================
/**
 * Mask an API token for display (show only first 4 and last 4 chars)
 */
export function maskToken(token) {
    if (!token)
        return '';
    if (token.length <= 8)
        return '****';
    const first = token.slice(0, 4);
    const last = token.slice(-4);
    return `${first}...${last}`;
}
// ============================================================================
// File Validation
// ============================================================================
// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
];
// Extensions to MIME type mapping
const EXT_TO_MIME = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
};
/**
 * Validate an audio file for upload
 */
export async function validateFile(filePath) {
    // Check if file exists
    try {
        await fs.access(filePath);
    }
    catch {
        return { valid: false, error: `File not found: ${filePath}` };
    }
    // Get file stats
    let stats;
    try {
        stats = await fs.stat(filePath);
    }
    catch (error) {
        return { valid: false, error: `Cannot read file: ${error.message}` };
    }
    // Check if it's a file (not directory)
    if (!stats.isFile()) {
        return { valid: false, error: `Path is not a file: ${filePath}` };
    }
    // Check file size (500 MB limit)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (stats.size > MAX_SIZE) {
        return {
            valid: false,
            error: `File too large: ${formatFileSize(stats.size)} (max: ${formatFileSize(MAX_SIZE)})`,
        };
    }
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
        return {
            valid: false,
            error: `Invalid file type: ${ext || 'unknown'}. Allowed types: ${Object.keys(EXT_TO_MIME).join(', ')}`,
        };
    }
    // Check if MIME type is allowed
    if (!ALLOWED_AUDIO_TYPES.includes(mimeType)) {
        return {
            valid: false,
            error: `Invalid MIME type. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}`,
        };
    }
    return {
        valid: true,
        mimeType,
        size: stats.size,
    };
}
// ============================================================================
// Duration Parsing
// ============================================================================
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
export function parseDuration(input) {
    const trimmed = input.trim();
    // Try time format (HH:MM:SS or MM:SS)
    const timeMatch = trimmed.match(/^(?:(\d+):)?(?:(\d+):)(\d+)$/);
    if (timeMatch) {
        const hours = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        return hours * 3600 + minutes * 60 + seconds;
    }
    // Try suffixed format (e.g., "1h30m", "90s")
    const suffixMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
    if (suffixMatch && (suffixMatch[1] || suffixMatch[2] || suffixMatch[3])) {
        const hours = suffixMatch[1] ? parseInt(suffixMatch[1], 10) : 0;
        const minutes = suffixMatch[2] ? parseInt(suffixMatch[2], 10) : 0;
        const seconds = suffixMatch[3] ? parseInt(suffixMatch[3], 10) : 0;
        // At least one component must be present
        if (hours || minutes || seconds) {
            return hours * 3600 + minutes * 60 + seconds;
        }
    }
    // Try plain seconds
    const plainMatch = trimmed.match(/^\d+$/);
    if (plainMatch) {
        return parseInt(trimmed, 10);
    }
    throw new ValidationError(`Invalid duration format: "${input}". Use formats like "1:30", "90", "2m", "1h30m"`);
}
/**
 * Format seconds into a human-readable duration string
 */
export function formatDuration(seconds) {
    if (seconds < 0)
        return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0)
        parts.push(`${secs}s`);
    return parts.join('');
}
// ============================================================================
// File Size Formatting
// ============================================================================
/**
 * Format bytes into human-readable size
 */
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}
// ============================================================================
// String Utilities
// ============================================================================
/**
 * Truncate a string with ellipsis
 */
export function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return str.slice(0, maxLength - 3) + '...';
}
/**
 * Pad a string to a minimum length
 */
export function pad(str, length, align = 'right') {
    const s = String(str);
    if (s.length >= length)
        return s;
    const padding = ' '.repeat(length - s.length);
    return align === 'left' ? s + padding : padding + s;
}
/**
 * Validate a UUID format
 */
export function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
/**
 * Format a timestamp (milliseconds) to readable date
 */
export function formatTimestamp(ms) {
    return new Date(ms).toLocaleString();
}
//# sourceMappingURL=utils.js.map