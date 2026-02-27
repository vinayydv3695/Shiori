/**
 * Frontend error utility for parsing structured errors from the Tauri backend.
 *
 * The backend serializes `ShioriError` as:
 * {
 *   message: string,          // Technical error message
 *   userMessage: string,      // User-friendly description
 *   suggestions: string[],    // Recovery suggestions
 *   technicalDetails: string, // Debug info (for copy-to-clipboard)
 *   kind: string,             // Error category
 * }
 *
 * Tauri wraps command errors in a string, so we may receive either
 * a raw JSON string or a plain error message.
 */

export interface ShioriError {
  message: string
  userMessage: string
  suggestions: string[]
  technicalDetails: string
  kind: ErrorKind
}

export type ErrorKind =
  | 'database'
  | 'io'
  | 'serialization'
  | 'rendering'
  | 'not_found'
  | 'file_not_found'
  | 'format'
  | 'metadata'
  | 'duplicate'
  | 'invalid_operation'
  | 'permission'
  | 'unsupported'
  | 'validation'
  | 'corrupted'
  | 'size_limit'
  | 'unknown'

/**
 * Parse a Tauri invoke error into a structured `ShioriError`.
 *
 * Tauri invoke failures come as either:
 *   - A JSON string of our structured error object
 *   - A plain string error message
 *   - An Error object with a `.message`
 *   - An unknown value
 */
export function parseError(error: unknown): ShioriError {
  // 1. Already a ShioriError-shaped object
  if (isShioriError(error)) {
    return error
  }

  // 2. String — may be JSON or a plain message
  const errorStr = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : String(error)

  // Try parsing as JSON
  try {
    const parsed = JSON.parse(errorStr)
    if (isShioriError(parsed)) {
      return parsed
    }
  } catch {
    // Not JSON — fall through
  }

  // 3. Fallback: wrap plain string as a generic error
  return {
    message: errorStr,
    userMessage: errorStr,
    suggestions: [],
    technicalDetails: errorStr,
    kind: 'unknown',
  }
}

/**
 * Get a user-friendly message from any error value.
 * Shorthand for `parseError(error).userMessage`.
 */
export function getUserMessage(error: unknown): string {
  return parseError(error).userMessage
}

/**
 * Check whether an error is of a specific kind.
 */
export function isErrorKind(error: unknown, kind: ErrorKind): boolean {
  return parseError(error).kind === kind
}

/**
 * Check whether an error is a "not found" variant.
 */
export function isNotFoundError(error: unknown): boolean {
  const parsed = parseError(error)
  return parsed.kind === 'not_found' || parsed.kind === 'file_not_found'
}

/**
 * Check whether an error is a validation error.
 */
export function isValidationError(error: unknown): boolean {
  return parseError(error).kind === 'validation'
}

// ── Internal ─────────────────────────────────────────

function isShioriError(value: unknown): value is ShioriError {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.message === 'string' &&
    typeof obj.userMessage === 'string' &&
    Array.isArray(obj.suggestions) &&
    typeof obj.kind === 'string'
  )
}
