import { promises as fs, createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import stream from "node:stream";
import util from "node:util";

const pipeline = util.promisify(stream.pipeline);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage root directory
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// File size limits
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Allowed MIME types for audio files
const ALLOWED_MIME_TYPES = new Set(["audio/mpeg", "audio/mp3"]);

// File extension mapping
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
};

// Storage error types
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: StorageErrorCode,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type StorageErrorCode =
  | "INVALID_PATH"
  | "FILE_TOO_LARGE"
  | "INVALID_MIME_TYPE"
  | "FILE_NOT_FOUND"
  | "DIRECTORY_CREATE_FAILED"
  | "UPLOAD_FAILED"
  | "DELETE_FAILED"
  | "READ_FAILED";

// Storage result types
export interface UploadResult {
  episodeId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface FileInfo {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
  modifiedAt: Date;
}

/**
 * Validates and sanitizes a path component to prevent directory traversal attacks
 */
function sanitizePathComponent(component: string): string {
  // Remove any path separators and null bytes
  const sanitized = component
    .replace(/[/\\]/g, "")
    .replace(/\0/g, "")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new StorageError(
      `Invalid path component: ${component}`,
      "INVALID_PATH",
    );
  }

  return sanitized;
}

/**
 * Builds the storage path for a podcast episode
 * Structure: uploads/{podcast_id}/{episode_id}/{filename}
 */
function buildStoragePath(
  podcastId: string,
  episodeId: string,
  fileName: string,
): string {
  const safePodcastId = sanitizePathComponent(podcastId);
  const safeEpisodeId = sanitizePathComponent(episodeId);
  const safeFileName = sanitizePathComponent(fileName);

  return path.join(UPLOADS_DIR, safePodcastId, safeEpisodeId, safeFileName);
}

/**
 * Gets the episode directory path
 */
function getEpisodeDirectory(podcastId: string, episodeId: string): string {
  const safePodcastId = sanitizePathComponent(podcastId);
  const safeEpisodeId = sanitizePathComponent(episodeId);

  return path.join(UPLOADS_DIR, safePodcastId, safeEpisodeId);
}

/**
 * Gets the podcast directory path
 */
function getPodcastDirectory(podcastId: string): string {
  const safePodcastId = sanitizePathComponent(podcastId);
  return path.join(UPLOADS_DIR, safePodcastId);
}

/**
 * Ensures the uploads base directory exists
 */
async function ensureUploadsDirectory(): Promise<void> {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Validates MIME type against allowed types
 */
function validateMimeType(mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new StorageError(
      `Invalid MIME type: ${mimeType}. Allowed types: ${Array.from(ALLOWED_MIME_TYPES).join(", ")}`,
      "INVALID_MIME_TYPE",
    );
  }
}

/**
 * Storage service for managing audio file uploads, retrieval, and deletion
 */
export class StorageService {
  /**
   * Initialize the storage service
   * Ensures the base uploads directory exists
   */
  static async initialize(): Promise<void> {
    await ensureUploadsDirectory();
  }

  /**
   * Upload an audio file
   * 
   * @param podcastId - The podcast ID
   * @param fileStream - Readable stream of the file data
   * @param mimeType - MIME type of the file
   * @param fileSize - Expected file size in bytes (for validation)
   * @param originalFileName - Original file name (for reference)
   * @returns UploadResult with episode ID and file path
   */
  static async upload(
    podcastId: string,
    fileStream: stream.Readable,
    mimeType: string,
    fileSize: number,
    originalFileName?: string,
  ): Promise<UploadResult> {
    // Validate MIME type
    validateMimeType(mimeType);

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      throw new StorageError(
        `File size ${fileSize} exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
        "FILE_TOO_LARGE",
      );
    }

    // Generate unique episode ID
    const episodeId = randomUUID();

    // Determine file extension
    const extension = MIME_TYPE_EXTENSIONS[mimeType] || ".mp3";
    const fileName = `source${extension}`;

    // Build storage path
    const episodeDir = getEpisodeDirectory(podcastId, episodeId);
    const filePath = path.join(episodeDir, fileName);

    try {
      // Create directory structure
      await fs.mkdir(episodeDir, { recursive: true });
    } catch (error) {
      throw new StorageError(
        `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
        "DIRECTORY_CREATE_FAILED",
      );
    }

    // Track actual bytes written
    let bytesWritten = 0;

    // Create a transform stream to count bytes and enforce size limit
    const sizeLimiter = new stream.Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytesWritten += chunk.length;
        
        if (bytesWritten > MAX_FILE_SIZE) {
          callback(new StorageError(
            `File exceeded maximum size of ${MAX_FILE_SIZE} bytes`,
            "FILE_TOO_LARGE",
          ));
          return;
        }
        
        callback(null, chunk);
      },
    });

    try {
      // Stream file to disk
      const writeStream = createWriteStream(filePath);
      await pipeline(fileStream, sizeLimiter, writeStream);

      // Verify the file was written
      const stats = await fs.stat(filePath);
      
      return {
        episodeId,
        filePath,
        fileName: originalFileName || fileName,
        fileSize: stats.size,
        mimeType,
      };
    } catch (error) {
      // Clean up partial file on error
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
      
      if (error instanceof StorageError) {
        throw error;
      }
      
      throw new StorageError(
        `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
        "UPLOAD_FAILED",
      );
    }
  }

  /**
   * Retrieve file information
   * 
   * @param podcastId - The podcast ID
   * @param episodeId - The episode ID
   * @returns FileInfo with metadata
   */
  static async getFileInfo(
    podcastId: string,
    episodeId: string,
  ): Promise<FileInfo> {
    const episodeDir = getEpisodeDirectory(podcastId, episodeId);
    
    try {
      // Find the audio file in the episode directory
      const files = await fs.readdir(episodeDir);
      const audioFile = files.find(f => f.startsWith('source.') && (f.endsWith('.mp3')));
      
      if (!audioFile) {
        throw new StorageError(
          `Audio file not found for episode ${episodeId}`,
          "FILE_NOT_FOUND",
        );
      }

      const filePath = path.join(episodeDir, audioFile);
      const stats = await fs.stat(filePath);

      // Determine MIME type from extension
      const ext = path.extname(audioFile);
      const mimeType = ext === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';

      return {
        filePath,
        fileName: audioFile,
        fileSize: stats.size,
        mimeType,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Episode ${episodeId} not found`,
          "FILE_NOT_FOUND",
        );
      }
      
      throw new StorageError(
        `Failed to read file info: ${error instanceof Error ? error.message : String(error)}`,
        "READ_FAILED",
      );
    }
  }

  /**
   * Retrieve file as a readable stream
   * 
   * @param podcastId - The podcast ID
   * @param episodeId - The episode ID
   * @returns Readable stream of the file
   */
  static async getFileStream(
    podcastId: string,
    episodeId: string,
  ): Promise<{ stream: stream.Readable; fileInfo: FileInfo }> {
    const fileInfo = await this.getFileInfo(podcastId, episodeId);
    
    try {
      const fileStream = stream.Readable.from(await fs.readFile(fileInfo.filePath));
      return { stream: fileStream, fileInfo };
    } catch (error) {
      throw new StorageError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        "READ_FAILED",
      );
    }
  }

  /**
   * Delete an episode and all its files
   * 
   * @param podcastId - The podcast ID
   * @param episodeId - The episode ID
   */
  static async deleteEpisode(
    podcastId: string,
    episodeId: string,
  ): Promise<void> {
    const episodeDir = getEpisodeDirectory(podcastId, episodeId);
    
    try {
      // Check if directory exists
      await fs.access(episodeDir);
      
      // Recursively remove episode directory
      await fs.rm(episodeDir, { recursive: true, force: true });
      
      // Try to clean up parent podcast directory if empty
      const podcastDir = getPodcastDirectory(podcastId);
      try {
        const files = await fs.readdir(podcastDir);
        if (files.length === 0) {
          await fs.rmdir(podcastDir);
        }
      } catch {
        // Ignore cleanup errors for parent directory
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Episode ${episodeId} not found`,
          "FILE_NOT_FOUND",
        );
      }
      
      throw new StorageError(
        `Failed to delete episode: ${error instanceof Error ? error.message : String(error)}`,
        "DELETE_FAILED",
      );
    }
  }

  /**
   * Delete an entire podcast and all its episodes
   * 
   * @param podcastId - The podcast ID
   */
  static async deletePodcast(podcastId: string): Promise<void> {
    const podcastDir = getPodcastDirectory(podcastId);
    
    try {
      // Check if directory exists
      await fs.access(podcastDir);
      
      // Recursively remove podcast directory
      await fs.rm(podcastDir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new StorageError(
          `Podcast ${podcastId} not found`,
          "FILE_NOT_FOUND",
        );
      }
      
      throw new StorageError(
        `Failed to delete podcast: ${error instanceof Error ? error.message : String(error)}`,
        "DELETE_FAILED",
      );
    }
  }

  /**
   * Check if an episode exists
   * 
   * @param podcastId - The podcast ID
   * @param episodeId - The episode ID
   * @returns boolean indicating if episode exists
   */
  static async episodeExists(
    podcastId: string,
    episodeId: string,
  ): Promise<boolean> {
    try {
      const fileInfo = await this.getFileInfo(podcastId, episodeId);
      return !!fileInfo;
    } catch {
      return false;
    }
  }

  /**
   * List all episodes for a podcast
   * 
   * @param podcastId - The podcast ID
   * @returns Array of episode IDs
   */
  static async listEpisodes(podcastId: string): Promise<string[]> {
    const podcastDir = getPodcastDirectory(podcastId);
    
    try {
      const entries = await fs.readdir(podcastDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get storage statistics for a podcast
   * 
   * @param podcastId - The podcast ID
   * @returns Total size in bytes and episode count
   */
  static async getPodcastStats(podcastId: string): Promise<{ totalSize: number; episodeCount: number }> {
    const episodeIds = await this.listEpisodes(podcastId);
    let totalSize = 0;
    
    for (const episodeId of episodeIds) {
      try {
        const fileInfo = await this.getFileInfo(podcastId, episodeId);
        totalSize += fileInfo.fileSize;
      } catch {
        // Skip episodes that can't be read
      }
    }
    
    return {
      totalSize,
      episodeCount: episodeIds.length,
    };
  }
}

// Export singleton instance methods for convenience
export const storage = {
  initialize: StorageService.initialize,
  upload: StorageService.upload,
  getFileInfo: StorageService.getFileInfo,
  getFileStream: StorageService.getFileStream,
  deleteEpisode: StorageService.deleteEpisode,
  deletePodcast: StorageService.deletePodcast,
  episodeExists: StorageService.episodeExists,
  listEpisodes: StorageService.listEpisodes,
  getPodcastStats: StorageService.getPodcastStats,
};

export default storage;
