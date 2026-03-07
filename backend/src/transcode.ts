import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { transcodeQueue, type TranscodeJob } from './queue.js';

export interface TranscodeResult {
  success: boolean;
  duration?: number;
  segmentCount?: number;
  playlistPath?: string;
  keyPath?: string;
  error?: string;
}

export interface TranscodeOptions {
  segmentDuration?: number;
  audioBitrate?: string;
  targetLoudness?: string;
}

export class TranscodeError extends Error {
  constructor(
    message: string,
    public readonly code: 'FFMPEG_NOT_FOUND' | 'INVALID_INPUT' | 'OUTPUT_DIR_FAILED' | 'FFMPEG_FAILED' | 'CLEANUP_FAILED',
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'TranscodeError';
  }
}

const DEFAULT_OPTIONS: Required<TranscodeOptions> = {
  segmentDuration: 6,
  audioBitrate: '128k',
  targetLoudness: '-16',
};

async function generateEncryptionKey(outputDir: string): Promise<{ keyPath: string; keyInfoPath: string; ivHex: string }> {
  const keyPath = path.join(outputDir, 'enc.key');
  const keyInfoPath = path.join(outputDir, 'enc.keyinfo');
  
  const key = randomBytes(16);
  const iv = randomBytes(16);
  const ivHex = iv.toString('hex');
  
  await fs.writeFile(keyPath, key);
  
  const keyInfoContent = `enc.key\n${keyPath}\n${ivHex}\n`;
  await fs.writeFile(keyInfoPath, keyInfoContent);
  
  return { keyPath, keyInfoPath, ivHex };
}

async function cleanupHlsFiles(outputDir: string): Promise<void> {
  try {
    const files = await fs.readdir(outputDir);
    const hlsFiles = files.filter(f => 
      f.endsWith('.ts') || 
      f === 'playlist.m3u8' || 
      f === 'enc.keyinfo'
    );
    
    for (const file of hlsFiles) {
      await fs.unlink(path.join(outputDir, file));
    }
  } catch {}
}

function runFFmpeg(
  inputPath: string,
  outputDir: string,
  keyInfoPath: string,
  options: Required<TranscodeOptions>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    
    const args = [
      '-y',
      '-i', inputPath,
      '-c:a', 'aac',
      '-b:a', options.audioBitrate,
      '-af', `loudnorm=I=${options.targetLoudness}:TP=-1.5:LRA=11`,
      '-f', 'hls',
      '-hls_time', String(options.segmentDuration),
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      '-hls_key_info_file', keyInfoPath,
      playlistPath,
    ];
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stderr = '';
    
    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new TranscodeError(
          `FFmpeg exited with code ${code}: ${stderr}`,
          'FFMPEG_FAILED',
        ));
      }
    });
    
    ffmpeg.on('error', (error) => {
      if (error.message?.includes('ENOENT')) {
        reject(new TranscodeError(
          'FFmpeg not found. Please install FFmpeg.',
          'FFMPEG_NOT_FOUND',
          error,
        ));
      } else {
        reject(new TranscodeError(
          `Failed to start FFmpeg: ${error.message}`,
          'FFMPEG_FAILED',
          error,
        ));
      }
    });
  });
}

async function extractDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    ffprobe.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    ffprobe.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) {
          reject(new TranscodeError(
            `Failed to parse duration from ffprobe output: ${stdout}`,
            'FFMPEG_FAILED',
          ));
        } else {
          resolve(Math.round(duration));
        }
      } else {
        reject(new TranscodeError(
          `ffprobe exited with code ${code}: ${stderr}`,
          'FFMPEG_FAILED',
        ));
      }
    });
    
    ffprobe.on('error', (error) => {
      reject(new TranscodeError(
        `Failed to run ffprobe: ${error.message}`,
        'FFMPEG_FAILED',
        error,
      ));
    });
  });
}

async function countSegments(outputDir: string): Promise<number> {
  try {
    const files = await fs.readdir(outputDir);
    return files.filter(f => f.startsWith('segment_') && f.endsWith('.ts')).length;
  } catch {
    return 0;
  }
}

export async function transcodeEpisode(
  podcastId: string,
  episodeId: string,
  inputPath: string,
  options: TranscodeOptions = {},
): Promise<TranscodeResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    await fs.access(inputPath);
  } catch {
    return {
      success: false,
      error: `Input file not found: ${inputPath}`,
    };
  }
  
  const hlsDir = path.join(path.dirname(inputPath), 'hls');
  try {
    await fs.mkdir(hlsDir, { recursive: true });
  } catch (error) {
    return {
      success: false,
      error: `Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  
  let keyInfoPath: string | undefined;
  
  try {
    await cleanupHlsFiles(hlsDir);
    
    const { keyPath, keyInfoPath: kip } = await generateEncryptionKey(hlsDir);
    keyInfoPath = kip;
    
    await runFFmpeg(inputPath, hlsDir, keyInfoPath, opts);
    
    await fs.unlink(keyInfoPath);
    
    const duration = await extractDuration(inputPath);
    const segmentCount = await countSegments(hlsDir);
    
    return {
      success: true,
      duration,
      segmentCount,
      playlistPath: path.join(hlsDir, 'playlist.m3u8'),
      keyPath,
    };
  } catch (error) {
    await cleanupHlsFiles(hlsDir);
    
    return {
      success: false,
      error: error instanceof TranscodeError 
        ? error.message 
        : `Transcoding failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function updateEpisodeStatus(
  episodeId: string,
  status: 'draft' | 'processing' | 'ready' | 'published' | 'archived',
  duration?: number,
): Promise<void> {
  const stmt = db.prepare(
    'UPDATE episodes SET status = ?, duration = COALESCE(?, duration) WHERE id = ?'
  );
  stmt.run(status, duration ?? null, episodeId);
}

async function processTranscodeJob(job: TranscodeJob): Promise<void> {
  await updateEpisodeStatus(job.episodeId, 'processing');
  
  const result = await transcodeEpisode(
    job.podcastId,
    job.episodeId,
    job.inputPath,
  );
  
  if (!result.success) {
    throw new Error(result.error || 'Transcoding failed');
  }
  
  await updateEpisodeStatus(job.episodeId, 'ready', result.duration);
}

export function initializeTranscodeQueue(): void {
  transcodeQueue.setHandler(processTranscodeJob);
}

export async function queueTranscodeJob(
  podcastId: string,
  episodeId: string,
  inputPath: string,
): Promise<TranscodeJob> {
  const hlsDir = path.join(path.dirname(inputPath), 'hls');
  
  const job = await transcodeQueue.add({
    podcastId,
    episodeId,
    inputPath,
    outputDir: hlsDir,
  });
  
  return job;
}

export function getTranscodeQueueStats() {
  return transcodeQueue.getStats();
}

export const transcodeService = {
  transcodeEpisode,
  updateEpisodeStatus,
  queueTranscodeJob,
  initializeTranscodeQueue,
  getTranscodeQueueStats,
};

export default transcodeService;
