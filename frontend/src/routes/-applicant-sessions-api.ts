import {
  credentialPointers,
  type ApplicantCredentials,
  type CredentialField,
} from './-applicant-accounts-api'
import {
  fieldErrorsByPointer,
  parseRetryAfter,
  postJsonApi,
  readJsonApiErrors,
} from './-json-api'
import { isSafeJourneyPath } from './-return-target'

export const applicantSessionsPath = '/api/v1/applicant-sessions'

/**
 * Outcome of a sign-in request. Unknown emails and wrong passwords share one
 * `invalid-credentials` outcome, matching the API, so the UI cannot reveal
 * whether an email address is registered.
 */
export type SignInResult =
  | { kind: 'signed-in'; journeyHref: string }
  | {
      kind: 'invalid'
      fieldErrors: Partial<Record<CredentialField, string>>
    }
  | { kind: 'invalid-credentials' }
  | { kind: 'rate-limited'; retryAfterSeconds?: number }
  | { kind: 'network-error' }
  | { kind: 'unexpected' }

/**
 * Signs an Applicant in. On success the API sets the HttpOnly session cookie
 * and the XSRF-TOKEN cookie on the same-origin response; the browser stores
 * them, so the client only needs the journey URL from the body.
 */
export async function createApplicantSession(
  credentials: ApplicantCredentials,
): Promise<SignInResult> {
  const response = await postJsonApi(applicantSessionsPath, {
    data: {
      type: 'applicant-sessions',
      attributes: {
        email: credentials.email,
        password: credentials.password,
      },
    },
  })
  if (response === undefined) {
    return { kind: 'network-error' }
  }

  switch (response.status) {
    case 201: {
      const journeyHref = await readJourneyHref(response)
      return journeyHref === undefined
        ? { kind: 'unexpected' }
        : { kind: 'signed-in', journeyHref }
    }
    case 400: {
      const fieldErrors = fieldErrorsByPointer(
        await readJsonApiErrors(response),
        credentialPointers,
      )
      return Object.keys(fieldErrors).length > 0
        ? { kind: 'invalid', fieldErrors }
        : { kind: 'unexpected' }
    }
    case 401:
      return { kind: 'invalid-credentials' }
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
 * Reads `data.attributes.href` from the session document. The href is only
 * followed when it is a local applicant journey path, so a tampered or
 * misconfigured response cannot redirect the Applicant off the site.
 */
async function readJourneyHref(
  response: Response,
): Promise<string | undefined> {
  let document: unknown
  try {
    document = await response.json()
  } catch {
    return undefined
  }
  const resource = (document as SessionDocumentShape | null)?.data
  const href = resource?.attributes?.href
  if (
    resource?.type !== 'applicant-sessions' ||
    typeof href !== 'string' ||
    !isSafeJourneyPath(href)
  ) {
    return undefined
  }
  return href
}

/** Loose view of the response used only to read it defensively. */
interface SessionDocumentShape {
  data?: { type?: unknown; attributes?: { href?: unknown } }
}
