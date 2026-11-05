/**
 * JSON:API transport helpers shared by every endpoint module. They keep media
 * type, CSRF and error document handling in one place so each endpoint module
 * only maps HTTP outcomes to its own result type.
 */
export const jsonApiMediaType = 'application/vnd.api+json'

export interface JsonApiError {
  status: string
  code: string
  detail: string
  source?: { pointer: string }
}

export interface JsonApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** JSON:API document sent as the request body. */
  document?: unknown
  /** Multipart body, for file uploads. Takes precedence over `document`. */
  formData?: FormData
}

/**
 * Sends a request with the JSON:API headers and the session cookie. State
 * changing requests also carry the CSRF token the API issued at sign-in.
 * Resolves to `undefined` when the request never reached the server (offline,
 * DNS, CORS), so callers can report a network failure without inspecting
 * thrown errors.
 */
export async function requestJsonApi(
  path: string,
  { method = 'GET', document: jsonDocument, formData }: JsonApiRequest = {},
): Promise<Response | undefined> {
  const headers: Record<string, string> = { Accept: jsonApiMediaType }
  let body: BodyInit | undefined
  if (formData !== undefined) {
    // The browser sets the multipart Content-Type with its boundary.
    body = formData
  } else if (jsonDocument !== undefined) {
    headers['Content-Type'] = jsonApiMediaType
    body = JSON.stringify(jsonDocument)
  }
  const csrfToken = method === 'GET' ? undefined : readCsrfToken()
  if (csrfToken !== undefined) {
    headers['X-XSRF-TOKEN'] = csrfToken
  }
  try {
    return await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body,
    })
  } catch {
    return undefined
  }
}

/** Posts a JSON:API document; see {@link requestJsonApi}. */
export function postJsonApi(
  path: string,
  document: unknown,
): Promise<Response | undefined> {
  return requestJsonApi(path, { method: 'POST', document })
}

/** Reads the JSON body of a response, or `undefined` when it is not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

/** First error `detail` of an error document, when the API sent one. */
export async function readFirstErrorDetail(
  response: Response,
): Promise<string | undefined> {
  const [first] = await readJsonApiErrors(response)
  return first?.detail
}

/** The API sets XSRF-TOKEN as a readable cookie when the Applicant signs in. */
function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }
  for (const cookie of document.cookie.split(';')) {
    const [name, ...value] = cookie.trim().split('=')
    if (name === 'XSRF-TOKEN') {
      return decodeURIComponent(value.join('='))
    }
  }
  return undefined
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
