import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import {
  applicantSessionsPath,
  createApplicantSession,
} from './-applicant-sessions-api'
import { jsonApiMediaType } from './-json-api'

const credentials = { email: 'ada@example.com', password: 'Secret!' }

function jsonApiResponse(
  status: number,
  body: object,
  headers: Record<string, string> = {},
) {
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': jsonApiMediaType, ...headers },
  })
}

function sessionDocument(href: unknown) {
  return {
    data: {
      type: 'applicant-sessions',
      id: '7f2c1e8a-1d4b-4a8e-9c35-0a1b2c3d4e5f',
      attributes: { href },
    },
  }
}

function respondWith(resolver: () => Response) {
  server.use(http.post(applicantSessionsPath, resolver))
}

describe('createApplicantSession', () => {
  it('sends a JSON:API applicant-sessions document and returns the journey', async () => {
    let request: Request | undefined
    server.use(
      http.post(applicantSessionsPath, ({ request: received }) => {
        request = received.clone()
        return jsonApiResponse(
          201,
          sessionDocument('/applications/42/personal-details'),
        )
      }),
    )

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'signed-in',
      journeyHref: '/applications/42/personal-details',
    })
    expect(request?.headers.get('Content-Type')).toBe(jsonApiMediaType)
    expect(request?.headers.get('Accept')).toBe(jsonApiMediaType)
    expect(request?.credentials).toBe('same-origin')
    expect(await request?.json()).toEqual({
      data: { type: 'applicant-sessions', attributes: credentials },
    })
  })

  it.each([
    ['an external URL', 'https://evil.example/applications/1'],
    ['a protocol-relative URL', '//evil.example/applications/1'],
    ['a path outside the journey', '/reviewer/applications'],
    ['a missing href', undefined],
  ])('treats %s as unexpected', async (_case, href) => {
    respondWith(() => jsonApiResponse(201, sessionDocument(href)))

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'unexpected',
    })
  })

  it('treats a success response without a JSON body as unexpected', async () => {
    respondWith(() => new HttpResponse('ok', { status: 201 }))

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'unexpected',
    })
  })

  it('reports rejected credentials without detail', async () => {
    respondWith(() =>
      jsonApiResponse(401, {
        errors: [
          {
            status: '401',
            code: 'invalid-credentials',
            title: 'Authentication failed',
            detail: 'Invalid email or password',
          },
        ],
      }),
    )

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'invalid-credentials',
    })
  })

  it('maps field validation errors by JSON pointer', async () => {
    respondWith(() =>
      jsonApiResponse(400, {
        errors: [
          {
            status: '400',
            code: 'validation-failed',
            title: 'Invalid attribute',
            detail: 'Enter a valid email address.',
            source: { pointer: '/data/attributes/email' },
          },
        ],
      }),
    )

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'invalid',
      fieldErrors: { email: 'Enter a valid email address.' },
    })
  })

  it('treats a malformed-document error as unexpected', async () => {
    respondWith(() =>
      jsonApiResponse(400, {
        errors: [
          {
            status: '400',
            code: 'malformed-document',
            title: 'Malformed JSON:API document',
            detail: 'The request body is not a valid JSON:API document.',
          },
        ],
      }),
    )

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'unexpected',
    })
  })

  it('passes on the Retry-After delay when rate limited', async () => {
    respondWith(() =>
      jsonApiResponse(429, { errors: [] }, { 'Retry-After': '120' }),
    )

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 120,
    })
  })

  it('reports a network failure', async () => {
    respondWith(() => HttpResponse.error())

    await expect(createApplicantSession(credentials)).resolves.toEqual({
      kind: 'network-error',
    })
  })

  it.each([406, 415, 500, 503])(
    'treats status %i as unexpected',
    async (status) => {
      respondWith(() => jsonApiResponse(status, { errors: [] }))

      await expect(createApplicantSession(credentials)).resolves.toEqual({
        kind: 'unexpected',
      })
    },
  )
})
