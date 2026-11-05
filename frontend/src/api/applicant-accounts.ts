import {
  fieldErrorsByPointer,
  parseRetryAfter,
  postJsonApi,
  readJsonApiErrors,
} from './json-api'

export const applicantAccountsPath = '/api/v1/applicant-accounts'

export interface ApplicantCredentials {
  email: string
  password: string
}

export type CredentialField = keyof ApplicantCredentials

/** JSON pointers of the credential attributes, shared by sign-up and sign-in. */
export const credentialPointers: Readonly<Record<string, CredentialField>> = {
  '/data/attributes/email': 'email',
  '/data/attributes/password': 'password',
}

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

/** Registers an Applicant account. Registration never signs the user in. */
export async function createApplicantAccount(
  credentials: ApplicantCredentials,
): Promise<RegistrationResult> {
  const response = await postJsonApi(applicantAccountsPath, {
    data: {
      type: 'applicant-accounts',
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
    case 201:
      return { kind: 'created' }
    case 400: {
      const fieldErrors = fieldErrorsByPointer(
        await readJsonApiErrors(response),
        credentialPointers,
      )
      // A 400 without field pointers (for example a malformed document) is a
      // client defect the applicant cannot correct, so it is unexpected.
      return Object.keys(fieldErrors).length > 0
        ? { kind: 'invalid', fieldErrors }
        : { kind: 'unexpected' }
    }
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
