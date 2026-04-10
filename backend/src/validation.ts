import { z } from 'zod'
import type { Context } from 'hono'

// ============================================================================
// Podcast Schemas
// ============================================================================

export const createPodcastSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
})

export const updatePodcastSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(255, 'Title must be 255 characters or less').optional(),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
})

// ============================================================================
// Episode Schemas
// ============================================================================

export const createEpisodeSchema = z.object({
  podcast_id: z.string().uuid('Invalid podcast_id format'),
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less'),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
  price_per_second: z.string().regex(/^\d+$/, 'price_per_second must be a valid number string').optional(),
})

export const updateEpisodeSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').max(255, 'Title must be 255 characters or less').optional(),
  description: z.string().max(1000, 'Description must be 1000 characters or less').optional(),
  price_per_second: z.string().regex(/^\d+$/, 'price_per_second must be a valid number string').optional(),
})

export const episodeStatusSchema = z.enum(['draft', 'processing', 'ready', 'published', 'failed', 'archived'])

export const updateEpisodeStatusSchema = z.object({
  status: episodeStatusSchema,
})

// ============================================================================
// Payment/Session Schemas
// ============================================================================

export const createSessionSchema = z.object({
  episodeId: z.string().uuid('Invalid episodeId format'),
  clientKey: z
    .string()
    .min(1, 'clientKey cannot be empty')
    .max(256, 'clientKey must be 256 characters or less')
    .regex(/^[A-Za-z0-9_\-:.]+$/, 'clientKey contains invalid characters')
    .optional(),
})

export const createInvoiceSchema = z.object({
  sessionId: z.string().uuid('Invalid sessionId format'),
  seconds: z.number().int('Seconds must be an integer').min(1, 'Seconds must be at least 1').max(3600, 'Seconds cannot exceed 3600').optional(),
})

export const claimInvoiceSchema = z.object({
  paymentHash: z.string().min(1, 'paymentHash is required'),
})

// ============================================================================
// File Upload Validation
// ============================================================================

export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac']
export const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

export interface FileValidationResult {
  success: boolean
  error?: string
  file?: File
}

export function validateAudioFile(file: File | null): FileValidationResult {
  if (!file) {
    return { success: false, error: 'No file provided' }
  }

  // Validate file type
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    return {
      success: false,
      error: `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}`,
    }
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max allowed: 500MB`,
    }
  }

  return { success: true, file }
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

export interface ValidationSuccess<T> {
  success: true
  data: T
}

export interface ValidationError {
  success: false
  error: string
  details?: z.ZodError['issues']
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError

/**
 * Validate request body against a Zod schema
 */
export async function validateBody<T>(
  c: Context,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await c.req.json()
    const result = schema.parse(body)
    return { success: true, data: result }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((issue: z.ZodIssue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'value'
        return `${path}: ${issue.message}`
      })
      return {
        success: false,
        error: messages.join('; '),
        details: err.issues,
      }
    }
    return { success: false, error: 'Invalid JSON in request body' }
  }
}

export function validateQuery<T>(
  query: Record<string, string | undefined>,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const result = schema.parse(query)
    return { success: true, data: result }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((issue: z.ZodIssue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'value'
        return `${path}: ${issue.message}`
      })
      return {
        success: false,
        error: messages.join('; '),
        details: err.issues,
      }
    }
    return { success: false, error: 'Invalid query parameters' }
  }
}

export function validateParams<T>(
  params: Record<string, string>,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const result = schema.parse(params)
    return { success: true, data: result }
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((issue: z.ZodIssue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'value'
        return `${path}: ${issue.message}`
      })
      return {
        success: false,
        error: messages.join('; '),
        details: err.issues,
      }
    }
    return { success: false, error: 'Invalid route parameters' }
  }
}

// ============================================================================
// Standardized Error Response
// ============================================================================

export interface ErrorResponse {
  ok: false
  error: string
  details?: z.ZodError['issues']
}

export interface SuccessResponse<T> {
  ok: true
  data: T
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(error: string, details?: z.ZodError['issues']): ErrorResponse {
  return { ok: false, error, details }
}

// ============================================================================
// UUID Parameter Schema
// ============================================================================

export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
})
