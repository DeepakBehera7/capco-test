import { describe, expect, it } from 'vitest'

import { rateLimitMessage } from './-account-access-ui'

describe('rateLimitMessage', () => {
  it.each([
    [undefined, 'Too many attempts. Wait a few minutes, then try again.'],
    [1, 'Too many attempts. Try again in 1 second.'],
    [45, 'Too many attempts. Try again in 45 seconds.'],
    [60, 'Too many attempts. Try again in 1 minute.'],
    [61, 'Too many attempts. Try again in 2 minutes.'],
  ])('formats %s seconds', (seconds, message) => {
    expect(rateLimitMessage(seconds)).toBe(message)
  })
})
