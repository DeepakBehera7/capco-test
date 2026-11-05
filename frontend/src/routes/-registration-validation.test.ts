import { describe, expect, it } from 'vitest'

import {
  hasRegistrationErrors,
  validateRegistration,
} from './-registration-validation'

const valid = {
  email: 'ada@example.com',
  password: 'Secret!',
  confirmPassword: 'Secret!',
}

describe('validateRegistration', () => {
  it('accepts values that meet the API contract', () => {
    const errors = validateRegistration(valid)

    expect(errors).toEqual({})
    expect(hasRegistrationErrors(errors)).toBe(false)
  })

  it('accepts the shortest password the policy allows', () => {
    expect(
      validateRegistration({
        ...valid,
        password: 'Abcde!',
        confirmPassword: 'Abcde!',
      }),
    ).toEqual({})
  })

  it('ignores surrounding whitespace in the email address', () => {
    expect(
      validateRegistration({ ...valid, email: '  ada@example.com ' }),
    ).toEqual({})
  })

  it('requires every field', () => {
    expect(
      validateRegistration({ email: ' ', password: '', confirmPassword: '' }),
    ).toEqual({
      email: 'Enter your email address.',
      password: 'Enter a password.',
      confirmPassword: 'Confirm your password.',
    })
  })

  it.each(['ada', 'ada@example', 'ada@@example.com', 'a da@example.com'])(
    'rejects the malformed email %s',
    (email) => {
      expect(validateRegistration({ ...valid, email }).email).toMatch(
        /correct format/,
      )
    },
  )

  it('lists every unmet password requirement', () => {
    expect(
      validateRegistration({
        ...valid,
        password: 'abc',
        confirmPassword: 'abc',
      }).password,
    ).toBe(
      'Password must contain at least 6 characters, an uppercase letter and a special character.',
    )
  })

  it.each([
    ['Abcdef1', 'a special character'],
    ['abcdef!', 'an uppercase letter'],
    ['Abc!', 'at least 6 characters'],
  ])('rejects %s because it lacks %s', (password, requirement) => {
    expect(
      validateRegistration({ ...valid, password, confirmPassword: password })
        .password,
    ).toBe(`Password must contain ${requirement}.`)
  })

  it('requires the confirmation to match the password', () => {
    expect(
      validateRegistration({ ...valid, confirmPassword: 'Secret?' }),
    ).toEqual({ confirmPassword: 'Passwords do not match.' })
  })
})
