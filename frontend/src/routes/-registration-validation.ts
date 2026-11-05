/**
 * Client-side registration rules. They mirror the contract for
 * `POST /api/v1/applicant-accounts` so applicants get feedback before a
 * round trip; the API remains the source of truth and its field errors are
 * shown when they disagree.
 */
export interface RegistrationValues {
  email: string
  password: string
  confirmPassword: string
}

export type RegistrationField = keyof RegistrationValues

export type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>

/** Display and focus order of the registration fields. */
export const registrationFields: readonly RegistrationField[] = [
  'email',
  'password',
  'confirmPassword',
]

export const passwordRequirements =
  'Use at least 6 characters, including one uppercase letter and one special character, such as ! or #.'

const minimumPasswordLength = 6
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uppercasePattern = /\p{Lu}/u
const specialCharacterPattern = /[^\p{L}\p{Nd}]/u

export function validateRegistration(
  values: RegistrationValues,
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {}

  const email = values.email.trim()
  if (email === '') {
    errors.email = 'Enter your email address.'
  } else if (!emailPattern.test(email)) {
    errors.email =
      'Enter an email address in the correct format, like name@example.com.'
  }

  if (values.password === '') {
    errors.password = 'Enter a password.'
  } else {
    const missing = missingPasswordRequirements(values.password)
    if (missing.length > 0) {
      errors.password = `Password must contain ${joinRequirements(missing)}.`
    }
  }

  if (values.confirmPassword === '') {
    errors.confirmPassword = 'Confirm your password.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  return errors
}

export function hasRegistrationErrors(errors: RegistrationFieldErrors) {
  return registrationFields.some((field) => errors[field] !== undefined)
}

function missingPasswordRequirements(password: string): string[] {
  const missing: string[] = []
  if (password.length < minimumPasswordLength) {
    missing.push(`at least ${minimumPasswordLength} characters`)
  }
  if (!uppercasePattern.test(password)) {
    missing.push('an uppercase letter')
  }
  if (!specialCharacterPattern.test(password)) {
    missing.push('a special character')
  }
  return missing
}

function joinRequirements(items: string[]): string {
  if (items.length <= 1) {
    return items.join('')
  }
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
