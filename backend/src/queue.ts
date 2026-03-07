export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TranscodeJob {
  id: string;
  podcastId: string;
  episodeId: string;
  inputPath: string;
  outputDir: string;
  status: JobStatus;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

type JobHandler = (job: TranscodeJob) => Promise<void>;

interface QueueOptions {
  concurrency?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export class QueueError extends Error {
  constructor(
    message: string,
    public readonly code: 'JOB_NOT_FOUND' | 'ALREADY_PROCESSING' | 'HANDLER_NOT_SET',
  ) {
    super(message);
    this.name = 'QueueError';
  }
}

export class TranscodeQueue {
  private jobs = new Map<string, TranscodeJob>();
  private pendingJobs: string[] = [];
  private processingJobs = new Set<string>();
  private handler?: JobHandler;
  private concurrency: number;
  private retryAttempts: number;
  private retryDelayMs: number;
  private isProcessing = false;

  constructor(options: QueueOptions = {}) {
    this.concurrency = options.concurrency ?? 1;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5000;
  }

  setHandler(handler: JobHandler): void {
    this.handler = handler;
  }

  async add(jobData: Omit<TranscodeJob, 'id' | 'status' | 'createdAt'>): Promise<TranscodeJob> {
    const id = `${jobData.podcastId}_${jobData.episodeId}_${Date.now()}`;
    
    const job: TranscodeJob = {
      ...jobData,
      id,
      status: 'pending',
      createdAt: new Date(),
    };

    this.jobs.set(id, job);
    this.pendingJobs.push(id);
    this.processQueue();

    return job;
  }

  getJob(jobId: string): TranscodeJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobsByEpisode(podcastId: string, episodeId: string): TranscodeJob[] {
    return Array.from(this.jobs.values()).filter(
      job => job.podcastId === podcastId && job.episodeId === episodeId,
    );
  }

  getLatestJob(podcastId: string, episodeId: string): TranscodeJob | undefined {
    const jobs = this.getJobsByEpisode(podcastId, episodeId);
    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.handler) return;

    this.isProcessing = true;

    while (this.pendingJobs.length > 0 && this.processingJobs.size < this.concurrency) {
      const jobId = this.pendingJobs.shift();
      if (!jobId) continue;

      const job = this.jobs.get(jobId);
      if (!job) continue;

      this.processingJobs.add(jobId);
      
      this.processJob(job).finally(() => {
        this.processingJobs.delete(jobId);
        this.processQueue();
      });
    }

    this.isProcessing = false;
  }

  private async processJob(job: TranscodeJob): Promise<void> {
    if (!this.handler) {
      throw new QueueError('No handler set', 'HANDLER_NOT_SET');
    }

    job.status = 'processing';
    job.startedAt = new Date();

    let attempts = 0;
    let lastError: Error | undefined;

    while (attempts < this.retryAttempts) {
      try {
        await this.handler(job);
        
        job.status = 'completed';
        job.completedAt = new Date();
        return;
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempts < this.retryAttempts) {
          await this.sleep(this.retryDelayMs);
        }
      }
    }

    job.status = 'failed';
    job.error = lastError?.message;
    job.completedAt = new Date();
  }

  getStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      total: jobs.length,
    };
  }

  clearOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [id, job] of this.jobs.entries()) {
      if ((job.status === 'completed' || job.status === 'failed') && 
          job.completedAt && 
          job.completedAt.getTime() < cutoff) {
        this.jobs.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  pause(): void {
    this.isProcessing = true;
  }

  resume(): void {
    this.isProcessing = false;
    this.processQueue();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const transcodeQueue = new TranscodeQueue({
  concurrency: 2,
  retryAttempts: 3,
  retryDelayMs: 5000,
});

export default transcodeQueue;
