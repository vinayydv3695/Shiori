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
  message: string;
  userMessage: string;
  suggestions: string[];
  technicalDetails: string;
  kind: ErrorKind;
}

export type ErrorKind =
  | "database"
  | "io"
  | "serialization"
  | "rendering"
  | "not_found"
  | "file_not_found"
  | "format"
  | "metadata"
  | "duplicate"
  | "invalid_operation"
  | "permission"
  | "unsupported"
  | "validation"
  | "corrupted"
  | "size_limit"
  | "unknown";

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
    return error;
  }

  // 2. String — may be JSON or a plain message
  const errorStr =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error);

  // Try parsing as JSON
  try {
    const parsed = JSON.parse(errorStr);
    if (isShioriError(parsed)) {
      return parsed;
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
    kind: "unknown",
  };
}

/**
 * Get a user-friendly message from any error value.
 * Shorthand for `parseError(error).userMessage`.
 */
export function getUserMessage(error: unknown): string {
  return parseError(error).userMessage;
}

/**
 * Check whether an error is of a specific kind.
 */
export function isErrorKind(error: unknown, kind: ErrorKind): boolean {
  return parseError(error).kind === kind;
}

/**
 * Check whether an error is a "not found" variant.
 */
export function isNotFoundError(error: unknown): boolean {
  const parsed = parseError(error);
  return parsed.kind === "not_found" || parsed.kind === "file_not_found";
}

/**
 * Check whether an error is a validation error.
 */
export function isValidationError(error: unknown): boolean {
  return parseError(error).kind === "validation";
}

/**
 * Extracts the best available human-readable message from a caught error,
 * without requiring the error to match the full `ShioriError` shape.
 *
 * Every Tauri command in this codebase that returns `Result<T>` (the `ShioriError`
 * alias, see `src-tauri/src/error.rs`) rejects the frontend's `invoke()` promise with
 * a structured object shape: `{ message, userMessage, suggestions, technicalDetails, kind }`
 * — not a plain string and not a JS `Error`. Calling `String(err)` or `${err}` directly
 * on that plain object (which has no custom `toString()`) produces the literal string
 * "[object Object]" instead of anything useful.
 *
 * Fallback chain: `err.userMessage` -> `err.message` -> `String(err)`. Unlike
 * `getUserMessage`/`parseError` above, this does not require every ShioriError field
 * to be present (just whichever of `userMessage`/`message` exists on the caught value),
 * so it degrades gracefully even if the error shape is only partially ShioriError-like.
 */
export function getErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }

  if (err && typeof err === "object") {
    const candidate = err as { userMessage?: unknown; message?: unknown };
    if (
      typeof candidate.userMessage === "string" &&
      candidate.userMessage.trim().length > 0
    ) {
      return candidate.userMessage;
    }
    if (
      typeof candidate.message === "string" &&
      candidate.message.trim().length > 0
    ) {
      return candidate.message;
    }
  }

  return String(err);
}

// ── Internal ─────────────────────────────────────────

function isShioriError(value: unknown): value is ShioriError {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.message === "string" &&
    typeof obj.userMessage === "string" &&
    Array.isArray(obj.suggestions) &&
    typeof obj.kind === "string"
  );
}
