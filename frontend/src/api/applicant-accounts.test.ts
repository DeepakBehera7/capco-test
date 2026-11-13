import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import {
  applicantAccountsPath,
  createApplicantAccount,
} from './applicant-accounts'
import { jsonApiMediaType } from './json-api'

const credentials = { email: 'ada@example.com', password: 'Secret!' }

function errorResponse(
  status: number,
  errors: object[],
  headers: Record<string, string> = {},
) {
  return HttpResponse.json(
    { errors },
    { status, headers: { 'Content-Type': jsonApiMediaType, ...headers } },
  )
}

function respondWith(resolver: () => Response) {
  server.use(http.post(applicantAccountsPath, resolver))
}

describe('createApplicantAccount', () => {
  it('sends a JSON:API applicant-accounts document', async () => {
    let request: Request | undefined
    server.use(
      http.post(applicantAccountsPath, ({ request: received }) => {
        request = received.clone()
        return new HttpResponse(null, {
          status: 201,
          headers: { Location: '/api/v1/applicant-accounts/1' },
        })
      }),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'created',
    })
    expect(request?.headers.get('Content-Type')).toBe(jsonApiMediaType)
    expect(request?.headers.get('Accept')).toBe(jsonApiMediaType)
    expect(await request?.json()).toEqual({
      data: {
        type: 'applicant-accounts',
        attributes: credentials,
      },
    })
  })

  it('maps field validation errors by JSON pointer', async () => {
    respondWith(() =>
      errorResponse(400, [
        {
          status: '400',
          code: 'validation-failed',
          title: 'Invalid attribute',
          detail: 'Enter a valid email address.',
          source: { pointer: '/data/attributes/email' },
        },
        {
          status: '400',
          code: 'validation-failed',
          title: 'Invalid attribute',
          detail: 'Use at least 6 characters.',
          source: { pointer: '/data/attributes/password' },
        },
      ]),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'invalid',
      fieldErrors: {
        email: 'Enter a valid email address.',
        password: 'Use at least 6 characters.',
      },
    })
  })

  it('treats a 400 without field pointers as unexpected', async () => {
    respondWith(() =>
      errorResponse(400, [
        {
          status: '400',
          code: 'malformed-document',
          title: 'Malformed JSON:API document',
          detail: 'The request body is not a valid JSON:API document.',
        },
      ]),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'unexpected',
    })
  })

  it('reports an already registered email', async () => {
    respondWith(() =>
      errorResponse(409, [
        {
          status: '409',
          code: 'email-already-registered',
          title: 'Account conflict',
          detail: 'An account already exists for this email address.',
        },
      ]),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'email-taken',
    })
  })

  it('reports rate limiting with the Retry-After delay', async () => {
    respondWith(() =>
      errorResponse(
        429,
        [
          {
            status: '429',
            code: 'rate-limited',
            title: 'Too many requests',
            detail: 'Too many attempts. Try again later.',
          },
        ],
        { 'Retry-After': '30' },
      ),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 30,
    })
  })

  it('ignores an unusable Retry-After header', async () => {
    respondWith(() => errorResponse(429, [], { 'Retry-After': 'soon' }))

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: undefined,
    })
  })

  it('reports network failures', async () => {
    respondWith(() => HttpResponse.error())

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'network-error',
    })
  })

  it.each([406, 415, 500, 503])(
    'reports status %i as unexpected',
    async (status) => {
      respondWith(() => errorResponse(status, []))

      await expect(createApplicantAccount(credentials)).resolves.toEqual({
        kind: 'unexpected',
      })
    },
  )

  it('treats a non-JSON error body as unexpected', async () => {
    respondWith(
      () => new HttpResponse('<html>Bad gateway</html>', { status: 400 }),
    )

    await expect(createApplicantAccount(credentials)).resolves.toEqual({
      kind: 'unexpected',
    })
  })
})
