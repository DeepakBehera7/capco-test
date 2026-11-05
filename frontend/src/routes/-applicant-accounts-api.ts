export const jsonApiMediaType = 'application/vnd.api+json'

export const applicantAccountsPath = '/api/v1/applicant-accounts'

export interface ApplicantCredentials {
  email: string
  password: string
}

export type CredentialField = keyof ApplicantCredentials

/**
 * Outcome of a registration request. Transport and HTTP details stay in this
 * module; the form only decides how each outcome is presented.
 */
export type RegistrationResult =
  | { kind: 'created' }
  | {
      kind: 'invalid'
      fieldErrors: Partial<Record<CredentialField, string>>
    }
  | { kind: 'email-taken' }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  | { kind: 'network-error' }
  | { kind: 'unexpected' }

interface JsonApiError {
  status: string
  code: string
  detail: string
  source?: { pointer: string }
}

const fieldPointers: Record<string, CredentialField> = {
  '/data/attributes/email': 'email',
  '/data/attributes/password': 'password',
}

/** Registers an Applicant account. Registration never signs the user in. */
export async function createApplicantAccount(
  credentials: ApplicantCredentials,
): Promise<RegistrationResult> {
  let response: Response
  try {
    response = await fetch(applicantAccountsPath, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: jsonApiMediaType,
        'Content-Type': jsonApiMediaType,
      },
      body: JSON.stringify({
        data: {
          type: 'applicant-accounts',
          attributes: {
            email: credentials.email,
            password: credentials.password,
          },
        },
      }),
    })
  } catch {
    return { kind: 'network-error' }
  }

  switch (response.status) {
    case 201:
      return { kind: 'created' }
    case 400:
      return invalidResult(await readErrors(response))
    case 409:
      return { kind: 'email-taken' }
    case 429:
      return {
        kind: 'rate-limited',
        retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
      }
    default:
      return { kind: 'unexpected' }
  }
}

/**
 * Field errors are shown beside their inputs. A 400 without field pointers
 * (for example a malformed document) is a client defect, not something the
 * applicant can correct, so it is reported as unexpected.
 */
function invalidResult(errors: JsonApiError[]): RegistrationResult {
  const fieldErrors: Partial<Record<CredentialField, string>> = {}
  for (const error of errors) {
    const field = error.source ? fieldPointers[error.source.pointer] : undefined
    if (field && fieldErrors[field] === undefined) {
      fieldErrors[field] = error.detail
    }
  }
  return Object.keys(fieldErrors).length > 0
    ? { kind: 'invalid', fieldErrors }
    : { kind: 'unexpected' }
}

async function readErrors(response: Response): Promise<JsonApiError[]> {
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

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) {
    return undefined
  }
  const seconds = Number(header)
  return seconds >= 1 ? seconds : undefined
}
