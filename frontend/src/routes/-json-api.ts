/**
 * JSON:API transport helpers shared by the account access endpoints. They
 * keep media type, error document parsing and header handling in one place so
 * each endpoint module only maps HTTP outcomes to its own result type.
 */
export const jsonApiMediaType = 'application/vnd.api+json'

export interface JsonApiError {
  status: string
  code: string
  detail: string
  source?: { pointer: string }
}

/**
 * Posts a JSON:API document. Resolves to `undefined` when the request never
 * reached the server (offline, DNS, CORS), so callers can report a network
 * failure without inspecting thrown errors.
 */
export async function postJsonApi(
  path: string,
  document: unknown,
): Promise<Response | undefined> {
  try {
    return await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: jsonApiMediaType,
        'Content-Type': jsonApiMediaType,
      },
      body: JSON.stringify(document),
    })
  } catch {
    return undefined
  }
}

/** Reads the `errors` array of an error document, ignoring malformed items. */
export async function readJsonApiErrors(
  response: Response,
): Promise<JsonApiError[]> {
  try {
    const document: unknown = await response.json()
    if (
      typeof document === 'object' &&
      document !== null &&
      'errors' in document &&
      Array.isArray(document.errors)
    ) {
      return document.errors.filter(isJsonApiError)
    }
  } catch {
    // A body that is not JSON is handled the same way as one with no errors.
  }
  return []
}

/**
 * Maps errors to form fields by their JSON pointer, keeping the first error
 * per field. Errors without a known pointer are left out.
 */
export function fieldErrorsByPointer<Field extends string>(
  errors: JsonApiError[],
  pointers: Readonly<Record<string, Field>>,
): Partial<Record<Field, string>> {
  const fieldErrors: Partial<Record<Field, string>> = {}
  for (const error of errors) {
    const field = error.source ? pointers[error.source.pointer] : undefined
    if (field && fieldErrors[field] === undefined) {
      fieldErrors[field] = error.detail
    }
  }
  return fieldErrors
}

/** Parses a delta-seconds `Retry-After` header; the contract guarantees >= 1. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) {
    return undefined
  }
  const seconds = Number(header)
  return seconds >= 1 ? seconds : undefined
}

function isJsonApiError(value: unknown): value is JsonApiError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const error = value as Record<string, unknown>
  const source = error.source as Record<string, unknown> | undefined
  return (
    typeof error.status === 'string' &&
    typeof error.code === 'string' &&
    typeof error.detail === 'string' &&
    (source === undefined || typeof source.pointer === 'string')
  )
}
